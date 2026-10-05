const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const User = require('../../user/user.model');
const cachedAnalytics = require('../lib/cached-analytics');


async function getMetrics(req, res, next) {
  try {
    const Transaction = require('../../payment/transaction.model');
    // 30-second cache: fresh enough for ops dashboards, avoids hammering Mongo on every poll.
    const result = await cachedAnalytics('admin:metrics', 30, async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [
        ordersToday,
        active,
        completedToday,
        orderRevenueAgg,
        platformRevenueAgg,
        onlineWorkers,
        totalWorkers,
        totalUsers,
      ] = await Promise.all([
        Order.countDocuments({ createdAt: { $gte: startOfDay } }),
        Order.countDocuments({
          status: {
            $in: [
              'searching',
              'assigned',
              'on_the_way',
              'arrived',
              'in_progress',
            ],
          },
        }),
        Order.countDocuments({
          status: 'completed',
          completedAt: { $gte: startOfDay },
        }),
        // GMV: prefer paise field (precise, added post-#51 fix); fall back to total×100 for old orders.
        Order.aggregate([
          {
            $match: { status: 'completed', completedAt: { $gte: startOfDay } },
          },
          {
            $group: {
              _id: null,
              gmvPaise: {
                $sum: {
                  $ifNull: [
                    '$pricing.totalPaise',
                    { $multiply: ['$pricing.total', 100] },
                  ],
                },
              },
              avgFarePaise: {
                $avg: {
                  $ifNull: [
                    '$pricing.totalPaise',
                    { $multiply: ['$pricing.total', 100] },
                  ],
                },
              },
            },
          },
        ]),
        // Platform revenue: commission credited to platform wallet from Transaction ledger (paise).
        Transaction.aggregate([
          {
            $match: {
              'owner.kind': 'platform',
              status: 'succeeded',
              createdAt: { $gte: startOfDay },
            },
          },
          { $group: { _id: null, revenuePaise: { $sum: '$amountPaise' } } },
        ]),
        Worker.countDocuments({ isOnline: true }),
        Worker.countDocuments(),
        User.countDocuments(),
      ]);
      const gmvPaise = orderRevenueAgg[0]?.gmvPaise || 0;
      const avgFarePaise = orderRevenueAgg[0]?.avgFarePaise || 0;
      const platformRevPaise = platformRevenueAgg[0]?.revenuePaise || 0;
      // Implied commission sanity check: should be ≈ configured commission rate.
      const impliedCommissionPct =
        gmvPaise > 0
          ? Math.round((platformRevPaise / gmvPaise) * 1000) / 10
          : null;
      return {
        ordersToday,
        active,
        completedToday,
        gmvToday: Math.round(gmvPaise / 100),
        gmvTodayPaise: gmvPaise,
        revenueToday: Math.round(platformRevPaise / 100),
        revenueTodayPaise: platformRevPaise,
        impliedCommissionPct,
        avgFare: Math.round(avgFarePaise / 100),
        onlineWorkers,
        totalWorkers,
        totalUsers,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}


async function getOtpAnalytics(req, res, next) {
  try {
    const authService = require('../../auth/auth.service');
    const days = Math.min(Number(req.query.days) || 7, 90);
    const stats = await authService.getOtpStats(days);
    res.json(stats);
  } catch (err) { next(err); }
}

module.exports = { getMetrics, getOtpAnalytics };
