const config = require('../../config');

/**
 * Every bookable engine that can be paid online, in one place. The amount is
 * always read from the booking's own server-side price — never from the
 * client — so a tampered request cannot under-pay.
 *
 *   load(id)          the booking document (not lean — markPaid saves it)
 *   payable(b)        { amountPaise } or throws with the reason it can't be paid yet
 *   markPaid(b, ref)  record the capture on the booking
 *   commission(b)     the platform's own cut (booked at settlement, not at capture)
 *   afterPaid(b)      optional: what the engine does once the money has arrived
 *   isPaid(b)         already paid?
 */

const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

const PAYABLES = {
  repair: {
    load: (id) => require('../repair/models/booking.model').RepairBooking.findById(id),
    isPaid: (b) => b.paymentStatus === 'paid',
    payable(b) {
      // A diagnosis-first repair is not charged its estimate before a real quote is approved.
      if (b.priceSnapshot?.isEstimate && b.status !== 'APPROVED') {
        throw fail('This repair is priced after diagnosis — approve the quote before paying.', 409, 'QUOTE_APPROVAL_REQUIRED');
      }
      return { amountPaise: b.priceSnapshot?.totalPaise || 0 };
    },
    markPaid(b, intentId) { b.paymentStatus = 'paid'; b.paymentId = intentId; },
    commission: (b) => b.priceSnapshot?.commissionPaise || 0,
  },
  pet: {
    load: (id) => require('../pet/models/booking.model').PetBooking.findById(id),
    isPaid: (b) => b.paymentStatus === 'paid',
    payable(b) {
      if (['PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL'].includes(b.status)) {
        throw fail('Approve the final price before paying.', 409, 'PRICE_NOT_APPROVED');
      }
      return { amountPaise: b.pricing?.totalPaise || 0 };
    },
    markPaid(b, intentId) { b.paymentStatus = 'paid'; b.paymentId = String(intentId); },
    commission: (b) => b.pricing?.commissionPaise || 0,
    // Paid after the service: close the booking and settle it.
    afterPaid: (b) => require('../pet/services/payment.service').afterOnlinePayment(b),
  },
  helping: {
    load: (id) => require('../helping/models/task.model').HelpingTask.findById(id),
    isPaid: (b) => b.paymentStatus === 'paid',
    // The service charge only: item money is the customer's own and moves separately.
    payable: (b) => ({ amountPaise: b.charge?.serviceChargePaise || 0 }),
    markPaid(b, intentId) { b.paymentStatus = 'paid'; b.paymentId = String(intentId); },
    commission: (b) => b.charge?.commissionPaise || 0,
  },
};

const CANCELLED = new Set(['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED']);

/** Load a booking the customer owns and may pay for now; returns { booking, amountPaise }. */
async function resolvePayable({ source, bookingId, userId }) {
  const p = PAYABLES[source];
  if (!p) throw fail('This booking cannot be paid online', 400, 'NOT_PAYABLE');
  const booking = await p.load(bookingId);
  if (!booking) throw fail('Booking not found', 404, 'NOT_FOUND');
  if (String(booking.userId) !== String(userId)) throw fail('Not your booking', 403, 'FORBIDDEN');
  if (p.isPaid(booking)) throw fail('This booking is already paid', 409, 'ALREADY_PAID');
  if (CANCELLED.has(booking.status)) throw fail('This booking was cancelled', 409, 'BOOKING_CLOSED');
  const { amountPaise } = p.payable(booking);
  if (!amountPaise || amountPaise <= 0) throw fail('This booking has no payable amount yet', 409, 'NO_AMOUNT');
  return { booking, amountPaise };
}

/** Online payment needs live Cashfree credentials; everything else settles in cash. */
function gatewayReady() {
  return Boolean(config.cashfree.appId && config.cashfree.secretKey);
}

/**
 * Refuse — never silently downgrade — an online booking while online payment
 * is unavailable. The customer is told to choose cash instead.
 */
function assertOnlineAvailable(paymentMethod) {
  if (paymentMethod === 'online' && !gatewayReady()) {
    throw fail('Online payment is not available right now — choose cash and pay after the service.', 400, 'ONLINE_PAYMENTS_DISABLED');
  }
}

module.exports = { PAYABLES, resolvePayable, gatewayReady, assertOnlineAvailable };
