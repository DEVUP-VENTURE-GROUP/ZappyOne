/**
 * Automatic surge — repairs, pet care visits and helping, across Telangana.
 *
 * Nobody switches it on per day: admin sets the limits once (Economics →
 * Surge, PricingConfig.surgeAuto) and this decides every minute, per ~1 km zone.
 *
 *   zones     H3 hexagons, resolution 8 (~0.7 km²). A zone's "area" is it and
 *             its six neighbours (~2 km across), so a border never splits a crowd.
 *   demand    searches (price quotes) and bookings for a service line in the
 *             area over the last 15 min; one per person per zone per 10 min.
 *   supply    providers approved for that line, online now, free (or finishing
 *             a job) and standing in the area; shops count where they are.
 *   busy      demand ÷ supply → 1.0 / 1.1 / 1.2 / 1.3 …, capped at
 *             maxMultiplier, moving at most STEP a minute (no flicker).
 *   lines     each reason its own line, so the customer sees why:
 *               busy area  base × (multiplier − 1)        ┐ together never
 *               peak hours admin's peak ranges (existing) │ above ceilingPaise
 *               weekend    admin's weekend rule (existing)┘
 *               rain       flat, only when the weather feed says rain (jobs/weather)
 *               night      flat, nightStartHour–nightEndHour IST
 *             and the whole extra never above the base itself (≤ 2× price).
 *   lock      a quote holds for lockMinutes; the booking pays what was shown.
 *   money     a separate line on the booking (like boost): paid with it, split at
 *             settlement — providerSharePct to the provider, the rest ZappyOne's.
 *   data      every quote is logged with what was shown and whether they booked:
 *             the training data for the demand forecast and price model later.
 *
 * Fallbacks — when in doubt, no charge:
 *   off / kill switch / line not enabled / not a visit   → no surge
 *   Redis down, value stale (> STALE_SEC)                → busy 1.0
 *   too little demand (< minDemand)                      → busy 1.0
 *   nobody approved nearby (supply 0)                    → busy 1.0 (price cannot make supply)
 *   weather unknown or sources disagree                  → no rain line
 *   lock expired and the price moved                     → SURGE_CHANGED: show, then book
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const h3 = require('h3-js');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const RES = 8;
const WINDOW_MIN = 15;
const BUCKET_MIN = 5;
const STEP = 0.05;          // per minute
const STALE_SEC = 180;
const RATIO_STEPS = [[1, 1.0], [2, 1.1], [3, 1.2], [5, 1.3], [Infinity, 1.5]];

const r = () => require('../../config/redis');
const k = (s) => r().scoped(`surge:${s}`);
const ist = (d = new Date()) => new Date(d.getTime() + 330 * 60000);
const istHour = (d) => ist(d).getUTCHours();

const zoneOf = (lat, lng) => {
  try { return h3.latLngToCell(lat, lng, RES); } catch { return `${lat.toFixed(2)}:${lng.toFixed(2)}`; }
};
const areaOf = (zone) => {
  try { return h3.gridDisk(zone, 1); } catch { return [zone]; }
};
const bucketOf = (ms) => Math.floor(ms / (BUCKET_MIN * 60000));

/* The log: what was shown, and whether they booked — the model's training rows */
const logSchema = new mongoose.Schema({
  quoteId: { type: String, index: true },
  line: String,
  zone: String,
  hour: Number,
  dow: Number,
  rain: Boolean,
  demand: Number,
  supply: Number,
  multiplier: Number,
  basePaise: Number,
  surgePaise: Number,
  lines: [{ _id: false, kind: String, paise: Number }],
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  booked: { type: Boolean, default: false },
  bookingKind: String,
  bookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  at: { type: Date, default: Date.now, index: true },
}, { versionKey: false });
logSchema.index({ at: 1 }, { expireAfterSeconds: 400 * 86400 });
const SurgeQuote = mongoose.models.SurgeQuote || mongoose.model('SurgeQuote', logSchema);

async function settings() {
  const cfg = await require('../pricing/services/config.service').getActiveConfig();
  const { SURGE_DEFAULTS } = require('../pricing/services/config.service');
  return { s: { ...SURGE_DEFAULTS, ...(cfg.surgeAuto || {}) }, cfg };
}

const lineOn = (s, line) => s.enabled && !s.killSwitch && !!line && (!s.lines?.length || s.lines.includes(line));

/** Does someone travel to the customer? Surge is the price of getting someone there. */
function isVisit(kind, b) {
  if (kind === 'repair') return b.serviceMode !== 'workshop';
  if (kind === 'pet') return !['provider_location', 'boarding', 'daycare'].includes(b.serviceMode);
  return kind === 'helping';
}

/* Demand */

/** A search or a booking for this line here. One per person per zone per 10 min. */
async function recordDemand({ line, lat, lng, userId = null }) {
  if (!line || typeof lat !== 'number') return;
  try {
    const zone = zoneOf(lat, lng);
    const { redis } = r();
    if (userId) {
      const fresh = await redis.set(k(`seen:${line}:${zone}:${userId}`), '1', 'EX', 600, 'NX');
      if (!fresh) return;
    }
    const b = k(`d:${line}:${zone}:${bucketOf(Date.now())}`);
    await redis.multi().incr(b).expire(b, (WINDOW_MIN + BUCKET_MIN) * 60)
      .zadd(k('active'), Date.now(), `${line}|${zone}`).exec();
    // The durable history the heatmap already reads (analytics/demand-event).
    require('../analytics/demand-event.model').create({ lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)), service: line, bucket: zone }).catch(() => {});
  } catch (e) { logger.warn({ err: e.message }, '[surge] demand not recorded'); }
}

async function demandIn(line, zones) {
  const { redis } = r();
  const now = bucketOf(Date.now());
  const keys = [];
  for (const z of zones) for (let i = 0; i < WINDOW_MIN / BUCKET_MIN; i += 1) keys.push(k(`d:${line}:${z}:${now - i}`));
  const vals = await redis.mget(keys);
  return vals.reduce((a, v) => a + (Number(v) || 0), 0);
}

/* Supply: who can come, per zone, for one line */

async function supplyByZone(line) {
  const { approvedProviders } = require('../onboarding/eligibility');
  const providers = await approvedProviders(line);
  const workerIds = providers.filter((p) => p.kind === 'worker').map((p) => p.id);
  const shopIds = providers.filter((p) => p.kind === 'shop').map((p) => p.id);
  const [live, load, workers, shops] = await Promise.all([
    require('../worker/presence').liveIds(workerIds),
    require('./workload').classify(workerIds),
    require('../worker/worker.model').find({ _id: { $in: workerIds } }).select('currentLocation').lean(),
    require('../shop/shop.model').find({ _id: { $in: shopIds }, isActive: { $ne: false } }).select('address.location').lean(),
  ]);
  const count = new Map();
  const add = (c) => { if (c?.length === 2 && (c[0] || c[1])) { const z = zoneOf(c[1], c[0]); count.set(z, (count.get(z) || 0) + 1); } };
  for (const w of workers) {
    const id = String(w._id);
    if (live.has(id) && (load.free.has(id) || load.busy.has(id))) add(w.currentLocation?.coordinates);
  }
  for (const s of shops) add(s.address?.location?.coordinates);
  return count;
}

const stepFor = (ratio) => RATIO_STEPS.find(([upTo]) => ratio < upTo)[1];

/* The minute tick */

/** Every minute: recompute every zone where someone searched or booked lately. */
async function tick({ now = Date.now() } = {}) {
  const { s } = await settings();
  const { redis } = r();
  await redis.zremrangebyscore(k('active'), 0, now - WINDOW_MIN * 60000);
  if (!s.enabled || s.killSwitch) return { zones: 0, off: true };
  const active = await redis.zrangebyscore(k('active'), now - WINDOW_MIN * 60000, '+inf');
  const byLine = new Map();
  for (const m of active) {
    const [line, zone] = m.split('|');
    if (!lineOn(s, line)) continue;
    if (!byLine.has(line)) byLine.set(line, new Set());
    byLine.get(line).add(zone);
  }
  const snapshot = [];
  const points = [];
  for (const [line, zones] of byLine) {
    const supply = await supplyByZone(line).catch(() => new Map());
    for (const zone of zones) {
      const area = areaOf(zone);
      const demand = await demandIn(line, area);
      const have = area.reduce((a, z) => a + (supply.get(z) || 0), 0);
      // Too little evidence, or nobody to pull in: no busy surge.
      const target = demand < s.minDemand || have === 0 ? 1.0 : Math.min(stepFor(demand / have), s.maxMultiplier);
      const prevRaw = await redis.get(k(`v:${line}:${zone}`));
      const prev = prevRaw ? JSON.parse(prevRaw).multiplier : 1.0;
      const next = Math.round((target > prev ? Math.min(target, prev + STEP) : Math.max(target, prev - STEP)) * 100) / 100;
      const v = { multiplier: next, target, demand, supply: have, at: now, noSupply: have === 0 && demand > 0 };
      await redis.set(k(`v:${line}:${zone}`), JSON.stringify(v), 'EX', STALE_SEC);
      let center = null;
      try { center = h3.cellToLatLng(zone); } catch { /* fallback zone ids have no centre */ }
      if (center) points.push(center);
      snapshot.push({ line, zone, ...v, lat: center?.[0] ?? null, lng: center?.[1] ?? null });
    }
  }
  await redis.set(k('snapshot'), JSON.stringify({ at: now, zones: snapshot }), 'EX', 600);
  await redis.set(k('points'), JSON.stringify(points.slice(0, 200)), 'EX', 1800);
  return { zones: snapshot.length };
}

/** Every 10 minutes: weather where people are booking (jobs/weather). */
async function pollWeather() {
  const raw = await r().redis.get(k('points')).catch(() => null);
  const points = raw ? JSON.parse(raw) : [];
  return points.length ? require('./weather').poll(points) : { areas: 0 };
}

/* Pricing */

/** The current busy multiplier for a line here, 1.0 when stale or unknown. */
async function busyNow(line, zone) {
  try {
    const raw = await r().redis.get(k(`v:${line}:${zone}`));
    if (!raw) return { multiplier: 1.0, demand: 0, supply: 0 };
    const v = JSON.parse(raw);
    return Date.now() - v.at > STALE_SEC * 1000 ? { multiplier: 1.0, demand: v.demand, supply: v.supply } : v;
  } catch { return { multiplier: 1.0, demand: 0, supply: 0 }; }
}

/** The reasons right now (multipliers and flat fees), independent of the price they apply to. */
async function factorsNow({ line, lat, lng, at = new Date() }) {
  const { s, cfg } = await settings();
  const zone = zoneOf(lat, lng);
  const busy = await busyNow(line, zone);
  const h = istHour(at);
  const dow = ist(at).getUTCDay();
  const night = s.nightStartHour > s.nightEndHour ? (h >= s.nightStartHour || h < s.nightEndHour) : (h >= s.nightStartHour && h < s.nightEndHour);
  const peak = cfg.peakHourSurchargeEnabled && Array.isArray(cfg.peakHourRanges)
    ? cfg.peakHourRanges.find((p) => h >= p.startHour && h < p.endHour && p.multiplier > 1) : null;
  const weekend = cfg.weekendSurchargeEnabled && (dow === 0 || dow === 6) && (cfg.weekendSurchargeMultiplier || 1) > 1;
  const rain = await require('./weather').isRaining(lat, lng);
  return {
    zone, hour: h, dow, demand: busy.demand, supply: busy.supply,
    busy: Math.min(busy.multiplier, s.maxMultiplier),
    peak: peak ? { m: peak.multiplier, label: peak.label || 'Peak hours' } : null,
    weekend: weekend ? cfg.weekendSurchargeMultiplier : null,
    rainPaise: rain ? s.rainPaise : 0,
    nightPaise: night ? s.nightPaise : 0,
    rain,
  };
}

/** The lines and amounts for a base price, from a set of factors. */
function linesFor(base, f, s) {
  const pct = [];
  if (f.busy > 1) pct.push({ type: 'busy', label: 'High demand nearby', reason: 'More bookings than pros nearby right now', paise: base * (f.busy - 1) });
  if (f.peak) pct.push({ type: 'peak', label: f.peak.label, reason: 'A busy time of day', paise: base * (f.peak.m - 1) });
  if (f.weekend) pct.push({ type: 'weekend', label: 'Weekend', reason: 'Weekends are in demand', paise: base * (f.weekend - 1) });
  // Busy, peak and weekend together never above the ceiling: scaled down evenly.
  const sum = pct.reduce((a, l) => a + l.paise, 0);
  const scale = sum > s.ceilingPaise ? s.ceilingPaise / sum : 1;
  const lines = pct.map((l) => ({ ...l, paise: Math.round(l.paise * scale) })).filter((l) => l.paise >= 100);
  if (f.rainPaise) lines.push({ type: 'rain', label: 'Raining', reason: 'Pros travel in the rain to reach you', paise: f.rainPaise });
  if (f.nightPaise) lines.push({ type: 'night', label: 'Late night', reason: `Between ${s.nightStartHour}:00 and ${s.nightEndHour}:00`, paise: f.nightPaise });
  // Never more than the price itself (≤ 2× in all).
  let total = lines.reduce((a, l) => a + l.paise, 0);
  if (base > 0 && total > base) {
    const cut = base / total;
    for (const l of lines) l.paise = Math.round(l.paise * cut);
    total = lines.reduce((a, l) => a + l.paise, 0);
  }
  return { lines, total };
}

/**
 * A quote for a price screen: the lines, and a lock that holds them.
 * Records the search as demand. Never throws: a failure is "no surge".
 */
async function quote({ kind, line, lat, lng, basePaise = 0, userId = null, visit = true }) {
  const none = { quoteId: null, lines: [], totalPaise: 0, multiplier: 1 };
  try {
    if (typeof lat !== 'number' || typeof lng !== 'number') return none;
    recordDemand({ line, lat, lng, userId }).catch(() => {});
    const { s } = await settings();
    if (!lineOn(s, line) || !visit) return none;
    const f = await factorsNow({ line, lat, lng });
    const { lines, total } = linesFor(Math.max(0, basePaise), f, s);
    const quoteId = crypto.randomBytes(9).toString('base64url');
    const expiresAt = new Date(Date.now() + s.lockMinutes * 60000);
    // The lock keeps exactly what was shown, so the booking charges exactly that.
    await r().redis.set(k(`lock:${quoteId}`), JSON.stringify({ line, f, basePaise, lines, total, userId: userId ? String(userId) : null, expiresAt }), 'EX', s.lockMinutes * 60);
    SurgeQuote.create({
      quoteId, line, zone: f.zone, hour: f.hour, dow: f.dow, rain: f.rain, demand: f.demand, supply: f.supply,
      multiplier: f.busy, basePaise, surgePaise: total, lines: lines.map((l) => ({ kind: l.type, paise: l.paise })), userId,
    }).catch(() => {});
    return { quoteId, lines, totalPaise: total, multiplier: f.busy, expiresAt, kind };
  } catch (e) {
    logger.warn({ err: e.message, line }, '[surge] quote fell back to none');
    return none;
  }
}

/** The price a booking's surge applies to: the service, never parts bought for the customer or tax. */
function baseOf(kind, b) {
  if (kind === 'repair') return b.priceSnapshot?.subtotalPaise || 0;
  if (kind === 'pet') return Math.max(0, (b.pricing?.totalPaise || 0) - (b.pricing?.taxPaise || 0) - (b.pricing?.platformFeePaise || 0));
  if (kind === 'helping') return Math.max(0, (b.charge?.serviceChargePaise || 0) - (b.charge?.taxPaise || 0) - (b.charge?.platformFeePaise || 0));
  return 0;
}

async function lockOf(quoteId, line, userId) {
  if (!quoteId) return null;
  const raw = await r().redis.get(k(`lock:${quoteId}`)).catch(() => null);
  const lock = raw ? JSON.parse(raw) : null;
  return lock && lock.line === line && (!lock.userId || lock.userId === String(userId)) ? lock : null;
}

/**
 * Before a booking is made: the customer's quote has run out and a surge
 * applies now → refuse with SURGE_CHANGED and a fresh quote, so they see the
 * new price before anything is booked. `body` is the booking request (the same
 * field names as the booking). Never throws for anything else.
 */
async function precheck({ kind, body, userId, quoteId = null }) {
  if (!quoteId) return;
  let fresh = null; let active = false;
  try {
    const line = await KINDS[kind].line(body);
    const at = KINDS[kind].open?.start?.(body);
    const { s } = await settings();
    if (!line || !at || !isVisit(kind, body) || !lineOn(s, line)) return;
    if (await lockOf(quoteId, line, userId)) return;
    const f = await factorsNow({ line, lat: at.lat, lng: at.lng });
    active = f.busy > 1 || !!f.peak || !!f.weekend || f.rainPaise > 0 || f.nightPaise > 0;
    if (active) {
      fresh = await quote({ kind, line, lat: at.lat, lng: at.lng, basePaise: Number(body.surgeBasePaise) || 0, userId });
    }
  } catch (e) {
    logger.warn({ err: e.message, kind }, '[surge] precheck skipped');
    return;
  }
  // A reason applies now and what they saw has gone: they see the new price first.
  if (active) {
    throw Object.assign(new Error('Prices changed while you were deciding. Check the new total and book again.'), {
      status: 409, code: 'SURGE_CHANGED', surge: fresh,
    });
  }
}

/**
 * Freeze the surge onto a booking just made: the customer's lock when it is
 * theirs and held, otherwise the factors now. Returns the surge set, or null.
 * Never throws: a failure is a booking without surge.
 */
async function attach(kind, booking, { quoteId = null, userId } = {}) {
  try {
    const doc = booking?.toObject ? booking.toObject() : booking;
    const line = await KINDS[kind].line(doc);
    const at = KINDS[kind].open?.start?.(doc);
    if (!line || !at || !isVisit(kind, doc)) return null;
    const { s } = await settings();
    if (!lineOn(s, line)) return null;
    recordDemand({ line, lat: at.lat, lng: at.lng, userId }).catch(() => {});
    const lock = await lockOf(quoteId, line, userId);
    const f = lock ? lock.f : await factorsNow({ line, lat: at.lat, lng: at.lng });
    const base = baseOf(kind, doc);
    // What they were shown, when it was quoted on (about) this price; a much
    // lower quoted price is not this booking's, so it is worked out again.
    const { lines, total } = lock?.lines && lock.basePaise >= base * 0.8 ? { lines: lock.lines, total: lock.total } : linesFor(base, f, s);
    if (!total) { markBooked(quoteId, kind, doc._id); return null; }
    const providerPaise = Math.round((total * s.providerSharePct) / 100);
    const surge = {
      paise: total, lines, multiplier: f.busy, zone: f.zone, line,
      providerPaise, platformPaise: total - providerPaise, quoteId: quoteId || '', settledAt: null,
    };
    const res = await KINDS[kind].model().updateOne({ _id: doc._id, 'surge.paise': { $exists: false } }, { $set: { surge } });
    markBooked(quoteId, kind, doc._id);
    return res.modifiedCount ? surge : null;
  } catch (e) {
    logger.warn({ err: e.message, kind }, '[surge] not attached');
    return null;
  }
}

/** Link the training row to the booking once it has an id. */
function markBooked(quoteId, kind, bookingId) {
  if (quoteId) SurgeQuote.updateOne({ quoteId }, { $set: { booked: true, bookingKind: kind, bookingId } }).catch(() => {});
}

const surgePaise = (doc) => (doc?.surge?.paise > 0 ? doc.surge.paise : 0);
/** What the provider takes home from the surge (for earnings and offers). */
const providerSurgePaise = (doc) => (doc?.surge?.paise > 0 ? doc.surge.providerPaise || 0 : 0);

/**
 * The booking settled: split the surge. Online, ZappyOne holds it, pays the
 * provider their share and books its own; cash, the provider holds it all and
 * owes ZappyOne its share (wallet, like cash commission). Once per booking.
 */
async function settleSurge(kind, bookingId) {
  const Model = KINDS[kind]?.model();
  if (!Model) return null;
  const doc = await Model.findOneAndUpdate(
    { _id: bookingId, 'surge.paise': { $gt: 0 }, 'surge.settledAt': null },
    { $set: { 'surge.settledAt': new Date() } },
    { new: true },
  ).lean();
  if (!doc) return null;
  const Transaction = require('../payment/transaction.model');
  const wallet = require('../wallet/wallet.service');
  const { providerPaise, platformPaise } = doc.surge;
  const ref = doc.reference || String(doc._id);
  const ignoreDup = (e) => { if (e.code !== 11000) throw e; };
  const cash = doc.paymentMethod === 'cash';

  if (cash && platformPaise > 0) {
    if (doc.workerId && !doc.shopId) {
      await wallet.apply({
        kind: 'worker', id: doc.workerId, type: 'debit', amountPaise: platformPaise, allowDebt: true,
        reason: Transaction.REASONS.PLATFORM_COMMISSION, idempotencyKey: `surge:cash_share:${kind}:${doc._id}`,
        description: `ZappyOne's share of the surge on cash ${ref}`,
      });
    } else if (doc.shopId) {
      await Transaction.create({
        type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -platformPaise, reason: Transaction.REASONS.SURGE_REVENUE,
        idempotencyKey: `surge:cash_share_due:${kind}:${doc._id}`, description: `Surge share due on cash ${ref}`,
        metadata: { shopId: String(doc.shopId), bookingId: String(doc._id), cash: true }, status: 'succeeded',
      }).catch(ignoreDup);
    }
  }
  if (!cash && providerPaise > 0) {
    if (doc.workerId && !doc.shopId) {
      await wallet.apply({
        kind: 'worker', id: doc.workerId, type: 'credit', amountPaise: providerPaise,
        reason: Transaction.REASONS.WORKER_EARNING, idempotencyKey: `surge:provider:${kind}:${doc._id}`,
        description: `Surge on ${ref}`,
      });
    } else if (doc.shopId) {
      await Transaction.create({
        type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: providerPaise, reason: Transaction.REASONS.WORKER_EARNING,
        idempotencyKey: `surge:shop:${kind}:${doc._id}`, description: `Shop earning (surge) — ${kind} ${ref}`,
        metadata: { shopId: String(doc.shopId), bookingId: String(doc._id) }, status: 'succeeded',
      }).catch(ignoreDup);
    }
  }
  // ZappyOne's revenue from it, either way.
  if (platformPaise > 0) {
    await Transaction.create({
      type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: platformPaise, reason: Transaction.REASONS.SURGE_REVENUE,
      idempotencyKey: `surge:platform:${kind}:${doc._id}`, description: `Surge revenue — ${kind} ${ref}`,
      metadata: { source: kind, bookingId: String(doc._id), lines: doc.surge.lines.map((l) => l.type), ...(cash ? { cash: true } : {}) }, status: 'succeeded',
    }).catch(ignoreDup);
  }
  return { providerPaise, platformPaise };
}

/* Admin */

async function zones() {
  const raw = await r().redis.get(k('snapshot')).catch(() => null);
  const snap = raw ? JSON.parse(raw) : { at: null, zones: [] };
  return { ...snap, zones: snap.zones.sort((a, b) => b.multiplier - a.multiplier || b.demand - a.demand) };
}

/** Last N days: what surge earned, how often it showed, and whether people still booked. */
async function report({ days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400e3);
  const [byLine] = await Promise.all([
    SurgeQuote.aggregate([
      { $match: { at: { $gte: since } } },
      { $group: {
        _id: { line: '$line', surged: { $gt: ['$surgePaise', 0] } },
        quotes: { $sum: 1 }, booked: { $sum: { $cond: ['$booked', 1, 0] } }, surgePaise: { $sum: { $cond: ['$booked', '$surgePaise', 0] } },
      } },
    ]),
  ]);
  const rows = {};
  for (const g of byLine) {
    const row = rows[g._id.line] ||= { line: g._id.line, quotes: 0, surgedQuotes: 0, bookedPlain: 0, plainQuotes: 0, bookedSurged: 0, surgePaise: 0 };
    row.quotes += g.quotes;
    if (g._id.surged) { row.surgedQuotes += g.quotes; row.bookedSurged += g.booked; row.surgePaise += g.surgePaise; } else { row.plainQuotes += g.quotes; row.bookedPlain += g.booked; }
  }
  const lines = Object.values(rows).map((row) => ({
    ...row,
    conversionPlain: row.plainQuotes ? Math.round((row.bookedPlain / row.plainQuotes) * 100) : null,
    conversionSurged: row.surgedQuotes ? Math.round((row.bookedSurged / row.surgedQuotes) * 100) : null,
  }));
  const Transaction = require('../payment/transaction.model');
  const rev = await Transaction.aggregate([
    { $match: { reason: Transaction.REASONS.SURGE_REVENUE, amountPaise: { $gt: 0 }, createdAt: { $gte: since } } },
    { $group: { _id: null, paise: { $sum: '$amountPaise' } } },
  ]);
  return { days, lines, zappyRevenuePaise: rev[0]?.paise || 0 };
}

module.exports = {
  zoneOf, recordDemand, tick, pollWeather, quote, precheck, attach, baseOf, markBooked, settleSurge, factorsNow, linesFor,
  surgePaise, providerSurgePaise, zones, report, settings, isVisit, SurgeQuote,
};
