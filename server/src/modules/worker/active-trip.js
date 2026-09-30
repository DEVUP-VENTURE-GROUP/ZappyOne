/**
 * Live tracking for every kind of job that isn't an Order.
 *
 * Which statuses mean a provider is travelling, and to where, comes from the
 * job-kind registry (jobs/kinds.js); this file turns that into a live trip and
 * decides who may watch a job's room.
 *
 * Tracking events for all of them travel on the `order:<id>` room the order
 * flow already uses (ids are ObjectIds, so they never collide), which is why
 * the socket layer, the Redis bridge and the ETA engine need nothing new.
 *
 * Outside a travelling status nothing is shared. A provider carries this app
 * all day; a location feed that outlives its trip tracks a person, not a job.
 */
const { redis } = require('../../config/redis');
const { ALL, findJob } = require('../jobs/kinds');

/** A job is a trip only in a travelling status its kind recognises. */
function tripFrom(k, doc) {
  if (!doc || !k.trip.travelling.includes(doc.status)) return null;
  const h = k.trip.heading(doc);
  if (!h) return null;
  return {
    kind: k.kind,
    id: String(doc._id),
    userId: doc.userId,
    status: doc.status,
    link: k.link(doc._id),
    dest: h.point ? { lng: h.point[0], lat: h.point[1] } : null,
    toCustomer: Boolean(h.point && h.toCustomer),
  };
}

const CACHE_TTL_S = 10;
const cacheKey = (workerId) => `trip:active:${workerId}`;

/**
 * The trip this worker is on right now, or null.
 *
 * Looked up on the server rather than trusted from the client: whichever
 * screen the provider has open — dashboard, job page, or none — the ping is
 * routed to the right customer, and only to a job that is theirs.
 *
 * Cached briefly because the socket path sees a ping every few seconds. The
 * customer's screen stops listening the moment the status moves on, so a few
 * seconds of cache never shows a marker after a trip ends.
 */
async function activeTrip(workerId, { hintId = null, fresh = false } = {}) {
  if (!workerId) return null;
  if (!fresh && !hintId) {
    const cached = await redis.get(cacheKey(workerId)).catch(() => null);
    if (cached) return cached === 'none' ? null : JSON.parse(cached);
  }

  let trip = null;
  for (const k of ALL) {
    const Model = k.model();
    const doc = hintId
      ? await Model.findOne({ _id: hintId, workerId }).select(k.trip.fields).lean().catch(() => null)
      : await Model.findOne({ workerId, status: { $in: k.trip.travelling } }).sort({ updatedAt: -1 }).select(k.trip.fields).lean();
    trip = tripFrom(k, doc);
    if (trip) break;
  }
  // A stale or foreign hint falls back to what the server can see for itself.
  if (!trip && hintId) return activeTrip(workerId, { fresh: true });

  redis.set(cacheKey(workerId), trip ? JSON.stringify(trip) : 'none', 'EX', CACHE_TTL_S).catch(() => {});
  return trip;
}

/** Forget the cached trip, so a status change is reflected on the next ping. */
function clearActiveTrip(workerId) {
  if (workerId) redis.del(cacheKey(workerId)).catch(() => {});
}

/**
 * May this identity watch this job's live room?
 * Returns true for the customer, the assigned worker, the owning shop, and admins.
 */
async function canWatchJob(jobId, { id, role }) {
  if (role === 'admin') return true;
  const found = await findJob(jobId);
  if (!found) return false;
  const { doc } = found;
  if (role === 'user') return String(doc.userId) === String(id);
  if (role === 'worker') return String(doc.workerId || '') === String(id);
  if (role === 'shop') return String(doc.shopId || '') === String(id);
  return false;
}

module.exports = { activeTrip, clearActiveTrip, canWatchJob, tripFrom };
