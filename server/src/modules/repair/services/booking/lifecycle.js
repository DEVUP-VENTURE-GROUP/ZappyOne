const { RepairBooking } = require('../../models/booking.model');
const { Repair } = require('../../models/repair.model');
const { QAInspection } = require('../../models/custody.model');
const { QAChecklist } = require('../../models/config.model');
const eventsService = require('../events.service');
const slaService = require('../sla.service');
const handoverService = require('../handover.service');
const settlementService = require('../settlement.service');
const { httpError } = require('../../../../core/errors');
const { releaseStock, consumeStock } = require('./stock');

/** Moving a booking through its states, and the checks that guard completion. */

/**
 * Move a booking through its state machine, with authorisation.
 *
 * Ownership is asserted here — §51: a worker's app claiming a booking id is not
 * evidence that the booking is theirs.
 */
async function transition(bookingId, next, { actorRole, actorId, reason = '', meta = null } = {}) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  /**
   * Possession is proved, not asserted.
   *
   * Placed here rather than in a route handler so there is no way around it —
   * no admin action, background job or second endpoint can move a device into
   * "collected" or "returned" without the customer's code having been typed in
   * front of them.
   */
  await handoverService.assertGatePassed(booking, next);

  // Completion is gated on QA, not on the worker's say-so.
  if (next === 'COMPLETED') {
    const gate = await assertQAPassed(booking);
    if (!gate.ok) throw httpError(gate.message, 409, gate.code);

    // …and on the money actually being in hand for a cash job.
    const cash = assertCashCollected(booking);
    if (!cash.ok) throw httpError(cash.message, 409, cash.code);
  }

  /**
   * Start the clock on the stage being entered.
   *
   * Computed before the transition is applied so the deadline lands in the same
   * save — a booking that moved but has no deadline is invisible to the
   * watchdog, which is the one place a missed job must never hide.
   */
  const timing = await slaService.deadlineFor(booking, next);

  if (!booking.applyTransition(next, { actorRole, actorId, reason, meta })) {
    throw httpError(
      `Cannot move a booking from ${booking.status} to ${next}`,
      409,
      'INVALID_TRANSITION',
      { from: booking.status, to: next },
    );
  }

  Object.assign(booking, timing);

  await booking.save();

  // Stock accounting follows the state, so it cannot drift from reality.
  if (next === 'COMPLETED') {
    await consumeStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId });
    await issueWarranty(booking);
    // Pays the provider. Never throws — a wallet outage must not un-complete
    // a finished repair; failures are logged for reconciliation instead.
    await settlementService.settleSafely(booking);
  } else if (['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(next)) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId });
  }

  /**
   * Put the NEXT code in the customer's hands now, not when it is asked for.
   *
   * Generating it at the moment the technician asks leaves two people standing
   * in a doorway waiting for a push notification. Issued one step ahead, the
   * customer is already looking at it. Never allowed to fail the transition —
   * the code can be re-issued, a half-applied status change cannot.
   */
  handoverService.issueForUpcoming(booking).catch((err) => {
    require('../../../../core/logger').warn(
      { bookingId: String(booking._id), err: err.message },
      '[repair] could not pre-issue handover code',
    );
  });

  // Announced after the state is durably saved — never notify about something
  // that might still roll back.
  eventsService.announceTransition(booking, next).catch(() => {});

  return booking.toObject();
}

/**
 * Issue the warranty card on completion (§33).
 *
 * The term comes from the price the customer actually agreed to — the approved
 * quote if there was one, otherwise the booking snapshot — never from today's
 * catalog default, which may have changed since. Best effort: a warranty write
 * failing must not un-complete a finished repair.
 */
async function issueWarranty(booking) {
  try {
    if (booking.warrantyId) return null;

    const days = booking.priceSnapshot?.warrantyDays || 0;
    if (days <= 0) return null;

    const Warranty = require('../../../service/warranty.model');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + days * 86400 * 1000);

    const warranty = await Warranty.create({
      orderId: booking._id,
      userId: booking.userId,
      workerId: booking.workerId,
      service: booking.repairCode || 'repair',
      warrantyDays: days,
      issuedAt,
      expiresAt,
      status: 'active',
    });

    await RepairBooking.updateOne({ _id: booking._id }, { $set: { warrantyId: warranty._id } });
    return warranty;
  } catch (err) {
    require('../../../../core/logger').warn(
      { err: err.message, bookingId: String(booking._id) },
      '[repair] warranty issuance failed',
    );
    return null;
  }
}

/** Object-level authorisation — the customer, the assigned provider, or admin. */
function assertActorMayAct(booking, actorRole, actorId) {
  if (actorRole === 'admin' || actorRole === 'system') return;
  const id = String(actorId || '');
  if (actorRole === 'customer' && String(booking.userId) === id) return;
  if (actorRole === 'worker' && booking.workerId && String(booking.workerId) === id) return;
  if (actorRole === 'shop' && booking.shopId && String(booking.shopId) === id) return;
  throw httpError('You do not have access to this booking', 403, 'FORBIDDEN');
}


/**
 * The technician has the customer's cash in hand.
 *
 * Recorded by the provider at the moment it happens, because the alternative —
 * assuming payment on completion — means a job marked done and paid that was
 * never actually paid, and nobody notices until the week's accounts.
 *
 * Only the provider on this booking can record it. An online booking the
 * customer could not pay online (gateway down, card declined) may be settled
 * in cash at the door; it becomes a cash booking. Refused while an online
 * payment for it is already in the gateway, so nobody pays twice.
 */
async function collectCash({ bookingId, actorRole, actorId }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  if (booking.paymentStatus === 'paid') {
    // Idempotent: a second tap on a patchy connection must not double-record.
    return { booking, alreadyPaid: true };
  }
  if (booking.paymentMethod !== 'cash') {
    const PaymentIntent = require('../../../payment/payment-intent.model');
    const inGateway = await PaymentIntent.exists({
      bookingSource: 'repair', bookingId: booking._id, status: { $in: ['authorized', 'captured'] },
    });
    if (inGateway) {
      throw httpError('The customer has already paid online; it is being confirmed', 409, 'ONLINE_PAYMENT_IN_PROGRESS');
    }
    booking.paymentMethod = 'cash';
  }

  const due = booking.priceSnapshot?.totalPaise || 0;
  if (due <= 0) throw httpError('There is nothing to collect on this booking', 409, 'NOTHING_DUE');

  booking.paymentStatus = 'paid';
  booking.cashCollectedAt = new Date();
  booking.cashCollectedById = actorId;
  await booking.save();

  return { booking, alreadyPaid: false, collectedPaise: due };
}

/**
 * A cash job cannot be completed before the money is in hand.
 *
 * Completion triggers settlement, which bills the provider their commission on
 * the assumption they were paid. Letting it run first would take commission on
 * a job nobody paid for.
 */
function assertCashCollected(booking) {
  if (booking.paymentStatus === 'paid') return { ok: true };
  if ((booking.priceSnapshot?.totalPaise || 0) <= 0) return { ok: true };
  // An online job is not done until the gateway has the money, or the provider took cash instead.
  if (booking.paymentMethod !== 'cash') {
    return {
      ok: false,
      code: 'PAYMENT_PENDING',
      message: 'The customer has not paid online yet. Ask them to pay in the app, or collect cash before completing',
    };
  }
  return {
    ok: false,
    code: 'CASH_NOT_COLLECTED',
    message: 'Collect the payment from the customer before completing this job',
  };
}

/** A repair may not be declared complete while required QA items fail (§27). */
async function assertQAPassed(booking) {
  if (!booking.repairCode) return { ok: true };
  const repair = await Repair.findOne({ code: booking.repairCode, vertical: booking.vertical }).lean();
  const codes = repair?.qaChecklistCodes || [];
  if (!codes.length) return { ok: true };

  const checklist = await QAChecklist.findOne({
    code: { $in: codes }, vertical: booking.vertical, isActive: true,
  }).lean();
  if (!checklist) return { ok: true };

  const qa = await QAInspection.findOne({ bookingId: booking._id, stage: 'after' })
    .sort({ performedAt: -1 })
    .lean();

  if (!qa) return { ok: false, code: 'QA_REQUIRED', message: 'Post-repair QA must be completed first' };
  if (!qa.passed) {
    return {
      ok: false,
      code: 'QA_FAILED',
      message: `${qa.failedRequiredCount} required QA check(s) failed — resolve them before completing`,
    };
  }
  return { ok: true };
}

module.exports = {
  transition,
  issueWarranty,
  assertActorMayAct,
  collectCash,
  assertCashCollected,
  assertQAPassed,
};
