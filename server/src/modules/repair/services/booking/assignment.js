const { RepairBooking } = require('../../models/booking.model');
const matchingService = require('../matching.service');
const eventsService = require('../events.service');
const slaService = require('../sla.service');
const { httpError } = require('../../../../core/errors');
const { releaseStock } = require('./stock');
const { assertActorMayAct } = require('./lifecycle');

/** Who does the job: shop assignment, re-offering, release, pass-back and decline. */

/**
 * A shop owner puts one of their own technicians on the job.
 *
 * The shop is the counterparty on the booking — the customer chose the shop,
 * and the shop is paid — but somebody has to actually hold the screwdriver.
 * Naming them here means the technician sees the job in their own app, gets
 * rung about it, and the custody record says who had the device.
 *
 * The worker must belong to THIS shop. Without that check an owner could park
 * a job on any technician on the platform, who would then be answerable for a
 * device they never agreed to touch.
 */
async function assignWorker({ bookingId, shopId, workerId }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (String(booking.shopId || '') !== String(shopId)) {
    throw httpError('This booking is not yours to assign', 403, 'FORBIDDEN');
  }

  const Worker = require('../../../worker/worker.model');
  const worker = await Worker.findOne({ _id: workerId, shopId }).select('name phone isBlocked').lean();
  if (!worker) {
    throw httpError('That technician is not on your team', 400, 'NOT_YOUR_WORKER');
  }
  if (worker.isBlocked) {
    throw httpError('That technician is blocked and cannot take jobs', 409, 'WORKER_BLOCKED');
  }

  const settled = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'REFUNDED'];
  if (settled.includes(booking.status)) {
    throw httpError('This job is already closed', 409, 'BOOKING_CLOSED');
  }

  booking.workerId = worker._id;
  booking.statusHistory.push({
    status: booking.status,
    at: new Date(),
    actorRole: 'shop',
    actorId: shopId,
    reason: `assigned to ${worker.name || 'technician'}`,
  });
  await booking.save();

  // Still waiting on an answer: ring the technician the same way dispatch would.
  // Already accepted by the shop: nothing to accept, so tell them it is theirs.
  if (booking.status === 'PROVIDER_ASSIGNED') eventsService.announceOffer(booking);
  else require('../../../jobs/job-events').announceAssigned('repair', booking).catch(() => {});

  return { booking, worker };
}

/**
 * Straight-line kilometres from a provider's base to the customer.
 *
 * Returns null when either end is unknown, so the fee falls back to the flat
 * rate rather than being computed from a guess.
 */
async function providerDistanceKm({ shopId, workerId, coordinates }) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  if (!shopId && !workerId) return null;

  const { ProviderServiceArea } = require('../../models/config.model');
  const area = await ProviderServiceArea.findOne({
    ...(shopId ? { shopId } : { workerId }),
    isActive: true,
    'center.coordinates.0': { $exists: true },
  }).select('center').lean();

  const from = area?.center?.coordinates;
  if (!Array.isArray(from) || from.length !== 2) return null;

  const R = 6371;
  const dLat = ((coordinates[1] - from[1]) * Math.PI) / 180;
  const dLng = ((coordinates[0] - from[0]) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((from[1] * Math.PI) / 180) * Math.cos((coordinates[1] * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/**
 * Offer a released job to the next provider.
 *
 * Both ways a job comes loose — the provider passed on it, or never answered
 * and the watchdog reclaimed it — left the booking at CONFIRMED with nobody
 * assigned and NOTHING looking for a replacement. The customer had paid
 * attention to "we'll find someone else" and we then looked for nobody: the job sat
 * there until a human noticed. Orders have a dispatch loop; repairs did not.
 *
 * Anyone already on `declines` is skipped, so a provider who passed is not
 * handed the same job thirty seconds later. When nobody else can take it the
 * booking stays CONFIRMED and unassigned — which is honest, and is the state
 * ops can query for — rather than being cancelled out from under the customer.
 */

async function redispatch(bookingId) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) return { assigned: false, reason: 'not_found' };
  if (booking.status !== 'CONFIRMED' || booking.shopId || booking.workerId) {
    return { assigned: false, reason: 'not_awaiting_provider' };
  }

  const coords = booking.location?.coordinates;
  if (!booking.repairCode || !Array.isArray(coords) || coords.length !== 2) {
    return { assigned: false, reason: 'insufficient_context' };
  }

  const tried = new Set((booking.declines || []).map((d) => String(d.providerId)));

  const { providers } = await matchingService.findProviders({
    vertical: booking.vertical,
    repairCode: booking.repairCode,
    brandCode: booking.brandCode,
    modelCode: booking.modelCode,
    qualityCode: booking.qualityCode || null,
    serviceMode: booking.serviceMode,
    lat: coords[1],
    lng: coords[0],
    cityCode: booking.location?.cityCode || null,
  });

  const next = (providers || []).find((p) => !tried.has(String(p.shopId || p.workerId)));
  if (!next) return { assigned: false, reason: 'no_one_left' };

  booking.shopId = next.shopId || null;
  booking.workerId = next.workerId || null;
  booking.applyTransition('PROVIDER_ASSIGNED', {
    actorRole: 'system',
    reason: 'reoffered after release',
  });
  Object.assign(booking, await slaService.deadlineFor(booking, booking.status));
  await booking.save();

  // Ring them, exactly as the first offer did.
  eventsService.announceOffer(booking);
  eventsService.announceTransition(booking, 'PROVIDER_ASSIGNED').catch(() => {});

  return { assigned: true, provider: next };
}

/**
 * States a provider may still WALK AWAY from without ending the job.
 *
 * The line is custody. Up to and including arrival, nothing of the customer's
 * has changed hands and another provider can simply take the work. Once the
 * device is picked up, or the technician has started diagnosing or repairing,
 * handing the booking to someone else is meaningless — the phone is in the
 * first provider's van. Those are real cancellations with real consequences.
 */
const RELEASABLE_FROM = [
  'CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'PICKUP_SCHEDULED',
];

/** Can this provider hand the job back rather than kill it? */
function canReleaseToPool(booking) {
  return RELEASABLE_FROM.includes(booking.status);
}

/**
 * A provider walks away from a job the customer still wants.
 *
 * Reported from production: when a shop cancelled, the booking simply died.
 * The customer — who had done nothing wrong and still needed their phone
 * fixed — was left with a CANCELLED booking and had to start again from the
 * first screen, re-entering their device, their fault and their address.
 *
 * A provider cancelling is not the customer changing their mind. It is supply
 * failing, and the platform's job is to find other supply. So the provider is
 * released, the job returns to the pool, and it is offered to the next one —
 * exactly what already happens when a provider DECLINES an offer, and the same
 * thing the SLA watchdog does when nobody answers.
 *
 * Returns `{ released: false }` when the job has gone too far to reassign, and
 * the caller falls back to a genuine cancellation.
 */
async function releaseToPool({ bookingId, actorRole, actorId, reason = '' }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (!canReleaseToPool(booking)) return { released: false, booking: booking.toObject() };

  // Release whatever was held for them, so the next provider is offered a job
  // that is genuinely available.
  if (booking.partId) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId })
      .catch(() => {});
    booking.partId = null;
  }

  /*
   * Recorded as a decline against THIS provider.
   *
   * It has to be on the record: a provider who accepts jobs and then abandons
   * them costs the customer more than one who never accepted, and the matcher
   * and the ops team both need to see that pattern. `redispatch` also reads
   * this list so the same provider is not immediately offered the job back.
   */
  booking.declines = booking.declines || [];
  booking.declines.push({
    providerKind: booking.shopId ? 'shop' : 'worker',
    providerId: booking.shopId || booking.workerId,
    reason: reason || 'provider_cancelled',
    at: new Date(),
  });

  booking.shopId = null;
  booking.workerId = null;
  booking.status = 'CONFIRMED';
  booking.statusHistory.push({
    status: 'CONFIRMED', at: new Date(), actorRole, actorId, reason: reason || 'provider_cancelled',
  });

  await booking.save();

  // Hand it straight to the next provider. A failure here must not undo the
  // release — an unassigned booking is recoverable, a stuck one is not.
  const handed = await redispatch(booking._id).catch((err) => {
    require('../../../../core/logger').error(
      { bookingId: String(booking._id), err: err.message },
      '[repair] could not re-dispatch after provider cancelled',
    );
    return null;
  });

  const fresh = await RepairBooking.findById(booking._id).lean();
  return { released: true, reoffered: !!handed, booking: fresh };
}

/** A shop technician returns an assigned job to their shop before leaving for it. */
async function passBackToShop(booking, workerId, reason) {
  if (String(booking.workerId || '') !== String(workerId)) {
    throw httpError('This job is not assigned to you', 403, 'FORBIDDEN');
  }
  if (!['CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED'].includes(booking.status)) {
    throw httpError('You have already set out for this job — call your shop owner', 409, 'TOO_LATE_TO_DECLINE', { status: booking.status });
  }
  if (!reason.trim()) throw httpError('Tell your shop why you are passing this job', 400, 'REASON_REQUIRED');

  booking.declines = booking.declines || [];
  booking.declines.push({ providerKind: 'worker', providerId: workerId, reason, at: new Date() });
  booking.workerId = null;
  if (booking.status === 'WORKER_ACCEPTED') booking.status = 'PROVIDER_ASSIGNED';
  booking.statusHistory.push({
    status: booking.status, at: new Date(), actorRole: 'worker', actorId: workerId, reason: `passed back to shop: ${reason}`,
  });
  await booking.save();

  // Close the offer on the technician's screen only; the shop still owns the job.
  eventsService.announceOfferClosed({ _id: booking._id, workerId }, 'passed_back');
  eventsService.notify({
    kind: 'shop',
    id: booking.shopId,
    type: 'repair_passed_back',
    title: 'A technician passed on a job',
    body: `Reason: ${reason}. Assign it to someone else so the customer isn't kept waiting.`,
    deepLink: '/shop',
    data: { bookingId: String(booking._id) },
  });
  return booking;
}

/**
 * The provider passes on a job.
 *
 * Declining is a legitimate answer — the technician may be mid-job, out of the
 * part, or too far — and treating it as a failure teaches providers to let
 * offers rot instead, which is worse for the customer. The booking goes back to
 * unassigned so dispatch can try someone else, and the reason is kept.
 */

async function declineBooking({ bookingId, actorRole, actorId, reason = '' }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  // A shop's own technician passing a job hands it back to the shop, not to the
  // market: the shop keeps its customer and the owner reassigns.
  if (actorRole === 'worker' && booking.shopId) return passBackToShop(booking, actorId, reason);

  if (!['PROVIDER_ASSIGNED', 'CONFIRMED'].includes(booking.status)) {
    throw httpError(
      'This job can no longer be passed on — it has already started',
      409,
      'TOO_LATE_TO_DECLINE',
      { status: booking.status },
    );
  }

  // Release whatever was held for them, so the next provider is offered a job
  // that is genuinely available.
  if (booking.partId) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId })
      .catch(() => {});
    booking.partId = null;
  }

  booking.declines = booking.declines || [];
  booking.declines.push({
    providerKind: booking.shopId ? 'shop' : 'worker',
    providerId: booking.shopId || booking.workerId,
    reason,
    at: new Date(),
  });

  booking.shopId = null;
  booking.workerId = null;
  booking.status = 'CONFIRMED';
  booking.statusHistory.push({
    status: 'CONFIRMED', at: new Date(), actorRole, actorId, reason: reason || 'provider_declined',
  });

  await booking.save();

  // Hand it straight to the next provider. Failure here must not undo the
  // decline itself — the provider has passed either way, and an unassigned
  // booking is recoverable where a stuck one is not.
  const handed = await redispatch(booking._id).catch((err) => {
    require('../../../../core/logger').error(
      { bookingId: String(booking._id), err: err.message },
      '[repair] re-dispatch after decline failed',
    );
    return { assigned: false, reason: 'error' };
  });

  return handed.assigned ? RepairBooking.findById(booking._id) : booking;
}

module.exports = {
  RELEASABLE_FROM,
  assignWorker,
  providerDistanceKm,
  redispatch,
  canReleaseToPool,
  releaseToPool,
  passBackToShop,
  declineBooking,
};
