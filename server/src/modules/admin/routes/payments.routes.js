const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const auditService = require('../audit.service');
const paymentAdmin = require('../../payment/payment-admin.service');

/**
 * Money → Payments. Every online payment, and the ones that need a person:
 * a captured payment whose effects failed, or a refund the gateway refused.
 */
const router = express.Router();

const cfOrderParam = Joi.string().pattern(/^zpy_[a-z0-9_]{4,60}$/).required();

router.get('/payments', validate(Joi.object({
  status: Joi.string().valid('created', 'authorized', 'captured', 'failed', 'expired', 'refunded'),
  purpose: Joi.string().valid('subscription', 'wallet_topup', 'order_payment', 'repair_payment', 'booking_payment', 'event_advance_payment', 'event_remaining_payment'),
  source: Joi.string().valid('repair', 'pet', 'helping'),
  needsAction: Joi.boolean(),
  q: Joi.string().max(80).allow(''),
  page: Joi.number().integer().min(1).max(1000),
}), 'query'), async (req, res, next) => {
  try { res.json(await paymentAdmin.list(req.query)); } catch (err) { next(err); }
});

router.get('/payments/summary', validate(Joi.object({ days: Joi.number().integer().min(1).max(90) }), 'query'),
  async (req, res, next) => {
    try { res.json(await paymentAdmin.summary({ days: req.query.days || 7 })); } catch (err) { next(err); }
  });

// Older admin builds read this; it is the "needs action" slice of the list above.
router.get('/payments/reconciliation-queue', async (req, res, next) => {
  try {
    const out = await paymentAdmin.list({ needsAction: true });
    res.json({ count: out.total, items: out.items });
  } catch (err) { next(err); }
});

router.post('/payments/:cfOrderId/reconcile',
  validate(Joi.object({ cfOrderId: cfOrderParam }), 'params'),
  validate(Joi.object({ notes: Joi.string().max(500).allow('') })),
  async (req, res, next) => {
    try {
      const intent = await paymentAdmin.markReconciled({ cfOrderId: req.params.cfOrderId, adminId: req.auth.sub, notes: req.body.notes });
      await auditService.fromRequest(req, 'admin.payment_reconciled', { kind: intent.owner.kind, id: intent.owner.id }, null, { cfOrderId: intent.cfOrderId, notes: req.body.notes || '' });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

router.post('/payments/:cfOrderId/retry-refund',
  validate(Joi.object({ cfOrderId: cfOrderParam }), 'params'),
  async (req, res, next) => {
    try {
      const out = await paymentAdmin.retryRefund({ cfOrderId: req.params.cfOrderId });
      await auditService.fromRequest(req, 'admin.refund_retried', { kind: 'system', id: null }, null, { cfOrderId: req.params.cfOrderId, result: out });
      res.json(out);
    } catch (err) { next(err); }
  });

router.post('/payments/:cfOrderId/mark-refunded',
  validate(Joi.object({ cfOrderId: cfOrderParam }), 'params'),
  validate(Joi.object({ reference: Joi.string().trim().min(6).max(60).required() })),
  async (req, res, next) => {
    try {
      const intent = await paymentAdmin.markRefundedManually({ cfOrderId: req.params.cfOrderId, reference: req.body.reference, adminId: req.auth.sub });
      await auditService.fromRequest(req, 'admin.refund_marked_manual', { kind: intent.owner.kind, id: intent.owner.id }, null, { cfOrderId: intent.cfOrderId, reference: req.body.reference });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

module.exports = router;
