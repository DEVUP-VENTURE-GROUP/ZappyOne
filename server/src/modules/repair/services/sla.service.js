const { RepairConfig } = require('../models/config.model');

/**
 * Stage clocks for a repair.
 *
 * A repair is handed to ONE provider, not auctioned, so the timings are a
 * working person's: ten minutes to answer, ten to get moving, ten to do the
 * work, ten to hand it back. A routine doorstep job therefore lands well inside
 * three quarters of an hour without anyone being chased.
 *
 * Two rules make this fair enough to enforce:
 *
 *   THE CLOCK STOPS WHEN WE ARE WAITING ON THE CUSTOMER. A technician who has
 *   raised a quote and is waiting for approval is not late. Counting that time
 *   against them teaches technicians to stop asking questions and start
 *   guessing, which is precisely the behaviour this platform exists to remove.
 *
 *   LATE IS A SIGNAL, NOT A PUNISHMENT. Missing the accept window releases the
 *   job to someone else, because the customer is waiting. Every other overrun
 *   raises a flag for operations; it does not cancel anyone's work mid-repair.
 *
 * None of these numbers are shown to customers as a promise. The customer is
 * told what is happening and who is coming — not given a stopwatch.
 */

/** Which timer governs each status, and what it is called in the UI. */
const STAGE_FOR_STATUS = {
  PROVIDER_ASSIGNED: { stage: 'accept', field: 'acceptMinutes' },
  WORKER_ACCEPTED: { stage: 'start', field: 'startMinutes' },
  ON_THE_WAY: { stage: 'start', field: 'startMinutes' },
  ARRIVED: { stage: 'ready', field: 'readyMinutes' },
  DIAGNOSING: { stage: 'ready', field: 'readyMinutes' },
  REPAIR_IN_PROGRESS: { stage: 'ready', field: 'readyMinutes' },
  APPROVED: { stage: 'ready', field: 'readyMinutes' },
  AT_WORKSHOP: { stage: 'ready', field: 'readyMinutes' },
  QA_PENDING: { stage: 'ready', field: 'readyMinutes' },
  READY_FOR_RETURN: { stage: 'handover', field: 'handoverMinutes' },
  OUT_FOR_RETURN: { stage: 'handover', field: 'handoverMinutes' },
  PICKUP_SCHEDULED: { stage: 'handover', field: 'handoverMinutes' },
  DEVICE_PICKED_UP: { stage: 'ready', field: 'readyMinutes' },
};

/**
 * States where the ball is in the customer's court.
 *
 * The clock pauses here and resumes when they answer.
 */
const WAITING_ON_CUSTOMER = ['QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING'];

/** Nothing is due once a booking has stopped moving. */
const NO_CLOCK = [
  'PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED',
  'FAILED', 'REFUNDED', 'REFUND_PENDING', 'RETURN_REQUIRED',
];

const DEFAULTS = {
  acceptMinutes: 10,
  startMinutes: 10,
  readyMinutes: 10,
  handoverMinutes: 10,
  totalTargetMinutes: 45,
};

/** Admin-editable per vertical; defaults apply to a vertical with no config. */
async function slaFor(vertical) {
  const cfg = await RepairConfig.findOne({ vertical }).select('sla').lean();
  return { ...DEFAULTS, ...(cfg?.sla || {}) };
}

/**
 * Work out the deadline for the state a booking is entering.
 *
 * Returns the fields to write rather than writing them, so the caller can fold
 * this into the save it is already doing — a repair transition should not cost
 * two round trips.
 */
async function deadlineFor(booking, status) {
  const sla = await slaFor(booking.vertical);

  if (WAITING_ON_CUSTOMER.includes(status)) {
    // Stop the clock, remembering when, so the remaining time is preserved.
    return { stageDeadlineAt: null, slaPausedAt: booking.slaPausedAt || new Date() };
  }

  /**
   * Coming off a pause, bank the wait — always.
   *
   * This is computed before any early return: a status with no stage of its own
   * still has to account for the customer's thinking time, or that time is
   * silently charged back to the provider the next time they are measured.
   */
  let slaPausedMs = booking.slaPausedMs || 0;
  if (booking.slaPausedAt) {
    slaPausedMs += Date.now() - new Date(booking.slaPausedAt).getTime();
  }

  const spec = NO_CLOCK.includes(status) ? null : STAGE_FOR_STATUS[status];
  if (!spec) return { stageDeadlineAt: null, slaPausedAt: null, slaPausedMs };

  const minutes = sla[spec.field] ?? DEFAULTS[spec.field];
  return {
    stageDeadlineAt: new Date(Date.now() + minutes * 60 * 1000),
    slaPausedAt: null,
    slaPausedMs,
  };
}

/**
 * How this booking is doing right now, for a screen to render.
 *
 * `secondsLeft` is negative when overdue, so a caller can show "2 min left" or
 * "4 min over" from one number without a second field to disagree with it.
 */
function progressOf(booking) {
  const spec = STAGE_FOR_STATUS[booking.status];
  const waiting = WAITING_ON_CUSTOMER.includes(booking.status);

  if (waiting) {
    return { stage: 'waiting_on_customer', paused: true, secondsLeft: null, isLate: false };
  }
  if (!spec || !booking.stageDeadlineAt) {
    return { stage: spec?.stage || null, paused: false, secondsLeft: null, isLate: false };
  }

  const secondsLeft = Math.round((new Date(booking.stageDeadlineAt).getTime() - Date.now()) / 1000);
  return {
    stage: spec.stage,
    paused: false,
    secondsLeft,
    isLate: secondsLeft < 0,
    dueAt: booking.stageDeadlineAt,
  };
}

/** Minutes elapsed since the booking was placed, excluding customer wait time. */
function activeMinutes(booking) {
  const started = new Date(booking.createdAt).getTime();
  const ended = booking.completedAt ? new Date(booking.completedAt).getTime() : Date.now();
  const paused = booking.slaPausedMs || 0;
  return Math.max(0, Math.round((ended - started - paused) / 60000));
}

module.exports = {
  STAGE_FOR_STATUS,
  WAITING_ON_CUSTOMER,
  NO_CLOCK,
  DEFAULTS,
  slaFor,
  deadlineFor,
  progressOf,
  activeMinutes,
};
