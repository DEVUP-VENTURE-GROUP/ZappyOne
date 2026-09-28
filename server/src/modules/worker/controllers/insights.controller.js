const Worker = require('../worker.model');
const { haversineKm } = require('../../../core/geo/distance');
const zoneService = require('../../zone/zone.service');
const pricingService = require('../../pricing/pricing.service');
const { ServiceLine } = require('../../onboarding/onboarding.model');

/** Where the work is and how the worker is doing: demand zones, local reputation, leaderboard, benchmarks, per-job earnings, goals. */

/** Active service zones drawn by admin, each reduced to its centre point. */
async function liveZoneCentres() {
  const zones = await zoneService.getAllZones();
  return zones
    .filter((z) => z.status === 'active' && z.polygon?.coordinates?.[0]?.length)
    .map((z) => {
      const ring = z.polygon.coordinates[0];
      const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1) : ring;
      const lng = pts.reduce((a, c) => a + c[0], 0) / pts.length;
      const lat = pts.reduce((a, c) => a + c[1], 0) / pts.length;
      return { id: String(z._id), name: z.name, lat, lng };
    });
}

async function getDemandZones(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    // Positioning-bonus config (read once, not per zone).
    const _zoneCfg = await pricingService.getActiveConfig().catch(() => ({}));
    const centres = await liveZoneCentres();

    const zones = await Promise.all(
      centres.map(async (zone) => {
        // Redis down reads as zero demand and supply, which renders as "low".
        const { demand, supply } = await pricingService.zoneGap(zone.lat, zone.lng)
          .catch(() => ({ demand: 0, supply: 0 }));

        const distKm = haversineKm(lat, lng, zone.lat, zone.lng);

        let level;
        if (supply === 0 && demand > 0) level = 'very_high';
        else if (demand === 0 && supply === 0) level = 'low';
        else {
          const ratio = demand / Math.max(supply, 1);
          if (ratio >= 3)        level = 'very_high';
          else if (ratio >= 1.5) level = 'high';
          else if (ratio >= 0.5) level = 'medium';
          else                   level = 'low';
        }

        const waitMin = supply === 0
          ? (demand > 0 ? '<2' : '10+')
          : Math.max(1, Math.round(distKm / 20 * 60));

        // ZeroWait L3: under-supplied cells pay a positioning bonus. Show it, so a
        // worker can see there is real money in moving there — that's what keeps
        // the Ready Pool dense where demand actually lands.
        const gap = demand - supply;
        const isHot = _zoneCfg.positioningEnabled !== false
          && gap >= (_zoneCfg.positioningMinGap ?? 2);
        const bonusPaise = isHot ? (_zoneCfg.positioningBonusPaise ?? 3000) : 0;

        return {
          id: zone.id,
          name: zone.name,
          distKm: parseFloat(distKm.toFixed(1)),
          level, demand, supply, waitMin,
          gap,
          hot: isHot,
          bonusPaise,
        };
      })
    );

    const nearby = zones
      .filter((z) => z.distKm <= 15)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 6);

    res.json({ zones: nearby });
  } catch (err) { next(err); }
}

/* Neighborhood Reputation */

async function getNeighborhoodRep(req, res, next) {
  try {
    const Order = require('../../order/order.model');
    const workerId = req.params.id || req.auth.sub;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    /* 5km radius around the customer/pickup location */
    const radiusMeters = 5000;
    const since90d = new Date(Date.now() - 90 * 86400000);

    const localOrders = await Order.find({
      workerId,
      status: 'completed',
      completedAt: { $gte: since90d },
      pickupLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusMeters,
        },
      },
    }).select('userRating completedAt').lean().limit(200);

    const totalLocal = localOrders.length;
    const ratedLocal = localOrders.filter(o => o.userRating);
    const localRating = ratedLocal.length > 0
      ? Math.round((ratedLocal.reduce((s, o) => s + o.userRating, 0) / ratedLocal.length) * 10) / 10
      : null;

    // Area label: the admin zone the worker is standing in.
    const zone = await zoneService.getZoneForPoint(lng, lat).catch(() => null);
    const areaLabel = zone?.name || `${lat.toFixed(2)},${lng.toFixed(2)}`;

    const isLocalHero = totalLocal >= 10 && localRating && localRating >= 4.5;

    res.json({
      workerId: String(workerId),
      areaLabel,
      totalLocalJobs: totalLocal,
      localRating,
      isLocalHero,
      radiusKm: radiusMeters / 1000,
    });
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const Order = require('../../order/order.model');
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const pipeline = [
      { $match: { status: 'completed', completedAt: { $gte: since }, workerId: { $ne: null } } },
      { $group: { _id: '$workerId', weekEarnings: { $sum: '$pricing.total' }, jobs: { $sum: 1 } } },
      { $sort: { weekEarnings: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'workers',
          localField: '_id',
          foreignField: '_id',
          as: 'w',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $unwind: { path: '$w', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          workerId: '$_id',
          name: '$w.name',
          weekEarnings: 1,
          jobs: 1,
        },
      },
    ];

    const results = await Order.aggregate(pipeline);
    const leaders = results.map((r, i) => ({
      rank:        i + 1,
      workerId:    String(r.workerId),
      name:        r.name ? `${r.name.charAt(0)}*** ${r.name.split(' ').pop()?.charAt(0) || ''}.` : 'Worker',
      weekEarnings: Math.round(r.weekEarnings),
      jobs:        r.jobs,
    }));

    // If caller is authenticated worker, find their rank
    let myRank = null;
    if (req.auth?.role === 'worker') {
      const allResults = await Order.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: since }, workerId: { $ne: null } } },
        { $group: { _id: '$workerId', weekEarnings: { $sum: '$pricing.total' } } },
        { $sort: { weekEarnings: -1 } },
      ]);
      const idx = allResults.findIndex((r) => String(r._id) === String(req.auth.sub));
      myRank = idx >= 0 ? { rank: idx + 1, total: allResults.length } : null;
    }

    res.json({ leaders, myRank });
  } catch (err) { next(err); }
}

/* Zone Benchmark */

async function getZoneBenchmark(req, res, next) {
  try {
    const Order = require('../../order/order.model');
    const mongoose = require('mongoose');
    const wid = new mongoose.Types.ObjectId(String(req.auth.sub));

    const since30d = new Date(Date.now() - 30 * 86400000);
    const worker = await Worker.findById(req.auth.sub).select('currentLocation rating completedJobs wallet').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // My earnings this month
    const myAgg = await Order.aggregate([
      { $match: { workerId: wid, status: 'completed', completedAt: { $gte: since30d } } },
      { $group: { _id: null, earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', { $multiply: ['$pricing.total', 80] }] } }, jobs: { $sum: 1 } } },
    ]);
    const myEarnings = (myAgg[0]?.earningsPaise || 0);
    const myJobs = myAgg[0]?.jobs || 0;

    // Zone average — all workers who completed jobs in a 10km radius
    const [lng, lat] = worker.currentLocation?.coordinates || [78.9629, 20.5937];
    const nearbyWorkerIds = await Worker.find({
      currentLocation: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } },
      completedJobs: { $gt: 0 },
    }).select('_id').lean().then(ws => ws.map(w => w._id));

    const zoneAgg = await Order.aggregate([
      { $match: { workerId: { $in: nearbyWorkerIds }, status: 'completed', completedAt: { $gte: since30d } } },
      { $group: { _id: '$workerId', earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', { $multiply: ['$pricing.total', 80] }] } } } },
    ]);

    const earnings = zoneAgg.map(w => w.earningsPaise).sort((a, b) => a - b);
    const zoneAvg = earnings.length ? Math.round(earnings.reduce((s, v) => s + v, 0) / earnings.length) : 0;
    const rank = earnings.filter(e => e < myEarnings).length;
    const percentile = earnings.length > 1 ? Math.round((rank / (earnings.length - 1)) * 100) : 100;

    res.json({
      myEarningsPaise: myEarnings,
      myEarningsRupees: Math.round(myEarnings / 100),
      myJobs,
      zoneAvgPaise: zoneAvg,
      zoneAvgRupees: Math.round(zoneAvg / 100),
      zoneWorkerCount: nearbyWorkerIds.length,
      percentile,
      myRating: worker.rating,
      myCompletedJobs: worker.completedJobs,
    });
  } catch (err) { next(err); }
}

/* Per-Job Earnings Breakdown */

/** Service names come from the catalog; an unknown code is shown tidied up. */
function toLabel(slug, names) {
  return names.get(slug) || (slug || 'Service').replace(/_/g, ' ').replace(/w/g, (c) => c.toUpperCase());
}

async function getJobEarnings(req, res, next) {
  try {
    const Order = require('../../order/order.model');
    const page = Number(req.query.page) || 1;
    const limit = 25;
    const { period } = req.query; // week | month | 3months

    const now = new Date();
    let since = null;
    if (period === 'week') { since = new Date(now); since.setDate(now.getDate() - 7); }
    else if (period === 'month') { since = new Date(now); since.setMonth(now.getMonth() - 1); }
    else if (period === '3months') { since = new Date(now); since.setMonth(now.getMonth() - 3); }

    const matchQuery = { workerId: req.auth.sub, status: 'completed' };
    if (since) matchQuery.completedAt = { $gte: since };

    const [orders, total, agg] = await Promise.all([
      Order.find(matchQuery)
        .sort({ completedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('service pricing earnings completedAt orderId surgeMultiplier tip')
        .lean(),
      Order.countDocuments(matchQuery),
      Order.aggregate([
        { $match: matchQuery },
        { $group: {
          _id: null,
          totalNet: { $sum: '$earnings.workerPaise' },
          totalTips: { $sum: '$tip' },
          totalBonus: { $sum: '$earnings.bonusPaise' },
          count: { $sum: 1 },
          surgeCount: { $sum: { $cond: [{ $gt: ['$surgeMultiplier', 1] }, 1, 0] } },
        }},
      ]),
    ]);

    const lines = await ServiceLine.find({ code: { $in: [...new Set(orders.map((o) => o.service).filter(Boolean))] } })
      .select('code name').lean();
    const names = new Map(lines.map((l) => [l.code, l.name]));

    const jobs = orders.map(o => {
      const grossPaise = o.pricing?.totalPaise ?? (o.pricing?.total || 0) * 100;
      // Before settlement the split is the commission locked on the order, never a guess.
      const rate = o.earnings?.commissionRate ?? o.pricing?.snapshotCommissionRate ?? 0;
      const platformPaise = o.earnings?.platformPaise ?? Math.round(grossPaise * rate);
      const workerPaise = o.earnings?.workerPaise ?? grossPaise - platformPaise;
      const bonusPaise = o.earnings?.bonusPaise || 0;
      const tipPaise = o.tip || 0;
      return {
        _id: o._id,
        orderId: o.orderId || String(o._id).slice(-8).toUpperCase(),
        service: o.service,
        serviceLabel: toLabel(o.service, names),
        completedAt: o.completedAt,
        gross: grossPaise,
        platformFee: platformPaise,
        net: workerPaise + bonusPaise + tipPaise,
        bonus: bonusPaise,
        tip: tipPaise,
        surgeMultiplier: o.surgeMultiplier || 1,
        commissionPct: grossPaise > 0 ? Math.round((platformPaise / grossPaise) * 100) : Math.round(rate * 100),
      };
    });

    const s = agg[0] || {};
    res.json({
      jobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalNet: (s.totalNet || 0) + (s.totalTips || 0) + (s.totalBonus || 0),
        totalTips: s.totalTips || 0,
        count: s.count || 0,
        surgeCount: s.surgeCount || 0,
      },
    });
  } catch (err) { next(err); }
}

async function getGoals(req, res, next) {
  try {
    const Order = require('../../order/order.model');
    const worker = await Worker.findById(req.auth.sub).select('goals').lean();
    if (!worker) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);

    const [dailyAgg, weeklyAgg] = await Promise.all([
      Order.aggregate([
        { $match: { workerId: require('mongoose').Types.ObjectId.createFromHexString(req.auth.sub), status: 'completed', completedAt: { $gte: startOfDay } } },
        { $group: { _id: null, totalPaise: { $sum: { $add: ['$earnings.workerPaise', '$tip', '$earnings.bonusPaise'] } } } },
      ]),
      Order.aggregate([
        { $match: { workerId: require('mongoose').Types.ObjectId.createFromHexString(req.auth.sub), status: 'completed', completedAt: { $gte: startOfWeek } } },
        { $group: { _id: null, totalPaise: { $sum: { $add: ['$earnings.workerPaise', '$tip', '$earnings.bonusPaise'] } } } },
      ]),
    ]);

    const dailyEarned = dailyAgg[0]?.totalPaise ?? 0;
    const weeklyEarned = weeklyAgg[0]?.totalPaise ?? 0;

    const goals = (worker.goals ?? []).map(g => ({
      ...g,
      earnedPaise: g.period === 'daily' ? dailyEarned : weeklyEarned,
    }));
    res.json({ goals, dailyEarned, weeklyEarned });
  } catch (err) { next(err); }
}

async function setGoal(req, res, next) {
  try {
    const { period, targetPaise } = req.body;
    await Worker.updateOne(
      { _id: req.auth.sub },
      { $pull: { goals: { period } } }
    );
    await Worker.updateOne(
      { _id: req.auth.sub },
      { $push: { goals: { period, targetPaise } } }
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  getDemandZones,
  getNeighborhoodRep,
  getLeaderboard,
  getZoneBenchmark,
  getJobEarnings,
  getGoals,
  setGoal,
};
