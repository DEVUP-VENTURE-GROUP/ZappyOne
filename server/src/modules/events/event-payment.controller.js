/**
 * Event Payment Controller
 * Advance payment (% at booking) + remaining payment (balance on/after event).
 * Uses Cashfree — same gateway as order payments.
 */

const crypto = require('crypto');
const EventBooking  = require('./event-booking.model');
const EventPartner  = require('./event-partner.model');
const PaymentIntent = require('../payment/payment-intent.model');
const cashfree      = require('../payment/cashfree.client');
const logger        = require('../../core/logger');

async function resolveUserContact(userId) {
  try {
    const User = require('../user/user.model');
    const u = await User.findById(userId).select('name phone email').lean();
    return { id: String(userId), phone: u?.phone || '9999999999', email: u?.email || 'noreply@zappy.in', name: u?.name };
  } catch {
    return { id: String(userId), phone: '9999999999', email: 'noreply@zappy.in' };
  }
}

/* Create Cashfree order for advance payment */
async function createAdvanceOrder(req, res, next) {
  try {
    const booking = await EventBooking.findOne({
      _id: req.params.id,
      userId: req.auth.sub,
      status: 'pending_payment',
    }).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found or already paid' });

    // Idempotent — return existing active order if one exists
    if (booking.advancePayment?.cfOrderId) {
      const existing = await PaymentIntent.findOne({ cfOrderId: booking.advancePayment.cfOrderId, status: 'created' }).lean();
      if (existing) {
        const cfOrder = await cashfree.getOrderPayments(booking.advancePayment.cfOrderId).catch(() => null);
        // If still active, we need to re-create order (Cashfree doesn't let you re-fetch session for old orders)
        // Fall through to create a new one
        if (!cfOrder) {
          return res.json({
            cfOrderId: booking.advancePayment.cfOrderId,
            amountPaise: booking.pricing.advancePaise,
          });
        }
      }
    }

    const cfOrderId = `zpy_evt_adv_${String(booking._id).slice(-10)}_${crypto.randomBytes(3).toString('hex')}`;
    const customer  = await resolveUserContact(req.auth.sub);

    const cfOrder = await cashfree.createOrder({
      orderId:     cfOrderId,
      amountPaise: booking.pricing.advancePaise,
      customer,
      tags: { bookingId: String(booking._id), type: 'event_advance' },
    });

    await Promise.all([
      EventBooking.updateOne({ _id: booking._id }, { $set: { 'advancePayment.cfOrderId': cfOrderId } }),
      PaymentIntent.create({
        cfOrderId,
        owner:         { kind: 'user', id: req.auth.sub },
        purpose:       'event_advance_payment',
        eventBookingId: booking._id,
        amountPaise:   booking.pricing.advancePaise,
      }),
    ]);

    res.json({
      cfOrderId,
      paymentSessionId: cfOrder.payment_session_id,
      amountPaise: booking.pricing.advancePaise,
      currency: 'INR',
    });
  } catch (e) { next(e); }
}

/* Verify advance payment + confirm booking */
async function verifyAdvancePayment(req, res, next) {
  try {
    const { cfOrderId, cfPaymentId } = req.body;

    // Confirm with Cashfree API
    let payments;
    try {
      payments = await cashfree.getOrderPayments(cfOrderId);
    } catch {
      return res.status(502).json({ error: 'Could not verify payment with gateway' });
    }
    const successful = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === 'SUCCESS' && String(p.cf_payment_id) === String(cfPaymentId))
      : null;
    if (!successful) return res.status(400).json({ error: 'Payment not confirmed by gateway', code: 'PAYMENT_NOT_CONFIRMED' });

    const booking = await EventBooking.findOne({ _id: req.params.id, userId: req.auth.sub }).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.advancePayment?.status === 'paid') {
      return res.json({ ok: true, bookingId: String(booking._id), alreadyPaid: true });
    }

    const now = new Date();
    await Promise.all([
      EventBooking.updateOne({ _id: booking._id }, {
        $set: {
          status: 'confirmed',
          'advancePayment.status':      'paid',
          'advancePayment.cfPaymentId': cfPaymentId,
          'advancePayment.paidAt':      now,
        },
        $push: { statusHistory: { status: 'confirmed', meta: { cfPaymentId, paidAt: now } } },
      }),
      PaymentIntent.updateOne(
        { cfOrderId },
        { $set: { status: 'captured', cfPaymentId, appliedAt: now } }
      ),
    ]);

    logger.info({ bookingId: booking._id, cfPaymentId }, '[EVENT_PAYMENT] Advance paid — booking confirmed');

    // Schedule 24h reminder notification
    try {
      const { notificationsQueue } = require('../../jobs');
      const msUntilEvent = new Date(booking.eventDate).getTime() - Date.now();
      const reminderDelay = Math.max(0, msUntilEvent - 24 * 3600 * 1000);
      if (reminderDelay > 0) {
        notificationsQueue.add('event_reminder', {
          bookingId: String(booking._id),
          userId:    String(booking.userId),
          partnerId: String(booking.partnerId),
        }, { delay: reminderDelay, jobId: `evt_reminder_${booking._id}` }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    // Notify user + partner
    try {
      const ns      = require('../notification/notification.service');
      const partner = await EventPartner.findById(booking.partnerId).select('businessName').lean();
      await Promise.all([
        ns.notify({
          recipient: { kind: 'user', id: String(booking.userId) },
          type:  'event_booking_confirmed',
          title: '🎉 Booking Confirmed!',
          body:  `Your event is booked with ${partner?.businessName || 'your decorator'}. We'll remind you before the big day!`,
          deepLink: `/events/bookings/${booking._id}`,
          data: { bookingId: String(booking._id) },
        }),
        ns.notify({
          recipient: { kind: 'event_partner', id: String(booking.partnerId) },
          type:  'event_booking_new',
          title: '📦 New Booking!',
          body:  `You have a new confirmed booking. Check your dashboard for details.`,
          deepLink: `/partner`,
          data: { bookingId: String(booking._id) },
        }),
      ]).catch(() => {});
    } catch {}

    res.json({ ok: true, bookingId: String(booking._id) });
  } catch (e) { next(e); }
}

/* Create Cashfree order for remaining payment */
async function createRemainingOrder(req, res, next) {
  try {
    const booking = await EventBooking.findOne({
      _id: req.params.id,
      userId: req.auth.sub,
      status: { $in: ['confirmed', 'partner_assigned', 'in_progress', 'completed'] },
    }).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.remainingPayment?.status === 'paid') return res.status(409).json({ error: 'Remaining payment already completed' });
    if (booking.advancePayment?.status !== 'paid') return res.status(409).json({ error: 'Advance payment not completed yet' });

    const cfOrderId = `zpy_evt_rem_${String(booking._id).slice(-10)}_${crypto.randomBytes(3).toString('hex')}`;
    const customer  = await resolveUserContact(req.auth.sub);

    const cfOrder = await cashfree.createOrder({
      orderId:     cfOrderId,
      amountPaise: booking.pricing.remainingPaise,
      customer,
      tags: { bookingId: String(booking._id), type: 'event_remaining' },
    });

    await Promise.all([
      EventBooking.updateOne({ _id: booking._id }, { $set: { 'remainingPayment.cfOrderId': cfOrderId } }),
      PaymentIntent.create({
        cfOrderId,
        owner:         { kind: 'user', id: req.auth.sub },
        purpose:       'event_remaining_payment',
        eventBookingId: booking._id,
        amountPaise:   booking.pricing.remainingPaise,
      }),
    ]);

    res.json({
      cfOrderId,
      paymentSessionId: cfOrder.payment_session_id,
      amountPaise: booking.pricing.remainingPaise,
      currency: 'INR',
    });
  } catch (e) { next(e); }
}

/* Verify remaining payment */
async function verifyRemainingPayment(req, res, next) {
  try {
    const { cfOrderId, cfPaymentId } = req.body;

    let payments;
    try {
      payments = await cashfree.getOrderPayments(cfOrderId);
    } catch {
      return res.status(502).json({ error: 'Could not verify payment with gateway' });
    }
    const successful = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === 'SUCCESS' && String(p.cf_payment_id) === String(cfPaymentId))
      : null;
    if (!successful) return res.status(400).json({ error: 'Payment not confirmed by gateway', code: 'PAYMENT_NOT_CONFIRMED' });

    const booking = await EventBooking.findOne({ _id: req.params.id, userId: req.auth.sub }).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.remainingPayment?.status === 'paid') return res.json({ ok: true, alreadyPaid: true });

    const now = new Date();
    await Promise.all([
      EventBooking.updateOne({ _id: booking._id }, {
        $set: {
          'remainingPayment.status':      'paid',
          'remainingPayment.cfPaymentId': cfPaymentId,
          'remainingPayment.paidAt':      now,
        },
      }),
      PaymentIntent.updateOne(
        { cfOrderId },
        { $set: { status: 'captured', cfPaymentId, appliedAt: now } }
      ),
    ]);

    logger.info({ bookingId: booking._id, cfPaymentId }, '[EVENT_PAYMENT] Remaining paid');
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { createAdvanceOrder, verifyAdvancePayment, createRemainingOrder, verifyRemainingPayment };
