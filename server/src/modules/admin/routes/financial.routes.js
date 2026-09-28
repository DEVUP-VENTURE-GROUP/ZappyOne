const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const ctrl = require('../controllers/financial.controller');
const auditService = require('../audit.service');

const router = express.Router();

router.post(
  '/wallet/adjust',
  validate(Joi.object({
    kind: Joi.string().valid('user', 'worker').required(),
    id: Joi.string().hex().length(24).required(),
    type: Joi.string().valid('credit', 'debit').required(),
    amountPaise: Joi.number().integer().min(1).max(10000000).required(),
    description: Joi.string().max(200).optional(),
  })),
  ctrl.adjustWallet,
);

router.post('/wallet/reconcile/:kind/:id', ctrl.reconcileWallet);

// Payout management routes (inline handlers from original routes)
router.get('/payouts', async (req, res, next) => {
  try {
    const PayoutRequest = require('../../payout/payout.model');
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (req.query.manual === 'true') filter.manualTransferRequired = true;
    const [items, total] = await Promise.all([
      PayoutRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('workerId', 'name phone')
        .lean(),
      PayoutRequest.countDocuments(filter),
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

router.post('/payouts/:id/approve', async (req, res, next) => {
  try {
    const payoutService = require('../../payout/payout.service');
    const result = await payoutService.approvePayout({ payoutId: req.params.id, adminId: req.auth.sub });
    await auditService.fromRequest(req, 'admin.payout_approve', { kind: 'worker', id: result.workerId }, null, { payoutId: req.params.id });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/payouts/:id/reject', async (req, res, next) => {
  try {
    const payoutService = require('../../payout/payout.service');
    const result = await payoutService.rejectPayout({ payoutId: req.params.id, adminId: req.auth.sub, reason: req.body.reason });
    await auditService.fromRequest(req, 'admin.payout_reject', { kind: 'worker', id: result.workerId }, null, { payoutId: req.params.id, reason: req.body.reason });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/payouts/:id/process', async (req, res, next) => {
  try {
    const payoutService = require('../../payout/payout.service');
    const result = await payoutService.processPayout({ payoutId: req.params.id, adminId: req.auth.sub });
    await auditService.fromRequest(req, 'admin.payout_process', { kind: 'worker', id: result.workerId }, null, { payoutId: req.params.id });
    res.json(result);
  } catch (err) { next(err); }
});

// No payout gateway: the admin transferred it by hand and records the UTR.
router.post('/payouts/:id/mark-paid',
  validate(Joi.object({ reference: Joi.string().trim().min(6).max(60).required() })),
  async (req, res, next) => {
    try {
      const payoutService = require('../../payout/payout.service');
      const result = await payoutService.markPaidManually({ payoutId: req.params.id, adminId: req.auth.sub, reference: req.body.reference });
      await auditService.fromRequest(req, 'admin.payout_mark_paid', { kind: 'worker', id: result.workerId }, null, { payoutId: req.params.id, reference: req.body.reference });
      res.json(result);
    } catch (err) { next(err); }
  });

module.exports = router;
