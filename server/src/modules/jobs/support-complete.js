// Support finishes a job the pro could not close: how the customer paid and what was decided are recorded, then the job runs its normal completion (settlement, warranty, messages).
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const PAID_HOW = { cash: 'Cash to the pro', upi: 'UPI to the pro', already: 'Already paid' };
// Only once the pro is at the job: before that there is nothing to finish.
const STARTED = ['ARRIVED', 'DIAGNOSING', 'APPROVED', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN'];
const AVOID = new Set(['QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP', 'RETURN_REQUIRED']);

const canComplete = (kind, status) => kind === 'repair' && STARTED.includes(status);

// The shortest legal route through the repair steps to COMPLETED.
function routeTo(from, transitions) {
  const seen = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (at === 'COMPLETED') break;
    for (const next of transitions[at] || []) {
      if (seen.has(next) || AVOID.has(next) || (['FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(next))) continue;
      seen.set(next, at);
      queue.push(next);
    }
  }
  if (!seen.has('COMPLETED')) return null;
  const path = [];
  for (let s = 'COMPLETED'; s && s !== from; s = seen.get(s)) path.unshift(s);
  return path;
}

async function complete({ kind, id, paidHow, decision, adminId, adminEmail }) {
  if (kind !== 'repair') throw err(400, 'NOT_SUPPORTED', 'Support can finish repair and service jobs for now.');
  if (!PAID_HOW[paidHow]) throw err(400, 'BAD_PAYMENT', 'Say how the customer paid.');
  const { RepairBooking, TRANSITIONS } = require('../repair/models/booking.model');
  const booking = await RepairBooking.findById(id);
  if (!booking) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (booking.status === 'COMPLETED') return { completed: true, already: true };
  if (!canComplete(kind, booking.status)) throw err(409, 'NOT_STARTED', 'This job has not started yet. Reassign or cancel it instead.');
  if (paidHow === 'already' && booking.paymentStatus !== 'paid') throw err(409, 'NOT_PAID', 'This booking is not marked paid. Choose cash or UPI.');
  const path = routeTo(booking.status, TRANSITIONS);
  if (!path) throw err(409, 'NO_ROUTE', 'This job cannot be finished from where it is. Reassign it instead.');

  const reason = `Finished by ZappyOne support: ${decision}`;
  if (booking.paymentStatus !== 'paid') {
    await RepairBooking.updateOne({ _id: booking._id }, { $set: {
      paymentStatus: 'paid', paymentMethod: 'cash', cashCollectedAt: new Date(), cashCollectedById: null,
      payClaim: { method: paidHow === 'upi' ? 'upi' : 'cash', at: new Date(), utr: null },
    } });
  }
  const { transition } = require('../repair/services/booking/lifecycle');
  for (const step of path) {
    await transition(booking._id, step, { actorRole: 'admin', actorId: adminId, reason, meta: { support: true, paidHow } });
  }
  await require('./intervention.service').addNote({ kind, id, text: `Completed by support. Paid: ${PAID_HOW[paidHow]}. ${decision}`, adminId, adminEmail });
  return { completed: true, steps: path, paidHow };
}

module.exports = { complete, canComplete, routeTo, PAID_HOW };
