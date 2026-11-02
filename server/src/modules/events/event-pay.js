// An event booking's advance or balance, paid online through whichever gateway is live (payment.service); applied once, on capture.
const EventBooking = require('./event-booking.model');
const logger = require('../../core/logger');

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const STAGE = { event_advance_payment: 'advancePayment', event_remaining_payment: 'remainingPayment' };
const PAYABLE_AFTER_ADVANCE = ['confirmed', 'partner_assigned', 'in_progress', 'completed'];

async function amountFor({ purpose, bookingId, userId }) {
  const booking = await EventBooking.findOne({ _id: bookingId, userId }).select('status pricing advancePayment remainingPayment').lean();
  if (!booking) throw fail(404, 'NOT_FOUND', 'Booking not found');
  if (purpose === 'event_advance_payment') {
    if (booking.advancePayment?.status === 'paid' || booking.status !== 'pending_payment') throw fail(409, 'ALREADY_PAID', 'This booking is already paid');
    return booking.pricing.advancePaise;
  }
  if (booking.remainingPayment?.status === 'paid') throw fail(409, 'ALREADY_PAID', 'Remaining payment already completed');
  if (booking.advancePayment?.status !== 'paid' || !PAYABLE_AFTER_ADVANCE.includes(booking.status)) throw fail(409, 'ADVANCE_PENDING', 'Advance payment not completed yet');
  return booking.pricing.remainingPaise;
}

const remember = (purpose, bookingId, cfOrderId) => EventBooking.updateOne({ _id: bookingId }, { $set: { [`${STAGE[purpose]}.cfOrderId`]: cfOrderId } });

async function afterConfirmed(booking) {
  require('../jobs/job-events').announce('event', { ...booking, status: 'confirmed' }, 'confirmed').catch(() => {});
  try {
    const delay = new Date(booking.eventDate).getTime() - Date.now() - 24 * 3600 * 1000;
    if (delay > 0) {
      require('../../jobs').notificationsQueue.add('event_reminder', {
        bookingId: String(booking._id), userId: String(booking.userId), partnerId: String(booking.partnerId),
      }, { delay, jobId: `evt_reminder_${booking._id}` }).catch(() => {});
    }
  } catch { /* the reminder is a nicety */ }
  const ns = require('../notification/notification.service');
  const partner = await require('./event-partner.model').findById(booking.partnerId).select('businessName').lean();
  await Promise.all([
    ns.notify({
      recipient: { kind: 'user', id: String(booking.userId) }, type: 'event_booking_confirmed', title: 'Booking confirmed',
      body: `Your event is booked with ${partner?.businessName || 'your decorator'}. We'll remind you before the day.`,
      deepLink: `/events/bookings/${booking._id}`, data: { bookingId: String(booking._id) },
    }),
    ns.notify({
      recipient: { kind: 'event_partner', id: String(booking.partnerId) }, type: 'event_booking_new', title: 'New booking',
      body: 'You have a new confirmed booking. Open your dashboard for the details.', deepLink: '/partner', data: { bookingId: String(booking._id) },
    }),
  ]).catch(() => {});
}

// Called by payment.service.capturePayment, which already guarantees once per payment.
async function applyPaid(intent, paymentId) {
  const field = STAGE[intent.purpose];
  const now = new Date();
  const set = { [`${field}.status`]: 'paid', [`${field}.cfPaymentId`]: paymentId, [`${field}.paidAt`]: now };
  if (intent.purpose === 'event_advance_payment') {
    const booking = await EventBooking.findOneAndUpdate(
      { _id: intent.eventBookingId, status: 'pending_payment' },
      { $set: { ...set, status: 'confirmed' }, $push: { statusHistory: { status: 'confirmed', meta: { cfPaymentId: paymentId, paidAt: now } } } },
      { new: true },
    ).lean();
    if (!booking) {
      const b = await EventBooking.findById(intent.eventBookingId).select('status advancePayment').lean();
      if (b?.advancePayment?.status === 'paid') return;
      // Cancelled before the money landed: capturePayment flags it for ops to refund.
      throw fail(409, 'BOOKING_CLOSED', 'This booking was cancelled before your payment came in. ZappyOne will refund it to you.');
    }
    logger.info({ bookingId: String(booking._id), paymentId }, '[event-pay] advance paid, booking confirmed');
    await afterConfirmed(booking).catch((e) => logger.warn({ err: e.message }, '[event-pay] confirm notices failed'));
    return;
  }
  await EventBooking.updateOne({ _id: intent.eventBookingId, [`${field}.status`]: { $ne: 'paid' } }, { $set: set });
  logger.info({ bookingId: String(intent.eventBookingId), paymentId }, '[event-pay] balance paid');
}

module.exports = { amountFor, remember, applyPaid, STAGE };
