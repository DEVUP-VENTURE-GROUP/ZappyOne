/**
 * Assigned within two minutes, for every kind of job (repairs, pet care,
 * errands). The waves sweep (jobs/waves, every 10 s) drives the clock; this
 * holds the moves it makes. Timings: Economics → Dispatch (config.service
 * FAST_ASSIGN_DEFAULTS).
 *
 *   T+0     auto-accept: ZappyOne's own staff on duty first (workforce/), then a
 *           pro who switched auto-accept on, nearby (autoAcceptKm), free and
 *           allowed this service, takes it with no tap
 *   T+0     first look: the best-ranked pro alone (repairs; pet and errands
 *           already ring every live pro nearby)
 *   T+30s   broadcast: the next best pros at once, first to claim wins (repairs)
 *   T+75s   wider: every eligible pro, a bigger radius, offline pros nudged
 *   T+120s  auto-accept again, as far as widenKm; then the customer is told
 *           honestly and chooses: keep searching, later, or cancel free
 *
 * Auto-accept and claiming go through the same handlers a pro's own tap
 * uses, so every rule still applies there: dues limit, workload, approval per
 * service, a pet stay's free bed. Cancelling an auto-accepted job pauses the
 * pro's auto-accept (autoAcceptPauseDays), so it cannot be farmed.
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

/** Pros with auto-accept on who could take this job now, nearest first. */
async function autoAcceptCandidates(kind, doc, radiusKm) {
  const at = pointOf(kind, doc);
  const line = await KINDS[kind].line(doc);
  if (!at || !line) return [];
  const approved = await require('../onboarding/eligibility').approvedProviders(line);
  const passed = passersOf(doc);
  const now = new Date();
  const notPaused = { 'autoAccept.enabled': true, $or: [{ 'autoAccept.pausedUntil': null }, { 'autoAccept.pausedUntil': { $lte: now } }] };
  const workerIds = approved.filter((p) => p.kind === 'worker' && !passed.has(p.id)).map((p) => p.id);
  const shopIds = kind === 'helping' ? [] : approved.filter((p) => p.kind === 'shop' && !passed.has(p.id)).map((p) => p.id);
  const Worker = require('../worker/worker.model');
  const Shop = require('../shop/shop.model');
  // ZappyOne's own staff on duty take jobs first, with or without the switch (workforce/).
  const onDuty = [...await require('../workforce/staff').onDutyIds(now)].filter((id) => workerIds.includes(id));
  const [workers, shops] = await Promise.all([
    Worker.find({ _id: { $in: workerIds }, isBlocked: { $ne: true }, $or: [notPaused, { _id: { $in: onDuty } }] }).select('currentLocation autoAccept employment').lean(),
    Shop.find({ _id: { $in: shopIds }, ...notPaused }).select(`${require('../shop/shop.service').LIVE_FIELDS} autoAccept`).lean(),
  ]);
  const live = await require('../worker/presence').liveIds(workers.map((w) => w._id));
  const { free } = await require('./workload').classify(workers.map((w) => w._id));
  const km = (c) => (c?.length === 2 ? haversineKm(at.lat, at.lng, c[1], c[0]) : null);
  const duty = new Set(onDuty);
  const hubs = duty.size ? await require('../workforce/hub.model').find({ _id: { $in: workers.map((w) => w.employment?.hubId).filter(Boolean) } }).select('serviceKm').lean() : [];
  const reach = new Map(hubs.map((h) => [String(h._id), h.serviceKm]));
  return [
    ...workers.filter((w) => live.has(String(w._id)) && free.has(String(w._id)))
      .map((w) => (duty.has(String(w._id))
        // Staff on duty: as far as their hub serves, whatever this stage's radius.
        ? { kind: 'worker', id: String(w._id), km: km(w.currentLocation?.coordinates), staff: true, reachKm: reach.get(String(w.employment?.hubId)) || radiusKm }
        : { kind: 'worker', id: String(w._id), km: km(w.currentLocation?.coordinates), maxKm: w.autoAccept?.maxKm })),
    ...shops.filter(require('../shop/shop.service').isLive)
      .map((s) => ({ kind: 'shop', id: String(s._id), km: km(s.address?.location?.coordinates), maxKm: s.autoAccept?.maxKm })),
  ]
    .filter((p) => p.km != null && p.km <= (p.staff ? p.reachKm : Math.min(radiusKm, p.maxKm || radiusKm)))
    .sort((a, b) => (Number(!!b.staff) - Number(!!a.staff)) || a.km - b.km);
}

/**
 * Give the job to the nearest auto-accept pro who can take it (trying the next
 * if one cannot). Returns who took it, or null.
 */
async function tryAutoAccept(kind, doc, radiusKm) {
  try {
    const candidates = (await autoAcceptCandidates(kind, doc, radiusKm)).slice(0, 3);
    for (const who of candidates) {
      const r = await TAKE[kind](who, doc._id);
      if (!r.ok) continue;
      await KINDS[kind].model().updateOne({ _id: doc._id }, { $set: { 'matching.autoAcceptedAt': new Date(), 'matching.autoAcceptedBy': `${who.kind}:${who.id}` } });
      return who;
    }
  } catch (e) {
    logger.warn({ err: e.message, kind, id: String(doc._id) }, '[fast-assign] auto-accept failed');
  }
  return null;
}

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
    startedAt: new Date(require('./waves').waitingSince({ ...doc, _kind: kind })), firstLookSec: s.firstLookSec, broadcastSec: s.broadcastSec, deadlineSec: s.deadlineSec,
    toldAt: doc.matching?.slowNoticeAt || null,
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
    // Off platform-wide, or a shop's technician (the shop gives them work): no toggle.
    available: s.enabled && !(kind === 'worker' && me?.shopId),
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

module.exports = { settings, asProvider, TAKE, tryAutoAccept, autoAcceptCandidates, broadcastRepair, pauseIfAutoAccepted, autoAcceptOf, setAutoAccept, searchView };
