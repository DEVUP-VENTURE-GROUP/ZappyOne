const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const User = require('../../user/user.model');
const { redis } = require('../../../config/redis');
const cachedAnalytics = require('../lib/cached-analytics');

async function getRevenue(req, res, next) {
  try {
    const Transaction = require('../../payment/transaction.model');
    const days = Math.min(Number(req.query.days) || 7, 90);
    // Cache keyed by day-window; 60s TTL since this is a historical report.
    const result = await cachedAnalytics(
      `admin:revenue:${days}`,
      60,
      async () => {
        const since = new Date(Date.now() - days * 86400 * 1000);
        const [breakdown, byDay] = await Promise.all([
          Transaction.aggregate([
            {
              $match: {
                'owner.kind': 'platform',
                status: 'succeeded',
                createdAt: { $gte: since },
              },
            },
            {
              $group: {
                _id: '$reason',
                totalPaise: { $sum: '$amountPaise' },
                count: { $sum: 1 },
              },
            },
          ]),
          Transaction.aggregate([
            {
              $match: {
                'owner.kind': 'platform',
                status: 'succeeded',
                createdAt: { $gte: since },
              },
            },
            {
              $group: {
                _id: {
                  day: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                  },
                },
                totalPaise: { $sum: '$amountPaise' },
              },
            },
            { $sort: { '_id.day': 1 } },
          ]),
        ]);
        const totalPaise = breakdown.reduce((s, r) => s + r.totalPaise, 0);
        return {
          sinceDays: days,
          totalPaise,
          totalRupees: Math.round(totalPaise / 100),
          breakdown: breakdown.map((r) => ({
            reason: r._id,
            totalPaise: r.totalPaise,
            totalRupees: Math.round(r.totalPaise / 100),
            count: r.count,
          })),
          byDay: byDay.map((r) => ({
            day: r._id.day,
            totalPaise: r.totalPaise,
            totalRupees: Math.round(r.totalPaise / 100),
          })),
        };
      },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

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

async function getAnalytics(req, res, next) {
  try {
    const Transaction = require('../../payment/transaction.model');
    const days = Math.min(Number(req.query.days) || 30, 180);

    // 5-minute cache — 10 parallel aggregations on potentially millions of Order docs.
    // Admin analytics is historical data; 5-min staleness is acceptable.
    const cached = await redis.get(`admin:analytics:${days}`).catch(() => null);
    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch {
        /* fall through */
      }
    }

    const now = Date.now();
    const since = new Date(now - days * 86_400_000);
    const prevSince = new Date(now - days * 2 * 86_400_000); // previous period for comparison

    const [
      serviceStats,
      workerPerformance,
      dailyTrend,
      cohortSignups,
      orderFunnel,
      prevPeriodOrders,
      prevPeriodRevenue,
      operationalTimes,
      uniqueUsers,
      newUsersThisPeriod,
    ] = await Promise.all([
      // Full service stats: total, completed, cancelled, revenue, avg fare, avg duration
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$service',
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            revenuePaise: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $multiply: ['$pricing.total', 100] },
                  0,
                ],
              },
            },
            avgFare: {
              $avg: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  '$pricing.total',
                  null,
                ],
              },
            },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // Top worker earners with job counts + rating
      Order.aggregate([
        {
          $match: {
            status: 'completed',
            completedAt: { $gte: since },
            workerId: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$workerId',
            jobs: { $sum: 1 },
            earningPaise: { $sum: '$earnings.workerPaise' },
            avgRating: { $avg: '$userRating' },
          },
        },
        { $sort: { jobs: -1 } },
        { $limit: 15 },
        {
          $lookup: {
            from: 'workers',
            localField: '_id',
            foreignField: '_id',
            as: 'w',
          },
        },
        { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: '$w.name',
            phone: '$w.phone',
            skills: '$w.skills',
            jobs: 1,
            earningPaise: 1,
            avgRating: 1,
          },
        },
      ]),

      // Daily trend: orders + revenue per day
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'Asia/Kolkata',
              },
            },
            orders: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            revenuePaise: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $multiply: ['$pricing.total', 100] },
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Weekly signups using isoWeek
      Promise.all([
        User.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                y: { $isoWeekYear: '$createdAt' },
                w: { $isoWeek: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.y': 1, '_id.w': 1 } },
          {
            $project: {
              _id: {
                $concat: [
                  { $toString: '$_id.y' },
                  '-W',
                  { $toString: '$_id.w' },
                ],
              },
              count: 1,
            },
          },
        ]),
        Worker.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: {
                y: { $isoWeekYear: '$createdAt' },
                w: { $isoWeek: '$createdAt' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.y': 1, '_id.w': 1 } },
          {
            $project: {
              _id: {
                $concat: [
                  { $toString: '$_id.y' },
                  '-W',
                  { $toString: '$_id.w' },
                ],
              },
              count: 1,
            },
          },
        ]),
      ]),

      // Full order funnel by status
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Previous period totals for comparison
      Order.aggregate([
        { $match: { createdAt: { $gte: prevSince, $lt: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $multiply: ['$pricing.total', 100] },
                  0,
                ],
              },
            },
            avgFare: {
              $avg: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  '$pricing.total',
                  null,
                ],
              },
            },
          },
        },
      ]),

      // Previous period revenue from transactions
      Transaction.aggregate([
        {
          $match: {
            'owner.kind': 'platform',
            status: 'succeeded',
            createdAt: { $gte: prevSince, $lt: since },
          },
        },
        { $group: { _id: null, revenuePaise: { $sum: '$amountPaise' } } },
      ]),

      // Operational times: avg dispatch time (created→assigned) and service time (in_progress→completed)
      Order.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: since } } },
        {
          $project: {
            dispatchMs: { $subtract: ['$assignedAt', '$createdAt'] },
            serviceMs: { $subtract: ['$completedAt', '$startedAt'] },
            waitMs: { $subtract: ['$startedAt', '$arrivedAt'] },
          },
        },
        {
          $group: {
            _id: null,
            avgDispatchMin: { $avg: { $divide: ['$dispatchMs', 60000] } },
            avgServiceMin: { $avg: { $divide: ['$serviceMs', 60000] } },
            avgWaitMin: { $avg: { $divide: ['$waitMs', 60000] } },
          },
        },
      ]),

      // Unique users who placed any order this period
      Order.distinct('userId', { createdAt: { $gte: since } }),

      // New users (signed up this period)
      User.countDocuments({ createdAt: { $gte: since } }),
    ]);

    const [userSignups, workerSignups] = cohortSignups;
    const funnelMap = Object.fromEntries(
      orderFunnel.map((f) => [f._id, f.count]),
    );
    const totalOrders = orderFunnel.reduce((s, f) => s + f.count, 0);
    const completedCount = funnelMap.completed || 0;
    const cancelledCount = funnelMap.cancelled || 0;
    const totalRevPaise = serviceStats.reduce(
      (s, sv) => s + sv.revenuePaise,
      0,
    );
    const avgFareRupees =
      completedCount > 0 ? Math.round(totalRevPaise / completedCount / 100) : 0;

    const prev = prevPeriodOrders[0] || {
      total: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
      avgFare: 0,
    };
    const prevRevPaise = prevPeriodRevenue[0]?.revenuePaise || 0;

    const pctChange = (curr, prevVal) => {
      if (!prevVal) return null;
      return Math.round(((curr - prevVal) / prevVal) * 100);
    };

    const payload = {
      sinceDays: days,

      // Current period totals
      totalOrders,
      completedOrders: completedCount,
      cancelledOrders: cancelledCount,
      totalRevPaise,
      totalRevRupees: Math.round(totalRevPaise / 100),
      avgFareRupees,
      completionRate:
        totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0,
      cancelRate:
        totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0,
      uniqueActiveUsers: uniqueUsers.length,
      newUsers: newUsersThisPeriod,

      // Period-over-period change (%)
      prev: {
        totalOrders: prev.total,
        completedOrders: prev.completed,
        revenue: prevRevPaise,
        avgFare: Math.round((prev.avgFare || 0) * 100),
      },
      changes: {
        orders: pctChange(totalOrders, prev.total),
        completed: pctChange(completedCount, prev.completed),
        revenue: pctChange(totalRevPaise, prevRevPaise),
        avgFare: pctChange(avgFareRupees, Math.round(prev.avgFare || 0)),
      },

      // Operational efficiency
      ops: operationalTimes[0]
        ? {
            avgDispatchMin:
              Math.round((operationalTimes[0].avgDispatchMin || 0) * 10) / 10,
            avgServiceMin:
              Math.round((operationalTimes[0].avgServiceMin || 0) * 10) / 10,
            avgWaitMin:
              Math.round((operationalTimes[0].avgWaitMin || 0) * 10) / 10,
          }
        : { avgDispatchMin: null, avgServiceMin: null, avgWaitMin: null },

      // Service breakdown (all statuses)
      serviceBreakdown: serviceStats.map((s) => ({
        service: s._id,
        total: s.total,
        completed: s.completed,
        cancelled: s.cancelled,
        failed: s.failed,
        revenuePaise: Math.round(s.revenuePaise),
        revenueRupees: Math.round(s.revenuePaise / 100),
        avgFareRupees: Math.round(s.avgFare || 0),
        completionRate:
          s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
        cancelRate: s.total > 0 ? Math.round((s.cancelled / s.total) * 100) : 0,
      })),

      topWorkers: workerPerformance,
      dailyTrend: dailyTrend.map((d) => ({
        date: d._id,
        orders: d.orders,
        completed: d.completed,
        cancelled: d.cancelled,
        revenuePaise: d.revenuePaise,
        revenueRupees: Math.round(d.revenuePaise / 100),
      })),
      weeklySignups: { users: userSignups, workers: workerSignups },
      orderFunnel: funnelMap,
    };
    redis
      .set(`admin:analytics:${days}`, JSON.stringify(payload), 'EX', 300)
      .catch(() => {});
    res.json(payload);
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

module.exports = { getRevenue, getMetrics, getAnalytics, getOtpAnalytics };
