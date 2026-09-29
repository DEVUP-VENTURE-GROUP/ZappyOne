'use strict';

const Order = require('../../order/order.model');
const User = require('../../user/user.model');
const Worker = require('../../worker/worker.model');
const { redis } = require('../../../config/redis');

const COMMISSION_RATE = 0.18;
const CACHE_TTL = 30; // seconds

// ── Helper: get date boundaries ──────────────────────────────────────────────

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function mtdBounds() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end: new Date() };
}

function ytdBounds() {
  const start = new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0);
  return { start, end: new Date() };
}

// ── Redis cache helpers ───────────────────────────────────────────────────────

async function getCache(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function setCache(key, data, ttl = CACHE_TTL) {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch {
    // Redis unavailable — serve uncached
  }
}

// ── 1. getLiveMetrics ────────────────────────────────────────────────────────

async function getLiveMetrics() {
  const cacheKey = 'zi:cmd:live_metrics';
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const { start: todayStart } = todayBounds();
  const { start: mtdStart } = mtdBounds();
  const { start: ytdStart } = ytdBounds();

  const [
    activeWorkers,
    ordersLive,
    completedToday,
    completedMTD,
    completedYTD,
    totalOrdersToday,
    cancelledToday,
    slaOrders,
  ] = await Promise.all([
    // Active workers (online right now)
    Worker.countDocuments({ isOnline: true, isBlocked: false }),

    // Live orders (in-flight)
    Order.countDocuments({
      status: { $in: ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'] },
    }),

    // Revenue: completed orders today
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: todayStart },
        },
      },
      {
        $group: {
          _id: null,
          totalPaise: { $sum: '$pricing.totalPaise' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Revenue MTD
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: mtdStart },
        },
      },
      {
        $group: {
          _id: null,
          totalPaise: { $sum: '$pricing.totalPaise' },
        },
      },
    ]),

    // Revenue YTD
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: ytdStart },
        },
      },
      {
        $group: {
          _id: null,
          totalPaise: { $sum: '$pricing.totalPaise' },
        },
      },
    ]),

    // Total orders today (for cancellation rate)
    Order.countDocuments({ createdAt: { $gte: todayStart } }),

    // Cancelled orders today
    Order.countDocuments({
      status: 'cancelled',
      cancelledAt: { $gte: todayStart },
    }),

    // SLA: orders completed within 45 min of creation today
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: todayStart },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          durationMs: { $subtract: ['$completedAt', '$createdAt'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withinSla: {
            $sum: {
              $cond: [{ $lte: ['$durationMs', 45 * 60 * 1000] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  // Active users: users with an order in the last 30 minutes
  const activeUsersResult = await Order.distinct('userId', {
    createdAt: { $gte: thirtyMinAgo },
  });

  const gmvToday = completedToday[0]?.totalPaise || 0;
  const gmvMTD = completedMTD[0]?.totalPaise || 0;
  const gmvYTD = completedYTD[0]?.totalPaise || 0;

  const slaData = slaOrders[0] || { total: 0, withinSla: 0 };
  const slaCompliance = slaData.total > 0
    ? Math.round((slaData.withinSla / slaData.total) * 100)
    : 100;

  const cancellationRate = totalOrdersToday > 0
    ? Math.round((cancelledToday / totalOrdersToday) * 100)
    : 0;

  const result = {
    activeUsers: activeUsersResult.length,
    activeWorkers,
    ordersLive,
    revenueToday: Math.round(gmvToday * COMMISSION_RATE),
    revenueMTD: Math.round(gmvMTD * COMMISSION_RATE),
    revenueYTD: Math.round(gmvYTD * COMMISSION_RATE),
    gmvToday,
    gmvMTD,
    gmvYTD,
    slaCompliance,
    cancellationRate,
    ordersCompletedToday: completedToday[0]?.count || 0,
    updatedAt: new Date().toISOString(),
  };

  await setCache(cacheKey, result);
  return result;
}

// ── 2. getCityHealthScores ───────────────────────────────────────────────────

async function getCityHealthScores() {
  const cacheKey = 'zi:cmd:city_health';
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const { start: todayStart } = todayBounds();

  // Group orders by city (using pickupLocation.address as proxy — ideally cityId field)
  // Since orders don't have a cityId, we approximate from worker's cityId
  const cityStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: todayStart },
      },
    },
    {
      $lookup: {
        from: 'workers',
        localField: 'workerId',
        foreignField: '_id',
        as: 'worker',
      },
    },
    {
      $unwind: { path: '$worker', preserveNullAndEmpty: false },
    },
    {
      $group: {
        _id: '$worker.cityId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        avgRating: { $avg: '$userRating' },
        totalRevenuePaise: { $sum: '$pricing.totalPaise' },
        slaCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $lte: [{ $subtract: ['$completedAt', '$createdAt'] }, 45 * 60 * 1000] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const result = cityStats.map((city) => {
    const cancelRate = city.total > 0 ? (city.cancelled / city.total) * 100 : 0;
    const slaRate = city.completed > 0 ? (city.slaCount / city.completed) * 100 : 100;
    const ratingScore = city.avgRating ? (city.avgRating / 5) * 100 : 70;

    // Weighted health score
    const healthScore = Math.round(
      slaRate * 0.4 +
      ratingScore * 0.3 +
      Math.max(0, 100 - cancelRate) * 0.2 +
      Math.min(100, (city.completed / Math.max(city.total, 1)) * 100) * 0.1
    );

    return {
      cityId: city._id || 'unknown',
      name: city._id || 'Unknown',
      ordersToday: city.total,
      completedToday: city.completed,
      cancelledToday: city.cancelled,
      cancellationRate: Math.round(cancelRate),
      slaCompliance: Math.round(slaRate),
      avgRating: city.avgRating ? Math.round(city.avgRating * 10) / 10 : null,
      revenueToday: Math.round((city.totalRevenuePaise || 0) * COMMISSION_RATE),
      healthScore,
    };
  });

  result.sort((a, b) => b.healthScore - a.healthScore);

  await setCache(cacheKey, result, 30);
  return result;
}

// ── 3. getServiceHealth ──────────────────────────────────────────────────────

async function getServiceHealth() {
  const cacheKey = 'zi:cmd:service_health';
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneMinAgo = new Date(now.getTime() - 60 * 1000);

  const [recentOrders, stuckOrders, pendingPayments] = await Promise.all([
    // Order service: orders created in last 5 min
    Order.countDocuments({ createdAt: { $gte: fiveMinAgo } }),

    // Worker match: orders stuck in 'searching' > 10 min
    Order.countDocuments({
      status: 'searching',
      updatedAt: { $lte: new Date(now.getTime() - 10 * 60 * 1000) },
    }),

    // Payment service: pending payment orders older than 5 min
    Order.countDocuments({
      'payment.status': 'pending',
      status: 'completed',
      updatedAt: { $lte: fiveMinAgo },
    }),
  ]);

  // Order service health
  let orderServiceStatus = 'healthy';
  let orderMetric = `${recentOrders} orders in last 5m`;

  // Worker match health
  let workerMatchStatus = 'healthy';
  let workerMatchMetric = `${stuckOrders} orders stuck in search`;
  if (stuckOrders > 20) workerMatchStatus = 'degraded';
  if (stuckOrders > 50) workerMatchStatus = 'down';

  // Payment health
  let paymentStatus = 'healthy';
  let paymentMetric = `${pendingPayments} pending settlements`;
  if (pendingPayments > 10) paymentStatus = 'degraded';
  if (pendingPayments > 30) paymentStatus = 'down';

  // Redis health
  let redisStatus = 'healthy';
  let redisMetric = 'connected';
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    redisMetric = `${latency}ms latency`;
    if (latency > 100) redisStatus = 'degraded';
  } catch {
    redisStatus = 'down';
    redisMetric = 'connection failed';
  }

  const result = [
    { service: 'order', status: orderServiceStatus, metric: orderMetric },
    { service: 'worker_match', status: workerMatchStatus, metric: workerMatchMetric },
    { service: 'payment', status: paymentStatus, metric: paymentMetric },
    { service: 'redis', status: redisStatus, metric: redisMetric },
  ];

  await setCache(cacheKey, result, 15);
  return result;
}

// ── 4. getRevenueBreakdown ───────────────────────────────────────────────────

async function getRevenueBreakdown(period = 'today') {
  const cacheKey = `zi:cmd:revenue:${period}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  let startDate;
  const now = new Date();

  if (period === 'today') {
    const b = todayBounds();
    startDate = b.start;
  } else if (period === 'mtd') {
    startDate = mtdBounds().start;
  } else if (period === 'ytd') {
    startDate = ytdBounds().start;
  } else {
    startDate = todayBounds().start;
  }

  const [byCategory, byCity, total] = await Promise.all([
    // Revenue by service/category
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: '$service',
          orders: { $sum: 1 },
          gmvPaise: { $sum: '$pricing.totalPaise' },
        },
      },
      { $sort: { gmvPaise: -1 } },
      { $limit: 20 },
    ]),

    // Revenue by city (via worker)
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: startDate, $lte: now },
          workerId: { $ne: null },
        },
      },
      {
        $lookup: {
          from: 'workers',
          localField: 'workerId',
          foreignField: '_id',
          as: 'worker',
        },
      },
      { $unwind: { path: '$worker', preserveNullAndEmpty: false } },
      {
        $group: {
          _id: '$worker.cityId',
          orders: { $sum: 1 },
          gmvPaise: { $sum: '$pricing.totalPaise' },
        },
      },
      { $sort: { gmvPaise: -1 } },
    ]),

    // Total
    Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          gmvPaise: { $sum: '$pricing.totalPaise' },
          orders: { $sum: 1 },
        },
      },
    ]),
  ]);

  // By hour (only for today period)
  let byHour = [];
  if (period === 'today') {
    const hourlyData = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          completedAt: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: { $hour: '$completedAt' },
          orders: { $sum: 1 },
          gmvPaise: { $sum: '$pricing.totalPaise' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    byHour = Array.from({ length: 24 }, (_, h) => {
      const found = hourlyData.find((d) => d._id === h);
      return {
        hour: h,
        orders: found?.orders || 0,
        gmvPaise: found?.gmvPaise || 0,
        revenuePaise: Math.round((found?.gmvPaise || 0) * COMMISSION_RATE),
      };
    });
  }

  const gmvTotal = total[0]?.gmvPaise || 0;
  const result = {
    period,
    gmvPaise: gmvTotal,
    revenuePaise: Math.round(gmvTotal * COMMISSION_RATE),
    orders: total[0]?.orders || 0,
    byCategory: byCategory.map((c) => ({
      category: c._id,
      orders: c.orders,
      gmvPaise: c.gmvPaise,
      revenuePaise: Math.round(c.gmvPaise * COMMISSION_RATE),
    })),
    byCity: byCity.map((c) => ({
      cityId: c._id || 'unknown',
      orders: c.orders,
      gmvPaise: c.gmvPaise,
      revenuePaise: Math.round(c.gmvPaise * COMMISSION_RATE),
    })),
    ...(period === 'today' ? { byHour } : {}),
  };

  const ttl = period === 'today' ? 30 : 120;
  await setCache(cacheKey, result, ttl);
  return result;
}

// ── 5. getTopWorkers ─────────────────────────────────────────────────────────

async function getTopWorkers(limit = 10) {
  const cacheKey = `zi:cmd:top_workers:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const { start: thirtyDaysAgo } = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { start: d };
  })();

  // Get top workers by jobs completed in last 30 days
  const workerStats = await Order.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: thirtyDaysAgo },
        workerId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$workerId',
        jobsCompleted: { $sum: 1 },
        avgRating: { $avg: '$userRating' },
        totalEarningsPaise: { $sum: '$pricing.totalPaise' },
      },
    },
    { $sort: { jobsCompleted: -1, avgRating: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'workers',
        localField: '_id',
        foreignField: '_id',
        as: 'worker',
      },
    },
    { $unwind: '$worker' },
    {
      $project: {
        workerId: '$_id',
        name: '$worker.name',
        phone: '$worker.phone',
        isOnline: '$worker.isOnline',
        skills: '$worker.skills',
        cityId: '$worker.cityId',
        overallRating: '$worker.rating',
        jobsCompleted: 1,
        avgRating30d: { $round: ['$avgRating', 1] },
        totalEarningsPaise: 1,
      },
    },
  ]);

  await setCache(cacheKey, workerStats, 60);
  return workerStats;
}

// ── 6. getTopServices ────────────────────────────────────────────────────────

async function getTopServices(limit = 10) {
  const cacheKey = `zi:cmd:top_services:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: '$service',
        totalOrders: { $sum: 1 },
        completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        avgRating: { $avg: '$userRating' },
        gmvPaise: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, '$pricing.totalPaise', 0],
          },
        },
      },
    },
    { $sort: { totalOrders: -1 } },
    { $limit: limit },
    {
      $project: {
        service: '$_id',
        totalOrders: 1,
        completedOrders: 1,
        cancelledOrders: 1,
        completionRate: {
          $round: [
            { $multiply: [{ $divide: ['$completedOrders', { $max: ['$totalOrders', 1] }] }, 100] },
            1,
          ],
        },
        avgRating: { $round: ['$avgRating', 1] },
        gmvPaise: 1,
        revenuePaise: { $round: [{ $multiply: ['$gmvPaise', COMMISSION_RATE] }] },
      },
    },
  ]);

  await setCache(cacheKey, result, 60);
  return result;
}

// ── 7. getAlerts ─────────────────────────────────────────────────────────────

async function getAlerts() {
  const cacheKey = 'zi:cmd:alerts';
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const alerts = [];
  const now = new Date();
  const { start: todayStart } = todayBounds();

  try {
    const [
      metrics,
      cityHealth,
      stuckSearching,
    ] = await Promise.all([
      getLiveMetrics(),
      getCityHealthScores(),
      Order.countDocuments({
        status: 'searching',
        updatedAt: { $lte: new Date(now.getTime() - 10 * 60 * 1000) },
      }),
    ]);

    // Alert: SLA compliance below 85%
    if (metrics.slaCompliance < 85) {
      alerts.push({
        id: 'sla_low',
        severity: metrics.slaCompliance < 70 ? 'critical' : 'warning',
        title: 'SLA Compliance Below Target',
        message: `SLA compliance is at ${metrics.slaCompliance}% (target: 85%)`,
        metric: metrics.slaCompliance,
        threshold: 85,
        ts: now.toISOString(),
      });
    }

    // Alert: Cancellation rate above 20%
    if (metrics.cancellationRate > 20) {
      alerts.push({
        id: 'cancel_rate_high',
        severity: metrics.cancellationRate > 35 ? 'critical' : 'warning',
        title: 'High Cancellation Rate',
        message: `Cancellation rate is at ${metrics.cancellationRate}% (threshold: 20%)`,
        metric: metrics.cancellationRate,
        threshold: 20,
        ts: now.toISOString(),
      });
    }

    // Alert: Low active workers
    if (metrics.activeWorkers < 5) {
      alerts.push({
        id: 'workers_low',
        severity: metrics.activeWorkers === 0 ? 'critical' : 'warning',
        title: 'Critically Low Active Workers',
        message: `Only ${metrics.activeWorkers} workers are online platform-wide`,
        metric: metrics.activeWorkers,
        threshold: 5,
        ts: now.toISOString(),
      });
    }

    // Alert: Orders stuck in searching > 10 min
    if (stuckSearching > 10) {
      alerts.push({
        id: 'orders_stuck',
        severity: stuckSearching > 25 ? 'critical' : 'warning',
        title: 'Orders Stuck in Dispatch',
        message: `${stuckSearching} orders have been in 'searching' state for over 10 minutes`,
        metric: stuckSearching,
        threshold: 10,
        ts: now.toISOString(),
      });
    }

    // Alert: City health below 60
    for (const city of cityHealth) {
      if (city.healthScore < 60 && city.ordersToday >= 5) {
        alerts.push({
          id: `city_health_${city.cityId}`,
          severity: city.healthScore < 40 ? 'critical' : 'warning',
          title: `City Health Low: ${city.name}`,
          message: `${city.name} has a health score of ${city.healthScore}/100`,
          cityId: city.cityId,
          metric: city.healthScore,
          threshold: 60,
          ts: now.toISOString(),
        });
      }
    }

    // Alert: No revenue today (possible payment pipeline issue)
    if (metrics.revenueToday === 0 && now.getHours() >= 10) {
      alerts.push({
        id: 'no_revenue_today',
        severity: 'warning',
        title: 'No Revenue Recorded Today',
        message: 'Zero platform revenue recorded — possible payment pipeline issue',
        metric: 0,
        threshold: 1,
        ts: now.toISOString(),
      });
    }

  } catch (err) {
    alerts.push({
      id: 'alert_system_error',
      severity: 'warning',
      title: 'Alert System Partial Failure',
      message: `Could not evaluate all alert conditions: ${err.message}`,
      ts: now.toISOString(),
    });
  }

  // Sort: critical first
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] || 99) - (order[b.severity] || 99);
  });

  await setCache(cacheKey, alerts, 30);
  return alerts;
}

module.exports = {
  getLiveMetrics,
  getCityHealthScores,
  getServiceHealth,
  getRevenueBreakdown,
  getTopWorkers,
  getTopServices,
  getAlerts,
};
