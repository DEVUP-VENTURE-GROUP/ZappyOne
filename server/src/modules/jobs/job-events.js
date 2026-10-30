/**
 * Lifecycle events for every job kind, driven by the registry in jobs/kinds.js.
 * Repairs keep their richer copy (quotes, SLA) in repair/services/events.service,
 * which also reports each change here so every screen listens to one event.
 *
 *   every status change   → the job's live room, so an open screen updates at once
 *   stages that matter    → a push to the customer (and to the provider when it's theirs to act on)
 *   a new unassigned job  → an alert to approved providers near it
 *
 * Wired from the models' post-save hook, so every path that moves a job is
 * covered without each call site remembering to announce it. Best effort
 * throughout: a failed push never undoes the change it describes.
 */
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');
const { haversineKm } = require('../../core/geo/distance');
const { KINDS, lineOf, providerOf } = require('./kinds');
const { areaOf, roughCoords } = require('./privacy');

/** Who cancelled decides who hears about it: the provider only when it wasn't them. */
const lastActor = (doc) => (doc.statusHistory || []).at(-1)?.byRole || (doc.cancelledBy === 'user' ? 'user' : '');

function toRoom(id, event, payload) {
  redis.publish('order:event', JSON.stringify({ orderId: String(id), event, payload }))
    .catch((err) => logger.warn({ err: err.message, id, event }, '[jobs] room publish failed'));
}

/** One person's own room: user:<id>, worker:<id>, shop:<id> or event_partner:<id>. */
function toProvider(kind, id, event, payload) {
  if (!id) return;
  redis.publish('provider:repair', JSON.stringify({ kind, id: String(id), event, payload }))
    .catch((err) => logger.warn({ err: err.message, id, event }, '[jobs] provider publish failed'));
}

async function push(recipient, { title, body, deepLink, data }) {
  if (!recipient.id) return;
  try {
    await require('../notification/notification.service').notify({
      recipient, type: 'system_alert', title, body, deepLink, data,
    });
  } catch (err) {
    logger.warn({ err: err.message, recipient }, '[jobs] notification failed');
  }
}

/**
 * Ring the one provider a job is offered to, with everything needed to decide.
 * Again after a boost, so the alert shows the higher amount.
 */
async function ringOffer(kind, doc) {
  const k = KINDS[kind];
  const provider = providerOf(kind, doc);
  if (!k?.offer || !provider) return;
  // How providers have rated this customer (jobs/customer-rating), to decide with.
  const customer = await require('./customer-rating').summaryFor(doc.userId).catch(() => null);
  const since = new Date(k.offer.since(doc) || Date.now());
  const start = k.open?.start(doc);
  toProvider(provider.kind, provider.id, 'job.offer', {
    kind, id: String(doc._id), status: doc.status, reference: doc.reference, at: new Date().toISOString(),
    // Until they accept: the area and a rounded pin (jobs/privacy).
    area: areaOf(start?.address), coordinates: start ? roughCoords([start.lng, start.lat]) : null,
    ...(k.open?.summary ? k.open.summary(doc) : {}),
    customer,
    expiresAt: new Date(since.getTime() + k.offer.windowMin * 60000).toISOString(), windowSec: k.offer.windowMin * 60,
  });
}

/**
 * Announce one status change on any job. The room always hears it; who is
 * pushed what comes from the kind's copy in jobs/kinds.js.
 */
async function announce(kind, doc, status) {
  const k = KINDS[kind];
  if (!k) return;
  const copy = k.copy || { customer: {}, provider: {} };
  const id = String(doc._id);
  const provider = providerOf(kind, doc);
  const payload = { kind, id, status, reference: doc.reference, at: new Date().toISOString() };
  // Taking a job ends a run of passed offers (jobs/offer-streak).
  if (doc.workerId && require('./give-back').RULES[kind]?.accepted.includes(status)) require('./offer-streak').took(doc.workerId);

  // Once someone holds the job: their commission rate (shop/partner-commission) and their fair-dispatch count (jobs/fairness).
  const accepted = require('./give-back').RULES[kind]?.accepted.includes(status);
  if (status === 'PROVIDER_ASSIGNED' || accepted) {
    require('../shop/partner-commission').refreeze(kind, doc).catch(() => {});
    const firstHold = status === 'PROVIDER_ASSIGNED' || !(doc.statusHistory || []).some((h) => h.status === 'PROVIDER_ASSIGNED');
    if (provider && (provider.kind === 'worker' ? accepted && !doc.shopId : firstHold)) require('./fairness').recordTaken(provider).catch(() => {});
  }

  // A job that just started waiting is offered to auto-accept pros at once (jobs/waves).
  require('./waves').kick(kind, doc).catch(() => {});

  toRoom(id, 'job.status', payload);
  // The arrival promise: set on accept, kept on arrival, closed on hand-back or end (jobs/promise).
  require('./promise').onStatus(kind, doc, status).catch(() => {});
  // Time inside the customer's home, for the safety check (jobs/safety-check).
  require('./safety-check').onStatus(kind, doc, status).catch(() => {});
  // Personal channels too, so lists and home cards update without the job open.
  // `accepted` lets the customer's screen ring the moment a pro takes it.
  toProvider('user', doc.userId, 'job.update', accepted ? { ...payload, accepted: true } : payload);
  if (provider) toProvider(provider.kind, provider.id, 'job.update', payload);

  // Offered to one provider: ring them with everything needed to decide.
  if (provider && k.offer?.status === status) ringOffer(kind, doc).catch(() => {});

  // Repairs, pet care and helping: every customer notice (push + email) and the
  // provider's "customer cancelled" come from the message catalog (messaging/lifecycle).
  const catalogued = !!require('../messaging/lifecycle').MAP[kind];
  if (catalogued) {
    require('../messaging/lifecycle').onStatus(kind, doc, status).catch(() => {});
  }
  const forCustomer = catalogued ? null : copy.customer[status];
  if (forCustomer) {
    await push({ kind: 'user', id: doc.userId }, {
      title: forCustomer[0], body: forCustomer[1], deepLink: k.link(id), data: { kind, id, status },
    });
  }
  const forProvider = catalogued && status === 'CANCELLED' ? null : copy.provider[status];
  // Cancellations reach the provider only when someone else made them.
  if (forProvider && provider && (forProvider[2] === 'always' || lastActor(doc) === 'user')) {
    await push(provider, {
      title: forProvider[0], body: forProvider[1], deepLink: k.providerLink(id), data: { kind, id, status },
    });
  }

  // A job nobody holds yet, in a status its kind posts openly.
  if (!provider && k.open?.statuses.includes(status)) {
    await alertNearbyProviders(kind, doc);
  }
}

const ALERT_RADIUS_KM = 15;
const ALERT_MAX = 40;

/**
 * Tell approved providers near a new job that it's there.
 *
 * Only providers approved for this exact service, and only those whose last
 * known position (or shop address) is within reach, and only workers who are
 * online. A provider with no known position is still told — they chose to work
 * this service and can judge the distance themselves from the job card.
 */
// One staff member's ring for an open job (jobs/fast-assign staff turn): the same card everyone nearby gets, with its own countdown.
async function ringOne(kind, doc, workerId, windowSec) {
  const k = KINDS[kind];
  if (!k.open) return;
  const start = k.open.start(doc);
  const line = await lineOf(kind, doc);
  const customer = await require('./customer-rating').summaryFor(doc.userId).catch(() => null);
  const summary = k.open.summary ? k.open.summary(doc) : {};
  toProvider('worker', workerId, 'job.available', {
    kind, id: String(doc._id), reference: doc.reference, line, area: areaOf(start?.address), km: null,
    coordinates: start ? roughCoords([start.lng, start.lat]) : null, ...summary, customer,
    windowSec, expiresAt: new Date(Date.now() + windowSec * 1000).toISOString(), yourTurn: true,
  });
  await require('../messaging/send').send('provider.job_nearby', {
    to: { kind: 'worker', id: workerId }, ctx: { label: k.label, km: null, area: areaOf(start?.address), earningPaise: summary.earningPaise, boostPaise: summary.boostPaise },
  }).catch(() => {});
}

async function alertNearbyProviders(kind, doc, { offlineOnly = false, round = 0 } = {}) {
  try {
    const { approvedProviders } = require('../onboarding/eligibility');
    const k = KINDS[kind];
    const line = await lineOf(kind, doc);
    if (!line || !k.open) return;
    const start = k.open.start(doc);
    // Not back to whoever already passed on it or handed it back (jobs/give-back).
    const passed = new Set([...(doc.declinedBy || []), ...(doc.releasedBy || [])].map(String));
    for (const id of await require('./customer-block').blockersOf(doc.userId)) passed.add(id);
    let providers = (await approvedProviders(line)).filter((p) => !passed.has(String(p.id)));
    // Staff on duty are rung one at a time, fairest first (jobs/fast-assign), not all at once.
    if (!offlineOnly && !require('./work-hours').isLater(doc.scheduledAt || doc.checkInAt)) {
      const onDuty = await require('../workforce/staff').onDutyIds();
      providers = providers.filter((p) => p.kind !== 'worker' || !onDuty.has(String(p.id)));
    }
    // Nobody at their dues limit is rung for new work (worker-dues).
    const working = await require('../worker/worker-dues.service').filterWorkingWorkers(providers.filter((p) => p.kind === 'worker').map((p) => p.id));
    providers = providers.filter((p) => p.kind !== 'worker' || working.has(String(p.id)));
    // Free workers first (or on the last stretch of a job); only if none is free
    // are those mid-job with room for one more told (jobs/workload).
    if (!require('./work-hours').isLater(doc.scheduledAt || doc.checkInAt)) {
      const { free, busy } = await require('./workload').classify(providers.filter((p) => p.kind === 'worker').map((p) => p.id));
      const anyFree = providers.some((p) => p.kind === 'worker' && free.has(String(p.id)));
      providers = providers.filter((p) => p.kind !== 'worker' || free.has(String(p.id)) || (!anyFree && busy.has(String(p.id))));
    }
    if (!providers.length) return;

    const Worker = require('../worker/worker.model');
    const Shop = require('../shop/shop.model');
    const workerIds = providers.filter((p) => p.kind === 'worker').map((p) => p.id);
    const shopIds = providers.filter((p) => p.kind === 'shop').map((p) => p.id);
    const [workers, shops] = await Promise.all([
      // Rung only while really there (worker/presence); the offline wave asks the others to come online.
      Worker.find({ _id: { $in: workerIds }, isActive: { $ne: false } }).select('currentLocation isOnline lastSeenAt workHours').lean()
        .then(async (rows) => {
          const live = await require('../worker/presence').liveIds(rows.map((r) => r._id));
          // A job for later: whoever's hours cover it, online or not; never someone off then (jobs/work-hours).
          const hoursRule = require('./work-hours');
          const when = doc.scheduledAt || doc.checkInAt || null;
          if (hoursRule.isLater(when)) {
            return offlineOnly ? [] : rows.filter((r) => hoursRule.availableFor(r, when, { live: live.has(String(r._id)) }));
          }
          return rows.filter((r) => (offlineOnly ? !live.has(String(r._id)) : live.has(String(r._id))));
        }),
      // Only shops that read "Live" to their owner (shop.service isLive).
      offlineOnly ? [] : Shop.find({ _id: { $in: shopIds }, isActive: { $ne: false } }).select(require('../shop/shop.service').LIVE_FIELDS).lean()
        .then((rows) => rows.filter(require('../shop/shop.service').isLive)),
    ]);
    const distance = (coords) => (start && coords?.length === 2 ? haversineKm(start.lat, start.lng, coords[1], coords[0]) : null);
    const all = [
      ...workers.map((w) => ({ kind: 'worker', id: String(w._id), km: distance(w.currentLocation?.coordinates) })),
      ...shops.map((s) => ({ kind: 'shop', id: String(s._id), km: distance(s.address?.location?.coordinates) })),
    ].sort((a, b) => (a.km ?? ALERT_RADIUS_KM) - (b.km ?? ALERT_RADIUS_KM));
    // Now-jobs ring for ringSec, nearest first, widening each round from autoAcceptKm to widenKm; nobody that near yet → the wide circle at once.
    const now = !offlineOnly && !require('./work-hours').isLater(doc.scheduledAt || doc.checkInAt);
    const fa = now ? await require('./fast-assign').settings() : null;
    const rounds = fa ? Math.max(1, Math.floor(fa.autoAssignSec / fa.ringSec) - 1) : 1;
    const radiusKm = fa ? fa.autoAcceptKm + ((fa.widenKm - fa.autoAcceptKm) * Math.min(round, rounds)) / rounds : ALERT_RADIUS_KM;
    const within = (r) => all.filter((p) => p.km == null || p.km <= r);
    const reach = (within(radiusKm).length ? within(radiusKm) : within(fa ? fa.widenKm : ALERT_RADIUS_KM)).slice(0, ALERT_MAX);
    const ring = fa ? { windowSec: fa.ringSec, expiresAt: new Date(Date.now() + fa.ringSec * 1000).toISOString(), round } : {};
    const pushedBefore = new Set(doc.matching?.pushed || []);
    if (fa && reach.length) await KINDS[kind].model().updateOne({ _id: doc._id }, { $addToSet: { 'matching.pushed': { $each: reach.map((p) => `${p.kind}:${p.id}`) } } });

    const title = offlineOnly ? `A ${k.label} job near you is waiting` : `New ${k.label} job near you`;
    const customer = await require('./customer-rating').summaryFor(doc.userId).catch(() => null);
    await Promise.all(reach.map((p) => {
      toProvider(p.kind, p.id, 'job.available', {
        // Before anyone accepts: the area and a rounded pin, never the house (jobs/privacy).
        kind, id: String(doc._id), reference: doc.reference, line, area: areaOf(start?.address), km: p.km,
        coordinates: start ? roughCoords([start.lng, start.lat]) : null, ...(k.open.summary ? k.open.summary(doc) : {}), customer, ...ring,
      });
      const summary = k.open.summary ? k.open.summary(doc) : {};
      // A later round re-rings the app; the phone push goes once per pro.
      if (pushedBefore.has(`${p.kind}:${p.id}`)) return null;
      return require('../messaging/send').send(offlineOnly ? 'provider.job_waiting' : 'provider.job_nearby', {
        to: { kind: p.kind, id: p.id },
        ctx: { label: k.label, km: p.km, area: areaOf(start?.address), earningPaise: summary.earningPaise, boostPaise: summary.boostPaise },
      });
    }));
  } catch (err) {
    logger.warn({ err: err.message, kind, id: String(doc._id) }, '[jobs] provider alert failed');
  }
}

/**
 * Attach to a schema: `transitionTo` records the move, and the save that
 * persists it announces it. A move that is never saved is never announced.
 */
function announceOnSave(schema, kind) {
  schema.post('save', function afterSave(doc) {
    const moves = doc.$locals?.moves;
    if (!moves?.length) return;
    doc.$locals.moves = [];
    // Sequential, so the room and the pushes arrive in the order things happened.
    moves.reduce((p, status) => p.then(() => announce(kind, doc, status)), Promise.resolve())
      .catch(() => {});
  });
}

/**
 * A shop put one of its technicians on a job. Every open screen refreshes (the
 * customer now sees who is coming) and the technician is told it is theirs.
 * No status changed, so the customer is not pushed a second "confirmed".
 */
async function announceAssigned(kind, doc) {
  const k = KINDS[kind];
  if (!k) return;
  const id = String(doc._id);
  const payload = { kind, id, status: doc.status, reference: doc.reference, at: new Date().toISOString() };
  toRoom(id, 'job.status', payload);
  toProvider('user', doc.userId, 'job.update', payload);
  toProvider('shop', doc.shopId, 'job.update', payload);
  toProvider('worker', doc.workerId, 'job.update', payload);
  await push({ kind: 'worker', id: doc.workerId }, {
    title: 'Your shop gave you a job', body: 'Open it to see where to go and what to do.',
    deepLink: k.providerLink(id), data: { kind, id, status: doc.status },
  });
}

/** Ops moved a job away from a provider: their list drops it, and they are told why it went. */
async function notifyMoved(kind, doc, previous) {
  const k = KINDS[kind];
  if (!k || !previous) return;
  const id = String(doc._id);
  toProvider(previous.kind, previous.id, 'job.update', { kind, id, status: 'MOVED', reference: doc.reference, at: new Date().toISOString() });
  await push(previous, {
    title: 'A job was moved', body: 'ZappyOne support passed this booking to another provider. Nothing for you to do.',
    deepLink: k.providerLink(id), data: { kind, id, status: 'MOVED' },
  });
}

module.exports = { ringOne,
  ringOffer, announce, announceOnSave, announceAssigned, alertNearbyProviders, notifyMoved, toProvider, push };
