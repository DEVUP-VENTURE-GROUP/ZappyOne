const crypto = require('crypto');
const { RepairBooking } = require('../models/booking.model');
const eventsService = require('./events.service');
const logger = require('../../../core/logger');

/**
 * Proving a device changed hands.
 *
 * An order has one moment worth proving: the worker started the job. A repair
 * has up to three, because the device physically leaves its owner:
 *
 *   start    — work begins at the customer's place
 *   handover — the customer gives the device up for collection
 *   return   — the device is handed back
 *
 * Without a code at each, "collected" and "returned" are a technician tapping a
 * button on their own phone, and a dispute about a device that never came back
 * has nothing but two people's word. The code is told to the CUSTOMER and typed
 * by the TECHNICIAN, so possession can only be recorded by someone standing in
 * front of the person who has it.
 *
 * Which moments apply depends on how the job is being done, so it is a table
 * rather than branching: a doorstep repair never leaves the house and needs no
 * handover, while a collected device needs both ends.
 */

/**
 * Transition → the code it demands, and the modes where that applies.
 *
 * Read as: "you may not move a booking into this status, in one of these modes,
 * until this code has been accepted."
 */
const OTP_GATES = {
  // Work starting where the customer is standing.
  REPAIR_IN_PROGRESS: { kind: 'start', modes: ['doorstep'] },
  // The device leaving the customer's hands.
  DEVICE_PICKED_UP: { kind: 'handover', modes: ['pickup_repair'] },
  // The device going back. A doorstep repair never left, so it is exempt.
  COMPLETED: { kind: 'return', modes: ['pickup_repair', 'workshop'] },
};

/** Field names on the booking, kept in one place. */
const FIELD = {
  start: { code: 'otp.start', at: 'otpVerified.startAt' },
  handover: { code: 'otp.handover', at: 'otpVerified.handoverAt' },
  return: { code: 'otp.return', at: 'otpVerified.returnAt' },
};

const LABEL = {
  start: 'start the repair',
  handover: 'collect your device',
  return: 'hand your device back',
};

/** Which code, if any, this transition needs for this booking. */
function gateFor(status, serviceMode) {
  const gate = OTP_GATES[status];
  if (!gate) return null;
  return gate.modes.includes(serviceMode) ? gate.kind : null;
}

/** Six digits, from a real random source rather than Math.random. */
function newCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Create the code for a moment and tell the customer.
 *
 * Idempotent: asking twice returns the code already issued rather than
 * invalidating one the customer may already be reading off their screen.
 */
async function issue(bookingId, kind) {
  const field = FIELD[kind];
  if (!field) throw new Error(`Unknown handover kind: ${kind}`);

  const candidate = newCode();

  /**
   * Claim the slot in ONE atomic write.
   *
   * Read-then-write loses a race that genuinely happens: the transition
   * pre-issues the next code in the background while something else asks for
   * it, both see an empty slot, both generate, and the customer is told a
   * number that is no longer the one stored. Conditioning the update on the
   * field still being empty means exactly one writer wins, and the loser reads
   * back the winner's code instead of overwriting it.
   */
  const claimed = await RepairBooking.findOneAndUpdate(
    { _id: bookingId, $or: [{ [field.code]: { $exists: false } }, { [field.code]: null }, { [field.code]: '' }] },
    { $set: { [field.code]: candidate } },
    { new: true },
  ).select(`+${field.code} userId`).lean();

  // Somebody else got there first — theirs is the one the customer will be told.
  if (!claimed) {
    const current = await RepairBooking.findById(bookingId).select(`+${field.code}`).lean();
    return current?.otp?.[kind] || null;
  }

  const existing = claimed;
  const code = existing.otp?.[kind] || candidate;

  eventsService.notify({
    recipient: { kind: 'user', id: existing.userId },
    type: 'repair_otp',
    title: `Your code is ${code}`,
    body: `Share this with your technician when they ${LABEL[kind]}.`,
    deepLink: `/repair/bookings/${bookingId}`,
    data: { bookingId: String(bookingId), kind },
  }).catch(() => { /* the code is on their booking screen either way */ });

  return code;
}

/**
 * Check a code a technician has typed.
 *
 * Wrong codes are counted. Somebody guessing six digits at a stranger's door is
 * not a typo, and the attempt belongs in the record whether or not it succeeds.
 */
async function verify({ bookingId, kind, code, actorRole, actorId }) {
  const field = FIELD[kind];
  if (!field) throw Object.assign(new Error('Unknown code type'), { status: 400 });

  const booking = await RepairBooking.findById(bookingId).select(`+${field.code}`);
  if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });

  const expected = booking.otp?.[kind];
  if (!expected) {
    throw Object.assign(
      new Error('No code has been issued for this step yet'),
      { status: 409, code: 'OTP_NOT_ISSUED' },
    );
  }

  if (String(code).trim() !== expected) {
    logger.warn(
      { bookingId: String(bookingId), kind, actorRole, actorId },
      '[repair] handover code rejected',
    );
    throw Object.assign(
      new Error('That code does not match. Ask the customer to read it again.'),
      { status: 401, code: 'OTP_INVALID' },
    );
  }

  await RepairBooking.updateOne({ _id: bookingId }, { $set: { [field.at]: new Date() } });
  return { verified: true, kind };
}

/**
 * Refuse a transition whose code has not been accepted.
 *
 * Called from transition() so there is no path around it — a status is not
 * reachable by any route, job or admin action without the proof it requires.
 */
async function assertGatePassed(booking, nextStatus) {
  const kind = gateFor(nextStatus, booking.serviceMode);
  if (!kind) return;

  const at = booking.otpVerified?.[`${kind}At`];
  if (at) return;

  throw Object.assign(
    new Error(`Ask the customer for their code before you ${LABEL[kind]}.`),
    { status: 409, code: 'OTP_REQUIRED', otpKind: kind },
  );
}

/**
 * Issue whatever code the NEXT step will ask for, as soon as this one lands.
 *
 * The customer needs to be holding the number before the technician asks for
 * it; generating it at the moment of asking means two people standing in a
 * doorway waiting for a push notification.
 */
async function issueForUpcoming(booking) {
  const upcoming = {
    doorstep: { ARRIVED: 'start' },
    pickup_repair: { WORKER_ACCEPTED: 'handover', PICKUP_SCHEDULED: 'handover', READY_FOR_RETURN: 'return', OUT_FOR_RETURN: 'return' },
    workshop: { QA_PENDING: 'return', READY_FOR_RETURN: 'return' },
  };

  const kind = upcoming[booking.serviceMode]?.[booking.status];
  if (!kind) return null;
  return issue(booking._id, kind);
}

module.exports = {
  issue,
  verify,
  assertGatePassed,
  issueForUpcoming,
  gateFor,
  OTP_GATES,
  LABEL,
};
