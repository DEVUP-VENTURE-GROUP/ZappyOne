const CancellationFeeRecord = require('../../order/cancellation-shield.model');
const shieldService = require('../../order/shield.service');
const logger = require('../../../utils/logger');

/**
 * What it costs to cancel a repair.
 *
 * Cancelling used to be a bare status change: no fee, no refund, no money
 * moved. A customer could send a technician across the city and call it off on
 * their doorstep at no cost, and a customer who had already PAID online got
 * nothing back. Both are the same missing piece — cancellation has consequences
 * and nobody was computing them.
 *
 * Two different kinds of money are involved, and conflating them is the classic
 * way this goes wrong:
 *
 *   PENALTY   — compensation for wasted time. Scaled by how far the job got,
 *               and it goes to the Worker Shield Fund, not to the platform.
 *   EARNED    — payment for work genuinely done. If a technician has inspected
 *               the device, that inspection happened; cancelling afterwards does
 *               not un-inspect it. This is owed to the technician as income.
 *
 * A refund is whatever was paid, minus both. Cash bookings have paid nothing,
 * so there is nothing to refund — but the penalty is still recorded and
 * collected against the customer's next booking, exactly as orders do it.
 *
 * The fee schedule, the harm scores and the repeat-offender tiers are NOT
 * redefined here. They are the ones the order flow already uses, so a business
 * decision about cancellation is made once and applies everywhere.
 */

/**
 * Repair statuses collapsed onto the shared five-stage harm scale.
 *
 * The repair machine is far more granular, but for "how much did this cost the
 * technician?" the granularity does not matter — only how committed they were.
 */
const STAGE_FOR_STATUS = {
  PENDING: 'created',
  CONFIRMED: 'created',
  PROVIDER_ASSIGNED: 'searching',
  WORKER_ACCEPTED: 'assigned',
  PICKUP_SCHEDULED: 'assigned',
  ON_THE_WAY: 'on_the_way',
  DEVICE_PICKED_UP: 'on_the_way',
  ARRIVED: 'arrived',
  DIAGNOSING: 'arrived',
  QUOTE_PENDING: 'arrived',
  CUSTOMER_APPROVAL_PENDING: 'arrived',
  AT_WORKSHOP: 'arrived',
};

/**
 * Once these are reached the customer cannot cancel themselves.
 *
 * Not to trap anyone — because the device is open, or parts are already fitted,
 * and "cancelled" is no longer a state the job can be put into. These go to
 * support, who can settle them case by case.
 */
const NOT_SELF_CANCELLABLE = [
  'APPROVED',
  'REPAIR_IN_PROGRESS',
  'QA_PENDING',
  'READY_FOR_RETURN',
  'OUT_FOR_RETURN',
];

const TERMINAL = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'];

/**
 * Statuses by which the technician has actually inspected the device.
 *
 * From here on the inspection fee is earned income, whatever happens next.
 */
const DIAGNOSIS_DONE = ['DIAGNOSING', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'AT_WORKSHOP'];

/** What the customer has actually handed over so far. */
function paidPaise(booking) {
  if (booking.paymentStatus !== 'paid') return 0;
  return booking.priceSnapshot?.totalPaise || 0;
}

/** The inspection/diagnosis component of this booking, if any. */
function inspectionPaise(booking) {
  const snap = booking.priceSnapshot || {};
  return snap.diagnosisFeePaise || 0;
}

/**
 * Work out what cancelling now would cost — WITHOUT cancelling anything.
 *
 * Exposed so the app can show the customer the number before they confirm. A
 * cancellation fee discovered after the fact is a support ticket; shown before
 * the button, it is an informed decision.
 */
async function quoteCancellation(booking, { userId } = {}) {
  if (TERMINAL.includes(booking.status)) {
    return { allowed: false, reason: 'already_closed', message: 'This booking is already closed.' };
  }

  if (NOT_SELF_CANCELLABLE.includes(booking.status)) {
    return {
      allowed: false,
      reason: 'work_started',
      message: 'Work on your device has already started. Contact support and we will sort it out with the technician.',
    };
  }

  const stage = STAGE_FOR_STATUS[booking.status] || 'created';

  const cfg = await shieldService.getConfig();
  const recentCount = userId ? await shieldService.countRecentUserCancels(userId) : 0;
  const tierIdx = Math.min(recentCount, 2);

  const stageFees = cfg.feeSchedule?.[stage] ?? [0, 0, 0];
  let feePaise = stageFees[tierIdx] || 0;

  // First cancellation while we are still finding someone is free, with a word
  // of warning — the same grace the order flow gives.
  const isGrace = stage === 'searching' && recentCount === 0;
  if (isGrace) feePaise = 0;

  const earnedPaise = DIAGNOSIS_DONE.includes(booking.status) ? inspectionPaise(booking) : 0;
  const paid = paidPaise(booking);
  const refundPaise = Math.max(0, paid - feePaise - earnedPaise);

  return {
    allowed: true,
    stage,
    feePaise,
    earnedPaise,
    paidPaise: paid,
    refundPaise,
    isGrace,
    harmScore: cfg.harmScores?.[stage] ?? 0,
    cancelsInPeriod: recentCount,
    /** Plain-language summary, so every surface says the same thing. */
    message: buildMessage({ feePaise, earnedPaise, refundPaise, paid, isGrace }),
  };
}

function rupees(paise) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function buildMessage({ feePaise, earnedPaise, refundPaise, paid, isGrace }) {
  if (isGrace) return 'No charge this time — but please avoid cancelling once a technician is on the way.';
  const parts = [];
  if (earnedPaise > 0) parts.push(`${rupees(earnedPaise)} for the inspection already done`);
  if (feePaise > 0) parts.push(`a ${rupees(feePaise)} cancellation fee`);
  if (!parts.length) return 'You can cancel this booking free of charge.';

  const owed = parts.join(' and ');
  if (paid > 0) return `We will keep ${owed}, and refund you ${rupees(refundPaise)}.`;
  return `Cancelling now means ${owed}.`;
}

/**
 * Assess and record a cancellation.
 *
 * Called AFTER the booking has been moved to CANCELLED, because the fee is a
 * consequence of the cancellation rather than a condition of it — a failure to
 * write the fee record must never leave a customer unable to cancel.
 *
 * Idempotent through the unique index on repairBookingId: cancelling twice
 * cannot charge twice.
 */
async function assess(booking, { userId, quote = null } = {}) {
  const outcome = quote || await quoteCancellation(booking, { userId });
  if (!outcome.allowed) return outcome;

  const existing = await CancellationFeeRecord.findOne({ repairBookingId: booking._id }).lean();
  if (existing) return { ...outcome, alreadyAssessed: true, feeRecord: existing };

  let feeRecord = null;
  try {
    feeRecord = await CancellationFeeRecord.create({
      kind: 'repair',
      repairBookingId: booking._id,
      userId,
      workerId: booking.workerId || null,
      shopId: booking.shopId || null,
      cancelledAtStage: outcome.stage,
      feePaise: outcome.feePaise,
      earnedFeePaise: outcome.earnedPaise,
      refundedPaise: outcome.refundPaise,
      isGrace: outcome.isGrace,
      harmScore: outcome.harmScore,
      cancelsInPeriod: outcome.cancelsInPeriod,
      collectionStatus: outcome.isGrace
        ? 'grace'
        : outcome.feePaise === 0
          ? 'zero_fee'
          // Cash jobs have nothing to deduct from, so the fee rides on the next
          // booking — the same deferral the order flow uses.
          : 'pending_next_order',
      warningIssuedAt: outcome.isGrace ? new Date() : null,
    });
  } catch (err) {
    // A duplicate means a concurrent cancel already recorded it. Anything else
    // is logged and swallowed: the booking IS cancelled, and failing here must
    // not make it look otherwise.
    if (err.code !== 11000) {
      logger.error({ bookingId: String(booking._id), err: err.message }, '[repair-cancel] could not record fee');
    }
    return { ...outcome, feeRecord: null };
  }

  return { ...outcome, feeRecord };
}

module.exports = {
  quoteCancellation,
  assess,
  STAGE_FOR_STATUS,
  NOT_SELF_CANCELLABLE,
  DIAGNOSIS_DONE,
};
