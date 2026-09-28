/**
 * Getting paid for a pet booking, after the service is done.
 *
 *   SERVICE_COMPLETED
 *     ├─ already paid online ─────────────→ PAYMENT_COMPLETED + settle
 *     └─ not paid yet ────────────────────→ PAYMENT_PENDING
 *            ├─ customer pays online ─────→ PAYMENT_COMPLETED + settle   (payment capture)
 *            └─ provider records cash ────→ PAYMENT_COMPLETED + settle   (recordCash)
 *
 * Settlement goes through the shared pipeline: online credits the provider
 * their share, cash bills them the commission.
 */

const { PetBooking } = require('../models/booking.model');
const settlement = require('../../payment/settlement');
const { httpError } = require('../../../core/errors');

const AFTER_SERVICE = ['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING'];

function settle(booking) {
  return settlement.settleSafely({
    source: 'pet',
    booking,
    reference: booking.reference,
    paymentMethod: booking.paymentMethod,
    totalPaise: booking.pricing?.totalPaise || 0,
    platformPaise: booking.pricing?.commissionPaise || 0,
    refs: { petBookingId: booking._id },
  });
}

/** Called right after the provider completes the service. Saves the booking. */
async function afterServiceCompleted(booking, { by } = {}) {
  if (booking.paymentStatus === 'paid' || (booking.pricing?.totalPaise || 0) <= 0) {
    booking.transitionTo('PAYMENT_COMPLETED', { by, byRole: 'system' });
    await booking.save();
    await settle(booking);
  } else {
    booking.transitionTo('PAYMENT_PENDING', { by, byRole: 'system' });
    await booking.save();
  }
  return booking;
}

/** The online payment arrived. The booking is already marked paid and saved by the capture. */
async function afterOnlinePayment(booking) {
  if (!AFTER_SERVICE.includes(booking.status)) return; // paid up front; settles on completion
  booking.transitionTo('PAYMENT_COMPLETED', { byRole: 'system', note: 'Paid online' });
  await booking.save();
  await settle(booking);
}

/**
 * The provider has the customer's cash in hand. Allowed on an online booking
 * the customer could not pay online, unless a payment is already in the gateway.
 */
async function recordCash({ bookingId, providerId }) {
  const booking = await PetBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');
  const owns = String(booking.workerId || '') === String(providerId) || String(booking.shopId || '') === String(providerId);
  if (!owns) throw httpError('This is not your booking', 403, 'FORBIDDEN');
  if (booking.paymentStatus === 'paid') return { booking: booking.toObject(), alreadyPaid: true };
  if (!AFTER_SERVICE.includes(booking.status)) {
    throw httpError('Record the payment once the service is complete', 409, 'NOT_COMPLETE');
  }
  if (booking.paymentMethod !== 'cash') {
    const PaymentIntent = require('../../payment/payment-intent.model');
    const inGateway = await PaymentIntent.exists({
      bookingSource: 'pet', bookingId: booking._id, status: { $in: ['authorized', 'captured'] },
    });
    if (inGateway) throw httpError('The customer has already paid online; it is being confirmed', 409, 'ONLINE_PAYMENT_IN_PROGRESS');
    booking.paymentMethod = 'cash';
  }
  booking.paymentStatus = 'paid';
  booking.cashCollectedAt = new Date();
  booking.transitionTo('PAYMENT_COMPLETED', { by: providerId, byRole: 'worker', note: 'Cash collected' });
  await booking.save();
  const settled = await settle(booking);
  return { booking: booking.toObject(), alreadyPaid: false, settled };
}

module.exports = { afterServiceCompleted, afterOnlinePayment, recordCash, settle };
