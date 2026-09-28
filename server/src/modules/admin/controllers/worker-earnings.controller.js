const mongoose = require('mongoose');
const Order = require('../../order/order.model');
const Transaction = require('../../payment/transaction.model');
const logger = require('../../../core/logger');

const DAY = 24 * 60 * 60 * 1000;

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

function resolveRange(query) {
  const now = Date.now();
  let from;
  let to = query.to ? new Date(query.to) : new Date(now);
  if (query.from) {
    from = new Date(query.from);
  } else {
    const period = query.period || 'monthly';
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    from = new Date(now - days * DAY);
  }
  return { from, to };
}

/**
 * GET /workers/:id/earnings — full earnings breakdown for a date range.
 */
async function getWorkerEarnings(req, res, next) {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: 'Invalid worker ID' });
    const workerId = toObjectId(id);
    const { from, to } = resolveRange(req.query);

    // Completed orders for this worker in range.
    const orders = await Order.find({
      workerId,
      status: 'completed',
      completedAt: { $gte: from, $lte: to },
    }).select('pricing earnings payment').lean();

    let grossEarningsPaise = 0;
    let cashOrdersPaise = 0;
    let digitalOrdersPaise = 0;
    let tipsPaise = 0;
    let platformFeePaise = 0;

    for (const o of orders) {
      const workerPaise = o.earnings?.workerPaise ?? 0;
      grossEarningsPaise += workerPaise;
      platformFeePaise += o.earnings?.platformPaise ?? 0;
      tipsPaise += o.pricing?.tipPaise ?? 0;
      if (o.payment?.method === 'cash') cashOrdersPaise += workerPaise;
      else digitalOrdersPaise += workerPaise;
    }

    const totalJobsCompleted = orders.length;
    const avgOrderValuePaise = totalJobsCompleted > 0 ? Math.round(grossEarningsPaise / totalJobsCompleted) : 0;

    // Deductions (penalty/cancel/strike) and incentives (incentive/milestone/bonus/referral)
    // from the immutable ledger. amountPaise is signed (debits negative).
    const [deductionAgg, incentiveAgg] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            'owner.kind': 'worker',
            'owner.id': workerId,
            status: 'succeeded',
            type: 'debit',
            createdAt: { $gte: from, $lte: to },
            reason: { $in: ['cancellation_fee', 'platform_commission'] },
          },
        },
        { $group: { _id: null, sum: { $sum: '$amountPaise' } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            'owner.kind': 'worker',
            'owner.id': workerId,
            status: 'succeeded',
            type: 'credit',
            createdAt: { $gte: from, $lte: to },
            reason: { $in: ['referral_reward', 'admin_adjustment_credit', 'shield_payout'] },
          },
        },
        { $group: { _id: null, sum: { $sum: '$amountPaise' } } },
      ]),
    ]);

    const totalDeductionsPaise = Math.abs(deductionAgg[0]?.sum || 0);
    const totalIncentivesPaise = Math.abs(incentiveAgg[0]?.sum || 0);
    const netEarningsPaise = grossEarningsPaise - totalDeductionsPaise + totalIncentivesPaise;

    res.json({
      workerId: id,
      range: { from, to },
      grossEarningsPaise,
      cashOrdersPaise,
      digitalOrdersPaise,
      tipsPaise,
      totalJobsCompleted,
      avgOrderValuePaise,
      platformFeePaise,
      totalDeductionsPaise,
      totalIncentivesPaise,
      netEarningsPaise,
    });
  } catch (err) { next(err); }
}

/**
 * GET /workers/:id/timeline — last 30 days, grouped by day.
 */
async function getWorkerTimeline(req, res, next) {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: 'Invalid worker ID' });
    const workerId = toObjectId(id);
    const from = new Date(Date.now() - 30 * DAY);

    const rows = await Order.aggregate([
      { $match: { workerId, status: 'completed', completedAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          ordersCompleted: { $sum: 1 },
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill all 30 days so the chart has a continuous axis.
    const byDate = rows.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
    const timeline = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const key = d.toISOString().slice(0, 10);
      const row = byDate[key];
      timeline.push({
        date: key,
        ordersCompleted: row?.ordersCompleted || 0,
        earningsPaise: row?.earningsPaise || 0,
        onlineMinutes: null, // presence logs not tracked — null per spec
      });
    }

    res.json({ workerId: id, timeline });
  } catch (err) { next(err); }
}

/**
 * GET /workers/:id/deductions — penalty/deduction history.
 */
async function getWorkerDeductions(req, res, next) {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: 'Invalid worker ID' });
    const workerId = toObjectId(id);

    const txns = await Transaction.find({
      'owner.kind': 'worker',
      'owner.id': workerId,
      status: 'succeeded',
      type: 'debit',
      reason: { $in: ['cancellation_fee', 'platform_commission', 'admin_adjustment_debit'] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const items = txns.map((t) => ({
      id: t._id,
      amountPaise: Math.abs(t.amountPaise),
      reason: t.reason,
      description: t.description,
      orderId: t.refOrderId || null,
      date: t.createdAt,
    }));

    res.json({ workerId: id, items, total: items.length });
  } catch (err) { next(err); }
}

/**
 * GET /workers/:id/incentives — milestone/rating/referral bonuses earned.
 */
async function getWorkerIncentives(req, res, next) {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: 'Invalid worker ID' });
    const workerId = toObjectId(id);

    const txns = await Transaction.find({
      'owner.kind': 'worker',
      'owner.id': workerId,
      status: 'succeeded',
      type: 'credit',
      reason: { $in: ['referral_reward', 'admin_adjustment_credit', 'shield_payout'] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const items = txns.map((t) => ({
      id: t._id,
      amountPaise: Math.abs(t.amountPaise),
      reason: t.reason,
      description: t.description,
      date: t.createdAt,
    }));

    res.json({ workerId: id, items, total: items.length });
  } catch (err) { next(err); }
}

module.exports = {
  getWorkerEarnings,
  getWorkerTimeline,
  getWorkerDeductions,
  getWorkerIncentives,
};
