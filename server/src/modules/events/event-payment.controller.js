// An event booking's advance (held at booking) and balance (on or after the day), through the shared payment path (payment.service, events/event-pay).
const paymentService = require('../payment/payment.service');
const PaymentIntent = require('../payment/payment-intent.model');
const { checkoutBody } = require('../payment/payment.controller');

const create = (purpose) => async (req, res, next) => {
  try {
    const r = await paymentService.createOrderForPurpose({ owner: { kind: 'user', id: req.auth.sub }, purpose, bookingId: req.params.id });
    res.json(checkoutBody(r));
  } catch (e) { next(e); }
};

const verify = (purpose) => async (req, res, next) => {
  try {
    const { cfOrderId, cfPaymentId, razorpaySignature = null } = req.body;
    const mine = await PaymentIntent.exists({ cfOrderId, purpose, eventBookingId: req.params.id, 'owner.id': req.auth.sub });
    if (!mine) return res.status(404).json({ error: 'Payment not found', code: 'NOT_FOUND' });
    const r = await paymentService.handleCheckoutVerification({ cfOrderId, cfPaymentId, razorpaySignature });
    if (r.ok === false) return res.status(400).json({ error: 'Payment not confirmed by gateway', code: 'PAYMENT_NOT_CONFIRMED' });
    res.json({ ok: true, bookingId: req.params.id });
  } catch (e) { next(e); }
};

module.exports = {
  createAdvanceOrder: create('event_advance_payment'),
  verifyAdvancePayment: verify('event_advance_payment'),
  createRemainingOrder: create('event_remaining_payment'),
  verifyRemainingPayment: verify('event_remaining_payment'),
};
