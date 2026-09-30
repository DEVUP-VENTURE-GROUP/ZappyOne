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

  toRoom(id, 'job.status', payload);
  // Personal channels too, so lists and home cards update without the job open.
  toProvider('user', doc.userId, 'job.update', payload);
  if (provider) toProvider(provider.kind, provider.id, 'job.update', payload);

  const forCustomer = copy.customer[status];
  if (forCustomer) {
    await push({ kind: 'user', id: doc.userId }, {
      title: forCustomer[0], body: forCustomer[1], deepLink: k.link(id), data: { kind, id, status },
    });
  }
  const forProvider = copy.provider[status];
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
 * known position (or shop address) is within reach. A provider with no known
 * position is still told — they chose to work this service and can judge the
 * distance themselves from the job card.
 */
async function alertNearbyProviders(kind, doc) {
  try {
    const { approvedProviders } = require('../onboarding/eligibility');
    const k = KINDS[kind];
    const line = await lineOf(kind, doc);
    if (!line || !k.open) return;
    const start = k.open.start(doc);
    const providers = await approvedProviders(line);
    if (!providers.length) return;

    const Worker = require('../worker/worker.model');
    const Shop = require('../shop/shop.model');
    const workerIds = providers.filter((p) => p.kind === 'worker').map((p) => p.id);
    const shopIds = providers.filter((p) => p.kind === 'shop').map((p) => p.id);
    const [workers, shops] = await Promise.all([
      Worker.find({ _id: { $in: workerIds }, isActive: { $ne: false } }).select('currentLocation').lean(),
      Shop.find({ _id: { $in: shopIds }, isActive: { $ne: false } }).select('address.location').lean(),
    ]);
    const distance = (coords) => (start && coords?.length === 2 ? haversineKm(start.lat, start.lng, coords[1], coords[0]) : null);
    const reach = [
      ...workers.map((w) => ({ kind: 'worker', id: String(w._id), km: distance(w.currentLocation?.coordinates) })),
      ...shops.map((s) => ({ kind: 'shop', id: String(s._id), km: distance(s.address?.location?.coordinates) })),
    ]
      .filter((p) => p.km == null || p.km <= ALERT_RADIUS_KM)
      .sort((a, b) => (a.km ?? ALERT_RADIUS_KM) - (b.km ?? ALERT_RADIUS_KM))
      .slice(0, ALERT_MAX);

    const title = `New ${k.label} job near you`;
    await Promise.all(reach.map((p) => {
      toProvider(p.kind, p.id, 'job.available', {
        kind, id: String(doc._id), reference: doc.reference, line, area: start?.address || '', km: p.km,
      });
      return push(p, {
        title,
        body: [p.km != null ? `${p.km.toFixed(1)} km away` : null, start?.address].filter(Boolean).join(' · ') || 'Open the app to take it.',
        deepLink: k.open.listPath,
        data: { kind, id: String(doc._id) },
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

module.exports = { announce, announceOnSave, alertNearbyProviders };
