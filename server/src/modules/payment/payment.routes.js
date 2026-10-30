const express = require('express');
const Joi = require('joi');
const ctrl = require('./payment.controller');
const paymentService = require('./payment.service');
const cashfree = require('./cashfree.client');
const { authenticate } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { authLimiter } = require('../../middlewares/rateLimit');
const logger = require('../../core/logger');

const payables = require('./payables');

const router = express.Router();

/** Public: apps offer "Pay online" only while this says it works. */
router.get('/availability', (req, res) => {
  const gw = require('./gateway').active();
  res.json({ online: !!gw, cash: true, gateway: gw, env: require('../../config').cashfree.env });
});

// A customer's own payment for one booking and where its refund is: amount, status, date and the gateway's reference, so "refund initiated" is never a black box.
router.get('/booking/:source/:id', authenticate,
  validate(Joi.object({ source: Joi.string().valid('repair', 'pet', 'helping').required(), id: Joi.string().hex().length(24).required() }), 'params'),
  async (req, res, next) => {
    try {
      const PaymentIntent = require('./payment-intent.model');
      const intent = await PaymentIntent.findOne({ bookingSource: req.params.source, bookingId: req.params.id, 'owner.id': req.auth.sub, status: { $in: ['captured', 'refunded'] } })
        .sort({ createdAt: -1 }).select('amountPaise status gateway refund appliedAt').lean();
      if (!intent) return res.json({ payment: null });
      const r = intent.refund || {};
      res.json({ payment: {
        amountPaise: intent.amountPaise, paidAt: intent.appliedAt || null, gateway: intent.gateway,
        refund: r.status && r.status !== 'none' ? { status: r.status === 'manual_required' ? 'processing' : r.status, amountPaise: r.amountPaise || 0, reference: r.cfRefundId || null, at: r.at || null } : null,
      } });
    } catch (err) { next(err); }
  });

router.post(
  '/create-order',
  authenticate,
  authLimiter,
  validate(Joi.object({
    purpose:     Joi.string().valid('subscription', 'wallet_topup', 'order_payment', 'repair_payment', 'booking_payment').required(),
    bookingSource: Joi.string().valid('repair', 'pet', 'helping').when('purpose', { is: 'booking_payment', then: Joi.required() }),
    bookingId:   Joi.string().hex().length(24).when('purpose', { is: 'booking_payment', then: Joi.required() }),
    planCode:    Joi.string().when('purpose', { is: 'subscription', then: Joi.required() }),
    amountPaise: Joi.number().integer().min(100).when('purpose', { is: 'wallet_topup', then: Joi.required() }),
    // `orderId` carries the RepairBooking id for repair_payment — same field,
    // since the payment intent stores a single generic reference.
    orderId:     Joi.string().hex().length(24).when('purpose', {
      is: Joi.valid('order_payment', 'repair_payment'), then: Joi.required(),
    }),
    // Mobile only — the web Drop.js checkout resolves in-page and never sends
    // this. Native has no in-page callback, so Cashfree's hosted checkout
    // needs somewhere to redirect back to (a custom URL scheme deep link).
    returnUrl:   Joi.string().uri().max(500).optional(),
  })),
  ctrl.createOrder
);

router.post(
  '/verify',
  authenticate,
  authLimiter, // hits the Cashfree API — cap to protect quota + block verify spam
  validate(Joi.object({
    cfOrderId:   Joi.string().max(120).required(),
    cfPaymentId: Joi.string().max(120).required(),
    // Razorpay checkout only: HMAC of its order and payment ids.
    razorpaySignature: Joi.string().hex().length(64),
  })),
  ctrl.verify
);

const webhookRouter = express.Router();

webhookRouter.post(
  '/',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const signature = req.get('x-webhook-signature');
    const timestamp = req.get('x-webhook-timestamp');
    const rawBody   = req.body;

    if (!signature || !timestamp) {
      logger.warn({ ip: req.ip }, 'Cashfree webhook missing signature or timestamp');
      return res.status(400).json({ error: 'Missing signature' });
    }
    // A validly signed but old delivery is a replay; capture is idempotent, but refuse it anyway.
    const ts = Number(timestamp) > 1e12 ? Number(timestamp) : Number(timestamp) * 1000;
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
      logger.warn({ ip: req.ip, timestamp }, 'Cashfree webhook timestamp outside the replay window');
      return res.status(401).json({ error: 'Stale webhook' });
    }

    const ok = cashfree.verifyWebhookSignature(rawBody, timestamp, signature);
    if (!ok) {
      logger.warn({ ip: req.ip }, 'Cashfree webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Malformed JSON' });
    }

    try {
      const result = await paymentService.handleWebhook(payload);
      logger.info({ type: payload.type, result }, 'Cashfree webhook processed');
      res.json({ ok: true, ...result });
    } catch (err) {
      logger.error({ err: err.message, type: payload.type }, 'Webhook processing failed');
      res.status(500).json({ error: 'Processing failed' });
    }
  }
);

// Razorpay posts here (Dashboard > Webhooks, secret = RAZORPAY_WEBHOOK_SECRET); the body is checked byte for byte before it is read.
webhookRouter.post(
  '/razorpay',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const rzp = require('./razorpay.client');
    if (!rzp.verifyWebhookSignature(req.body, req.get('x-razorpay-signature'))) {
      logger.warn({ ip: req.ip }, 'Razorpay webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    let payload;
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'Malformed JSON' }); }
    try {
      const result = await paymentService.handleRazorpayWebhook(payload);
      logger.info({ event: payload.event, result }, 'Razorpay webhook processed');
      res.json({ ok: true, ...result });
    } catch (err) {
      logger.error({ err: err.message, event: payload.event }, 'Razorpay webhook processing failed');
      res.status(500).json({ error: 'Processing failed' });
    }
  },
);

module.exports = router;
module.exports.webhookRouter = webhookRouter;
