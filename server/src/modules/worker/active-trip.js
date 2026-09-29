/**
 * Live tracking for every kind of job that isn't an Order.
 *
 * Repairs, pet bookings and helping tasks each have their own model and status
 * machine, but a customer watching someone come to them asks the same question
 * of all three. This file is the one place that knows, per kind:
 *
 *   - which statuses mean the provider is genuinely travelling, and to where
 *   - who may watch the job's live room
 *
 * Tracking events for all of them travel on the `order:<id>` room the order
 * flow already uses (ids are ObjectIds, so they never collide), which is why
 * the socket layer, the Redis bridge and the ETA engine need nothing new.
 *
 * Outside a travelling status nothing is shared. A provider carries this app
 * all day; a location feed that outlives its trip tracks a person, not a job.
 */
const { redis } = require('../../config/redis');

const pointOf = (p) => (Array.isArray(p?.coordinates) && p.coordinates.length === 2 ? p.coordinates : null);
const to = (p, toCustomer) => (pointOf(p) ? { point: pointOf(p), toCustomer } : null);

/**
 * Per kind: when the provider is travelling, where to, and whether "where" is
 * the customer. Only a trip to the customer earns an ETA-to-you and the
 * "almost there" push; a helper walking to a shop or a technician driving a
 * device back to the workshop is still shown live, but never as "arriving".
 */
const KINDS = [
  {
    kind: 'repair',
    link: (id) => `/repair/bookings/${id}`,
    model: () => require('../repair/models/booking.model').RepairBooking,
    fields: 'status userId workerId shopId location',
    travelling: ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'],
    heading: (b) => (b.status === 'DEVICE_PICKED_UP'
      ? { point: null, toCustomer: false }   // on the way to the workshop
      : to(b.location, true)),
  },
  {
    kind: 'pet',
    link: (id) => `/pet/bookings/${id}`,
    model: () => require('../pet/models/booking.model').PetBooking,
    fields: 'status userId workerId shopId serviceMode serviceLocation destination',
    travelling: ['PROVIDER_EN_ROUTE', 'SERVICE_STARTED'],
    heading: (b) => {
      if (b.status === 'PROVIDER_EN_ROUTE') return to(b.serviceLocation, true);
      // When moving the pet IS the service, the owner follows the ride.
      return b.serviceMode === 'transport' ? { point: pointOf(b.destination), toCustomer: false } : null;
    },
  },
  {
    kind: 'helping',
    link: (id) => `/helping/tasks/${id}`,
    model: () => require('../helping/models/task.model').HelpingTask,
    fields: 'status userId workerId serviceType pickupLocation destination',
    travelling: ['EN_ROUTE', 'RETURNING'],
    // Shopping and pickups start at a shop and end at the customer; returns
    // and exchanges start at the customer and end at a store.
    heading: (t) => {
      const outbound = t.status === 'EN_ROUTE';
      const startsAtCustomer = ['return', 'exchange'].includes(t.serviceType);
      return outbound
        ? to(t.pickupLocation, startsAtCustomer)
        : to(t.destination, !startsAtCustomer) || to(t.pickupLocation, !startsAtCustomer);
    },
  },
];

/** A job is a trip only in a travelling status its kind recognises. */
function tripFrom(k, doc) {
  if (!doc || !k.travelling.includes(doc.status)) return null;
  const h = k.heading(doc);
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
  for (const k of KINDS) {
    const Model = k.model();
    const doc = hintId
      ? await Model.findOne({ _id: hintId, workerId }).select(k.fields).lean().catch(() => null)
      : await Model.findOne({ workerId, status: { $in: k.travelling } }).sort({ updatedAt: -1 }).select(k.fields).lean();
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
  for (const k of KINDS) {
    const doc = await k.model().findById(jobId).select('userId workerId shopId').lean().catch(() => null);
    if (!doc) continue;
    if (role === 'user') return String(doc.userId) === String(id);
    if (role === 'worker') return String(doc.workerId || '') === String(id);
    if (role === 'shop') return String(doc.shopId || '') === String(id);
    return false;
  }
  return false;
}

module.exports = { activeTrip, clearActiveTrip, canWatchJob, tripFrom, KINDS };
