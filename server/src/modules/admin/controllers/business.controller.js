const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const cachedAnalytics = require('../lib/cached-analytics');

/**
 * Per-service P&L — revenue, worker cost, and platform margin.
 * Uses earnings snapshots locked at completion for accuracy.
 * GMV ≠ revenue: GMV is what the customer paid; revenue is the platform's cut.
 */
async function getServicePnL(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const since = new Date(Date.now() - days * 86_400_000);

    const pnl = await cachedAnalytics(`admin:pnl:${days}`, 120, async () => {
      const rows = await Order.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: since } } },
        {
          $group: {
            _id: '$service',
            orders: { $sum: 1 },
            // GMV: total paid by customers (prefer paise field for precision)
            gmvPaise: {
              $sum: {
                $ifNull: [
                  '$pricing.totalPaise',
                  { $multiply: ['$pricing.total', 100] },
                ],
              },
            },
            // Platform revenue: actual commission earned
            revenuePaise: { $sum: { $ifNull: ['$earnings.platformPaise', 0] } },
            // Worker cost: what the platform paid out to workers
            workerPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } },
            avgFare: {
              $avg: {
                $ifNull: [
                  '$pricing.totalPaise',
                  { $multiply: ['$pricing.total', 100] },
                ],
              },
            },
            avgCommission: { $avg: '$earnings.commissionRate' },
          },
        },
        { $sort: { gmvPaise: -1 } },
      ]);

      return rows.map((r) => {
        const marginPct =
          r.gmvPaise > 0
            ? Math.round((r.revenuePaise / r.gmvPaise) * 1000) / 10
            : 0;
        // Profitability signal: if commission rate drops well below config (e.g. due to Pro workers)
        const isLowMargin = marginPct < 15; // below 15% platform cut is a warning
        return {
          service: r._id,
          orders: r.orders,
          gmvRupees: Math.round(r.gmvPaise / 100),
          revenueRupees: Math.round(r.revenuePaise / 100),
          workerCostRupees: Math.round(r.workerPaise / 100),
          marginPct,
          avgFareRupees: Math.round((r.avgFare || 0) / 100),
          avgCommissionPct: Math.round((r.avgCommission || 0) * 1000) / 10,
          isLowMargin,
          isUnprofitable: r.revenuePaise <= 0 && r.orders > 0,
        };
      });
    });

    res.json({ sinceDays: days, services: pnl });
  } catch (err) {
    next(err);
  }
}

/**
 * Worker churn risk — identifies workers at risk of leaving due to low earnings.
 * Thresholds are business-configurable in the response but default to:
 *   - Weekly earnings < ₹500 = at-risk
 *   - No job in 7 days but was active = dormant
 *   - Cancel/reject rate above 20% = quality risk (likely to be deactivated)
 */
async function getChurnRisk(req, res, next) {
  try {
    const EARNINGS_FLOOR_PAISE = 50_000; // ₹500/week threshold
    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const since14d = new Date(Date.now() - 14 * 86_400_000);

    const [lowEarners, dormant, highCancel] = await Promise.all([
      // Workers with < ₹500 earnings this week who have completed at least 1 job
      Order.aggregate([
        {
          $match: {
            status: 'completed',
            completedAt: { $gte: since7d },
            workerId: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$workerId',
            weeklyPaise: { $sum: '$earnings.workerPaise' },
            jobs: { $sum: 1 },
          },
        },
        { $match: { weeklyPaise: { $lt: EARNINGS_FLOOR_PAISE } } },
        { $sort: { weeklyPaise: 1 } },
        { $limit: 50 },
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
            workerId: '$_id',
            name: '$w.name',
            phone: '$w.phone',
            skills: '$w.skills',
            weeklyPaise: 1,
            weeklyRupees: { $round: [{ $divide: ['$weeklyPaise', 100] }, 0] },
            jobs: 1,
          },
        },
      ]),

      // Workers who were active 8-14 days ago but have 0 jobs in last 7 days (going dormant)
      Worker.aggregate([
        {
          $lookup: {
            from: 'orders',
            let: { wid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$workerId', '$$wid'] },
                  status: 'completed',
                  completedAt: { $gte: since7d },
                },
              },
              { $count: 'n' },
            ],
            as: 'recent',
          },
        },
        {
          $lookup: {
            from: 'orders',
            let: { wid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$workerId', '$$wid'] },
                  status: 'completed',
                  completedAt: { $gte: since14d, $lt: since7d },
                },
              },
              { $count: 'n' },
            ],
            as: 'prevWeek',
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $size: '$recent' }, 0] },
                { $gt: [{ $ifNull: [{ $first: '$prevWeek.n' }, 0] }, 0] },
              ],
            },
            isBlocked: false,
          },
        },
        { $project: { name: 1, phone: 1, skills: 1, completedJobs: 1 } },
        { $limit: 30 },
      ]),

      // High cancel/reject rate workers (likely to churn or be auto-deactivated)
      Worker.find(
        {
          isBlocked: false,
          'penalties.totalOffers': { $gt: 5 },
          $expr: {
            $gt: [
              {
                $divide: [
                  '$penalties.totalRejects',
                  { $max: ['$penalties.totalOffers', 1] },
                ],
              },
              0.4,
            ],
          },
        },
        {
          name: 1,
          phone: 1,
          skills: 1,
          penalties: 1,
          completedJobs: 1,
          rating: 1,
        },
      )
        .limit(30)
        .lean(),
    ]);

    res.json({
      earningsFloorRupees: EARNINGS_FLOOR_PAISE / 100,
      lowEarners: lowEarners.length,
      dormant: dormant.length,
      highCancelRate: highCancel.length,
      total: lowEarners.length + dormant.length + highCancel.length,
      details: { lowEarners, dormant, highCancelRate: highCancel },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Dead category report — services with 0 orders in the last N days.
 * Used to decide whether to disable a service and free up UX space.
 */
async function getDeadCategories(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 180);
    const since = new Date(Date.now() - days * 86_400_000);
    const ServiceCatalog = require('../../service/service-catalog.model');

    const [activeServices, usedServices] = await Promise.all([
      ServiceCatalog.find(
        { isActive: true },
        { code: 1, name: 1, category: 1, priceRangeMinPaise: 1 },
      ).lean(),
      Order.distinct('service', { createdAt: { $gte: since } }),
    ]);

    const usedSet = new Set(usedServices);
    const dead = activeServices
      .filter((s) => !usedSet.has(s.code))
      .map((s) => ({
        code: s.code,
        name: s.name,
        category: s.category,
        daysSinceLastOrder: days,
      }));

    // Also get last order date for partially-dead services (low usage)
    const lowUsage = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          service: { $in: activeServices.map((s) => s.code) },
        },
      },
      {
        $group: {
          _id: '$service',
          count: { $sum: 1 },
          last: { $max: '$createdAt' },
        },
      },
      { $match: { count: { $lte: 2 } } }, // less than 3 orders in the window
      { $sort: { count: 1 } },
    ]);

    res.json({
      windowDays: days,
      dead: { count: dead.length, services: dead },
      lowUsage: {
        count: lowUsage.length,
        threshold: 3,
        services: lowUsage.map((s) => ({
          service: s._id,
          count: s.count,
          lastOrderAt: s.last,
        })),
      },
      recommendation:
        dead.length > 0
          ? `${dead.length} active service(s) have had 0 orders in ${days} days. Consider disabling them.`
          : 'All active services received orders in the window.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Geo readiness — tells admin whether a lat/lng area has enough workers
 * to reliably fulfil orders. Used before launching in a new city.
 */
async function getGeoReadiness(req, res, next) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(Number(req.query.radiusKm) || 15, 50);

    if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Valid lat and lng required' });
    }

    const [totalWorkers, approvedWorkers, onlineWorkers, recentOrders] =
      await Promise.all([
        // Total registered workers in radius.
        // NOTE: $near is illegal inside countDocuments (it runs as an aggregation,
        // which forbids geo-sort operators). $geoWithin/$centerSphere counts within
        // a radius without sorting — radians = km / earthRadiusKm(6378.1).
        Worker.countDocuments({
          currentLocation: { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6378.1] } },
        }),
        // KYC-approved workers
        Worker.countDocuments({
          currentLocation: { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6378.1] } },
          'kyc.status': 'approved',
          isBlocked: false,
        }),
        // Currently online workers (Redis GEO)
        (async () => {
          try {
            const { redis: r } = require('../../../config/redis');
            const res2 = await r
              .geosearch(
                'workers:online',
                'FROMLONLAT',
                lng,
                lat,
                'BYRADIUS',
                radiusKm,
                'km',
                'COUNT',
                100,
              )
              .catch(() => []);
            return Array.isArray(res2) ? res2.length : 0;
          } catch {
            return 0;
          }
        })(),
        // Orders attempted in this area in the last 30 days
        Order.countDocuments({
          pickupLocation: { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6378.1] } },
          createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
        }),
      ]);

    // Skills coverage: which services have at least 1 approved worker?
    const workerSkills = await Worker.find(
      {
        currentLocation: { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6378.1] } },
        'kyc.status': 'approved',
        isBlocked: false,
      },
      { skills: 1 },
    ).lean();
    const coveredSkills = [
      ...new Set(workerSkills.flatMap((w) => w.skills || [])),
    ].sort();

    const isReady = approvedWorkers >= 5; // minimum viable: 5 approved workers in radius
    const isOperational = onlineWorkers >= 2;

    res.json({
      lat,
      lng,
      radiusKm,
      totalWorkers,
      approvedWorkers,
      onlineWorkers,
      recentOrders,
      coveredSkills,
      isReady,
      isOperational,
      readinessScore: Math.min(
        100,
        Math.round((approvedWorkers / 5) * 60 + (onlineWorkers / 3) * 40),
      ),
      recommendation: !isReady
        ? `Need ${Math.max(0, 5 - approvedWorkers)} more approved worker(s) before launching in this area.`
        : isOperational
          ? 'Area is operational — sufficient workers online and approved.'
          : 'Area has approved workers but none currently online. Arrange a soft launch.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Quote abandonment stats — quotes fetched but no order placed within 10 min.
 * Proxy for price sensitivity: high abandonment at a given price = price too high.
 */
async function getQuoteAbandonmentStats(req, res, next) {
  try {
    const days = Math.min(Number(req.query.days) || 7, 30);
    const since = new Date(Date.now() - days * 86_400_000);
    const { redis: r } = require('../../../config/redis');

    // Quote events are recorded in Redis sorted set: quote:{service}:{date} → count
    // (recorded by recordDemand calls from the quote endpoint)
    // We approximate abandonment as: quotes - orders placed in same window per service
    const [quoteCounts, orderCounts] = await Promise.all([
      // Orders that reached 'searching' or beyond = confirmed bookings
      Order.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$service', orders: { $sum: 1 } } },
      ]),
      // Total quotes: currently stored in demand Redis keys (approximate)
      // For a precise count, we'd need a separate quote-event log.
      // Return the data we have with a note about approximation.
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            status: { $in: ['cancelled', 'failed'] },
          },
        },
        { $group: { _id: '$service', earlyExits: { $sum: 1 } } },
      ]),
    ]);

    const orderMap = Object.fromEntries(
      orderCounts.map((r2) => [r2._id, r2.orders]),
    );
    const earlyExitMap = Object.fromEntries(
      quoteCounts.map((r2) => [r2._id, r2.earlyExits]),
    );

    // High early-exit rate (cancelled/failed ÷ total) = proxy for price sensitivity
    const allServices = [
      ...new Set([...Object.keys(orderMap), ...Object.keys(earlyExitMap)]),
    ];
    const sensitivity = allServices
      .map((svc) => {
        const total = orderMap[svc] || 0;
        const exits = earlyExitMap[svc] || 0;
        const exitRate = total > 0 ? Math.round((exits / total) * 100) : 0;
        return {
          service: svc,
          total,
          earlyExits: exits,
          exitRatePct: exitRate,
        };
      })
      .filter((s) => s.total >= 5) // minimum sample
      .sort((a, b) => b.exitRatePct - a.exitRatePct);

    res.json({
      windowDays: days,
      note: 'exitRatePct = (cancelled+failed) ÷ total orders — proxy for price-driven abandonment',
      highSensitivity: sensitivity.filter((s) => s.exitRatePct > 30),
      all: sensitivity,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getServicePnL,
  getChurnRisk,
  getDeadCategories,
  getGeoReadiness,
  getQuoteAbandonmentStats,
};
