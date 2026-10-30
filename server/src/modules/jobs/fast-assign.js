/**
 * Assigned within three minutes, for every kind of job (repairs, pet care,
 * errands). The waves sweep (jobs/waves, every 10 s) drives the clock; this
 * holds the moves it makes. Timings: Economics → Dispatch (config.service
 * FAST_ASSIGN_DEFAULTS). Nobody is ever given a job instantly.
 *
 *   T+0     ZappyOne staff on duty are rung one at a time (staffRingSec each);
 *           at the same moment every nearby free pro is rung for ringSec,
 *           first to tap Accept wins
 *   +ringSec  rung again, a little wider each round, up to widenKm
 *   T+autoAssignSec  still nobody: the fairest nearby free pro (jobs/fairness)
 *           is given it; then the customer is told and chooses
 *
 * Assigning goes through the same handler a pro's own tap uses, so every rule
 * still applies: dues limit, workload, approval per service, a pet stay's bed.
 */
const logger = require('../../core/logger');
const { haversineKm } = require('../../core/geo/distance');
const { KINDS } = require('./kinds');

const settings = () => require('../pricing/services/config.service').fastAssignSettings();

/** Call a provider-facing handler as that provider; resolves { ok, status, body }. */
function asProvider(handler, who, params) {
  return new Promise((resolve) => {
    const req = { auth: { role: who.kind, sub: String(who.id) }, params, body: {}, query: {}, get: () => null, headers: {} };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ ok: this.statusCode < 400, status: this.statusCode, body }); },
    };
    Promise.resolve(handler(req, res, (err) => resolve({ ok: false, status: err?.status || 500, body: { error: err?.message, code: err?.code } })))
      .catch((err) => resolve({ ok: false, status: 500, body: { error: err.message } }));
  });
}

/** How a pro takes a job of each kind: the same handler as their own tap. */
const TAKE = {
  repair: (who, id) => asProvider(require('../repair/controllers/booking.controller').claimBooking, who, { id: String(id) }),
  pet: (who, id) => asProvider(require('../pet/pet.controller').acceptBooking, who, { id: String(id) }),
  helping: (who, id) => (who.kind === 'worker' ? asProvider(require('../helping/helping.controller').acceptTask, who, { id: String(id) }) : Promise.resolve({ ok: false })),
};

/** Where the job is (the point pros travel to). */
const pointOf = (kind, doc) => require('./kinds').whereOf(kind, doc);

/** Who already passed on it: never auto-given back to them. */
function passersOf(doc) {
  return new Set([
    ...(doc.declines || []).map((d) => String(d.providerId)),
    ...(doc.declinedBy || []).map(String),
    ...(doc.releasedBy || []).map(String),
  ]);
}

/** Pros who could take this job now, fairest first; `anyone` drops the auto-accept switch (the auto-assign at autoAssignSec). */
async function autoAcceptCandidates(kind, doc, radiusKm, { anyone = false } = {}) {
  const at = pointOf(kind, doc);
  const line = await KINDS[kind].line(doc);
  if (!at || !line) return [];
  const approved = await require('../onboarding/eligibility').approvedProviders(line);
  const passed = passersOf(doc);
  for (const id of await require('./customer-block').blockersOf(doc.userId)) passed.add(id);
  const now = new Date();
  const notPaused = anyone ? {} : { 'autoAccept.enabled': true, $or: [{ 'autoAccept.pausedUntil': null }, { 'autoAccept.pausedUntil': { $lte: now } }] };
  const workerIds = approved.filter((p) => p.kind === 'worker' && !passed.has(p.id)).map((p) => p.id);
  const shopIds = kind === 'helping' ? [] : approved.filter((p) => p.kind === 'shop' && !passed.has(p.id)).map((p) => p.id);
  const Worker = require('../worker/worker.model');
  const Shop = require('../shop/shop.model');
  // ZappyOne's own staff on duty take jobs first, with or without the switch (workforce/).
  const onDuty = [...await require('../workforce/staff').onDutyIds(now)].filter((id) => workerIds.includes(id));
  const [workers, shops] = await Promise.all([
    Worker.find({ _id: { $in: workerIds }, isBlocked: { $ne: true }, ...(anyone ? { shopId: null } : { $or: [notPaused, { _id: { $in: onDuty } }] }) }).select('currentLocation autoAccept employment dispatchStats').lean(),
    anyone ? [] : Shop.find({ _id: { $in: shopIds }, ...notPaused }).select(`${require('../shop/shop.service').LIVE_FIELDS} autoAccept dispatchStats`).lean(),
  ]);
  const live = await require('../worker/presence').liveIds(workers.map((w) => w._id));
  const fullShops = await require('../shop/partner.service').atCapacity(shops.map((s) => s._id));
  const { free } = await require('./workload').classify(workers.map((w) => w._id));
  const km = (c) => (c?.length === 2 ? haversineKm(at.lat, at.lng, c[1], c[0]) : null);
  const duty = new Set(onDuty);
  const coverage = require('../workforce/coverage');
  const hubs = duty.size ? await require('../workforce/hub.model').find({ _id: { $in: workers.map((w) => w.employment?.hubId).filter(Boolean) } }).select(coverage.HUB_FIELDS).lean() : [];
  const hubOf = new Map(hubs.map((h) => [String(h._id), h]));
  const fairness = require('./fairness');
  const all = [
    ...workers.filter((w) => live.has(String(w._id)) && free.has(String(w._id)))
      .map((w) => (duty.has(String(w._id))
        // Staff on duty: any job inside their hub's area (drawn, or its radius), whatever this stage's radius.
        ? { kind: 'worker', id: String(w._id), km: km(w.currentLocation?.coordinates), staff: true, hub: hubOf.get(String(w.employment?.hubId)) || null, stats: fairness.statsOf(w) }
        : { kind: 'worker', id: String(w._id), km: km(w.currentLocation?.coordinates), maxKm: w.autoAccept?.maxKm, stats: fairness.statsOf(w) })),
    // A partner at its capacity (shop/partner.service) is offered nothing new until one finishes.
    ...shops.filter(require('../shop/shop.service').isLive).filter((s) => !fullShops.has(String(s._id)))
      .map((s) => ({ kind: 'shop', id: String(s._id), km: km(s.address?.location?.coordinates), maxKm: s.autoAccept?.maxKm, stats: fairness.statsOf(s) })),
  ];
  const reachable = all.filter((p) => (p.staff
    ? (p.hub ? coverage.covers(p.hub, at) : p.km != null && p.km <= radiusKm)
    : p.km != null && p.km <= Math.min(radiusKm, p.maxKm || radiusKm)));
  return fairness.fairOrder(reachable, { promiseMin: (await settings()).fairBandMin });
}

/**
 * Nobody tapped Accept by autoAssignSec: give it to the fairest nearby free pro,
 * staff or partner, trying the next if one cannot take it. Returns who took it, or null.
 */
async function autoAssign(kind, doc, radiusKm) {
  try {
    const candidates = (await module.exports.autoAcceptCandidates(kind, doc, radiusKm, { anyone: true })).slice(0, 3);
    for (const who of candidates) {
      const r = await TAKE[kind](who, doc._id);
      if (!r.ok) continue;
      await KINDS[kind].model().updateOne({ _id: doc._id }, { $set: { 'matching.autoAcceptedAt': new Date(), 'matching.autoAcceptedBy': `${who.kind}:${who.id}` } });
      return who;
    }
  } catch (e) {
    logger.warn({ err: e.message, kind, id: String(doc._id) }, '[fast-assign] auto-assign failed');
  }
  return null;
}

const UNHELD = { repair: { shopId: null, workerId: null }, pet: { shopId: null, workerId: null }, helping: { workerId: null } };

/**
 * Staff turn: ring the fairest on-duty staff member not yet rung (jobs/fairness), for staffRingSec. The job is
 * theirs only when they tap Accept; when the ring ends unanswered the sweep rings the next. Returns who was rung, or null when no staff are left.
 */
async function ringNextStaff(kind, doc, radiusKm) {
  try {
    const s = await settings();
    const tried = new Set((doc.matching?.staffTried || []).map(String));
    const next = (await module.exports.autoAcceptCandidates(kind, doc, radiusKm)).find((c) => c.staff && !tried.has(c.id));
    if (!next) return null;
    const until = new Date(Date.now() + s.staffRingSec * 1000);
    const add = { 'matching.staffTried': next.id, ...(kind === 'repair' && { 'matching.offeredTo': `worker:${next.id}` }) };
    const r = await KINDS[kind].model().updateOne({ _id: doc._id, ...UNHELD[kind] }, { $set: { 'matching.staffRing': { to: next.id, until } }, $addToSet: add });
    if (!r.modifiedCount) return null;
    if (kind === 'repair') require('../repair/services/events.service').announceOffer(doc, { to: { kind: 'worker', id: next.id }, windowSec: s.staffRingSec });
    else await require('./job-events').ringOne(kind, doc, next.id, s.staffRingSec);
    // The customer's screen refetches and counts the same ring down.
    require('./job-events').toProvider('user', doc.userId, 'job.update', { kind, id: String(doc._id), status: doc.status, at: new Date().toISOString() });
    return next;
  } catch (e) {
    logger.warn({ err: e.message, kind, id: String(doc._id) }, '[fast-assign] staff ring failed');
    return null;
  }
}

/** A staff member is deciding right now: nobody else is offered the job until their ring ends. */
const staffDeciding = (doc, now = Date.now()) => !!doc.matching?.staffRing?.until && new Date(doc.matching.staffRing.until).getTime() > now;

/**
 * Repairs: put the job in front of these pros at once; the first to claim it
 * (repair booking.controller claimBooking) takes it. Recorded so a claim from
 * anyone else is refused and the others' alerts close when it goes.
 */
async function broadcastRepair(booking, providers, windowSec) {
  if (!providers.length) return 0;
  const keys = providers.map((p) => (p.shopId ? `shop:${p.shopId}` : `worker:${p.workerId}`));
  const { RepairBooking } = require('../repair/models/booking.model');
  await RepairBooking.updateOne({ _id: booking._id }, { $addToSet: { 'matching.offeredTo': { $each: keys } }, $set: { 'matching.broadcastAt': new Date() } });
  const events = require('../repair/services/events.service');
  for (const p of providers) {
    events.announceOffer(booking, { to: p.shopId ? { kind: 'shop', id: String(p.shopId) } : { kind: 'worker', id: String(p.workerId) }, windowSec });
  }
  return providers.length;
}

/** A pro gave back or cancelled a job they auto-accepted: their auto-accept pauses. */
async function pauseIfAutoAccepted(doc, providerKind, providerId) {
  if (!doc?.matching?.autoAcceptedAt || !providerId) return false;
  // Only the pro it went to automatically; a later pro who tapped it is not paused.
  if (doc.matching.autoAcceptedBy && doc.matching.autoAcceptedBy !== `${providerKind}:${providerId}`) return false;
  const s = await settings();
  await modelOf(providerKind).updateOne({ _id: providerId }, { $set: { 'autoAccept.pausedUntil': new Date(Date.now() + s.autoAcceptPauseDays * 86400000) } });
  return true;
}

/**
 * For the customer's tracking screen while nobody has the job: when the search
 * began and the clock it runs to, so the app can count it ("Finding your pro
 * 0:45") and offer the honest choices at the deadline. Null once someone has
 * it, or for a booking made for later.
 */
async function searchView(kind, doc) {
  if (!doc || doc.workerId || doc.shopId || doc.scheduledAt) return null;
  if (KINDS[kind]?.ops?.terminal?.includes(doc.status)) return null;
  const s = await settings();
  if (!s.enabled) return null;
  return {
    startedAt: new Date(require('./waves').waitingSince({ ...doc, _kind: kind })), firstLookSec: s.firstLookSec, broadcastSec: s.broadcastSec, deadlineSec: Math.max(s.deadlineSec, s.autoAssignSec),
    toldAt: doc.matching?.slowNoticeAt || null,
    // A ZappyOne pro is deciding right now: the customer sees the same countdown.
    ringingUntil: staffDeciding(doc) ? doc.matching.staffRing.until : null,
    asked: (doc.matching?.staffTried || []).length,
  };
}

const modelOf = (kind) => (kind === 'shop' ? require('../shop/shop.model') : require('../worker/worker.model'));

/** A pro's own auto-accept, with the platform's radius: for their settings screen. */
async function autoAcceptOf(kind, id) {
  const [s, me] = await Promise.all([settings(), modelOf(kind).findById(id).select('autoAccept shopId').lean()]);
  const a = me?.autoAccept || {};
  const paused = a.pausedUntil && new Date(a.pausedUntil) > new Date() ? a.pausedUntil : null;
  return {
    autoAccept: { enabled: !!a.enabled, maxKm: a.maxKm ?? null, pausedUntil: paused },
    radiusKm: s.autoAcceptKm, pauseDays: s.autoAcceptPauseDays,
    // Nobody is given a job instantly any more (rings, then auto-assign): the switch is retired.
    available: false,
  };
}

/** Switch it on or off, or set their own distance limit. A pause stands until it ends. */
async function setAutoAccept(kind, id, { enabled, maxKm }) {
  const view = await autoAcceptOf(kind, id);
  if (!view.available && enabled) throw Object.assign(new Error('Auto-accept is not available for your account'), { status: 403, code: 'AUTO_ACCEPT_UNAVAILABLE' });
  const set = {};
  if (enabled !== undefined) set['autoAccept.enabled'] = !!enabled;
  if (maxKm !== undefined) set['autoAccept.maxKm'] = maxKm;
  if (Object.keys(set).length) await modelOf(kind).updateOne({ _id: id }, { $set: set });
  return autoAcceptOf(kind, id);
}

module.exports = { settings, asProvider, TAKE, autoAssign, ringNextStaff, staffDeciding, autoAcceptCandidates, broadcastRepair, pauseIfAutoAccepted, autoAcceptOf, setAutoAccept, searchView };
