const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const ctrl = require('../controllers/orders.controller');
const auditService = require('../audit.service');
const Order = require('../../order/order.model');

const router = express.Router();

router.get('/orders', ctrl.listOrders);

/* Manual Order Intervention */
const ORDER_STATUSES = Order.STATUSES;

router.get('/orders/:id/nearby-workers', ctrl.nearbyWorkers);

router.post(
  '/orders/:id/reassign',
  validate(Joi.object({ workerId: Joi.string().pattern(/^[a-f0-9]{24}$/).required() })),
  ctrl.reassignOrder,
);

router.post(
  '/orders/:id/force-status',
  validate(Joi.object({
    status: Joi.string().valid(...ORDER_STATUSES).required(),
    reason: Joi.string().min(3).max(300).required(),
  })),
  ctrl.forceStatus,
);

router.post(
  '/orders/:id/force-cancel',
  validate(Joi.object({
    reason: Joi.string().min(3).max(300).required(),
    refundFull: Joi.boolean().default(false),
  })),
  ctrl.forceCancel,
);

router.post(
  '/orders/:id/note',
  validate(Joi.object({ note: Joi.string().min(1).max(1000).required() })),
  ctrl.addAdminNote,
);

router.post(
  '/orders/:id/refund',
  validate(Joi.object({
    amountPaise: Joi.number().integer().min(1).optional(),
    reason:      Joi.string().max(200).optional(),
  })),
  ctrl.refundOrder,
);

// #96: Full financial trace for any single order
router.get('/audit/order/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!/^[a-f0-9]{24}$/.test(orderId)) return res.status(400).json({ error: 'Invalid order ID' });
    const PaymentIntent = require('../../payment/payment-intent.model');
    const Transaction   = require('../../payment/transaction.model');
    const [order, intent, transactions] = await Promise.all([
      Order.findById(orderId)
        .select('userId workerId workerIds teamSize service pricing earnings payment status completedAt promoCode discountPaise')
        .populate('userId', 'name phone')
        .populate('workerId', 'name phone')
        .populate('workerIds', 'name phone rating')
        .lean(),
      PaymentIntent.findOne({ orderId }).lean(),
      Transaction.find({ refOrderId: orderId }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const gmvPaise      = order.pricing?.totalPaise ?? Math.round((order.pricing?.total ?? 0) * 100);
    const workerPaise   = order.earnings?.workerPaise ?? 0;
    const platformPaise = order.earnings?.platformPaise ?? 0;
    const accountedPaise = workerPaise + platformPaise;
    const discrepancyPaise = gmvPaise - accountedPaise;

    res.json({
      orderId: req.params.orderId,
      service: order.service,
      status:  order.status,
      customer: { id: order.userId?._id, name: order.userId?.name, phone: order.userId?.phone },
      worker:   { id: order.workerId?._id, name: order.workerId?.name, phone: order.workerId?.phone },
      financials: {
        gmvRupees:          Math.round(gmvPaise / 100),
        workerPayoutRupees: Math.round(workerPaise / 100),
        platformRevRupees:  Math.round(platformPaise / 100),
        discountRupees:     Math.round((order.discountPaise || 0) / 100),
        commissionRatePct:  order.earnings?.commissionRate
          ? Math.round(order.earnings.commissionRate * 1000) / 10
          : null,
        discrepancyRupees:  Math.round(discrepancyPaise / 100),
        isBalanced:         Math.abs(discrepancyPaise) < 100,
      },
      paymentIntent: intent
        ? { status: intent.status, cfOrderId: intent.cfOrderId, cfPaymentId: intent.cfPaymentId, appliedAt: intent.appliedAt, reconciliationRequired: intent.reconciliationRequired }
        : null,
      transactions: transactions.map((t) => ({
        type: t.type, owner: t.owner, amountRupees: Math.round(t.amountPaise / 100),
        reason: t.reason, status: t.status, createdAt: t.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

// #97: Commission correctness audit
router.get('/audit/commission', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 30);
    const since = new Date(Date.now() - days * 86_400_000);
    const orders = await Order.find(
      { status: 'completed', completedAt: { $gte: since }, 'earnings.commissionRate': { $exists: true } },
      { pricing: 1, earnings: 1, service: 1 },
    ).limit(500).lean();

    let correct = 0, discrepant = [];
    for (const o of orders) {
      const gmv  = o.pricing?.totalPaise ?? Math.round((o.pricing?.total ?? 0) * 100);
      const rate = o.earnings.commissionRate;
      const expectedPlatform = Math.round(gmv * rate);
      const actualPlatform   = o.earnings.platformPaise || 0;
      const diff = Math.abs(expectedPlatform - actualPlatform);
      if (diff > 100) {
        discrepant.push({ orderId: o._id, service: o.service, gmvRupees: Math.round(gmv / 100), expectedPlatformRupees: Math.round(expectedPlatform / 100), actualPlatformRupees: Math.round(actualPlatform / 100), diffRupees: Math.round(diff / 100), commissionRatePct: Math.round(rate * 1000) / 10 });
      } else {
        correct++;
      }
    }
    res.json({
      windowDays: days, totalSampled: orders.length, correct, discrepant: discrepant.length,
      accuracy: orders.length > 0 ? Math.round((correct / orders.length) * 100) : 100,
      issues: discrepant.slice(0, 20),
    });
  } catch (err) { next(err); }
});

// #98: Worker trust audit
router.get('/audit/worker-trust', async (req, res, next) => {
  try {
    const Worker = require('../../worker/worker.model');
    const since7d = new Date(Date.now() - 7 * 86_400_000);

    const [ratingDistribution, suspiciousVelocity, zeroRatingWorkers] = await Promise.all([
      Worker.aggregate([
        { $group: {
          _id: null,
          avg: { $avg: '$rating' },
          min: { $min: '$rating' },
          max: { $max: '$rating' },
          gt4_5: { $sum: { $cond: [{ $gte: ['$rating', 4.5] }, 1, 0] } },
          lt3:   { $sum: { $cond: [{ $lt:  ['$rating', 3.0] }, 1, 0] } },
          total: { $sum: 1 },
        }},
      ]),
      Order.aggregate([
        { $match: { status: 'completed', 'userRating': { $exists: true }, ratingSubmittedAt: { $gte: since7d } } },
        { $group: { _id: { userId: '$userId', day: { $dateToString: { format: '%Y-%m-%d', date: '$ratingSubmittedAt' } } }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 3 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      Worker.find({ completedJobs: { $gt: 5 }, rating: 5, 'kyc.status': 'approved' }, { name: 1, phone: 1, completedJobs: 1, rating: 1 }).limit(20).lean(),
    ]);

    const dist = ratingDistribution[0] || {};
    res.json({
      ratingDistribution: {
        avg:    Math.round((dist.avg || 0) * 100) / 100,
        min:    dist.min,
        max:    dist.max,
        above4_5Pct: dist.total > 0 ? Math.round((dist.gt4_5 / dist.total) * 100) : 0,
        below3Pct:   dist.total > 0 ? Math.round((dist.lt3   / dist.total) * 100) : 0,
        total:  dist.total,
      },
      suspiciousVelocity: { count: suspiciousVelocity.length, samples: suspiciousVelocity },
      unratedWorkers: { count: zeroRatingWorkers.length, note: 'Workers with 5+ jobs but still at default 5★ — may never have been rated', samples: zeroRatingWorkers },
    });
  } catch (err) { next(err); }
});

module.exports = router;
