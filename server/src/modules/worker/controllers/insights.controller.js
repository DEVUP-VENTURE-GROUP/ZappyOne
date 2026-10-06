const Worker = require('../worker.model');
const { haversineKm } = require('../../../core/geo/distance');
const zoneService = require('../../zone/zone.service');
const pricingService = require('../../pricing/pricing.service');

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


/**
 * The worker's earnings, job by job, for every kind of job (jobs/earnings),
 * plus what the Worker Shield Fund paid them for trips customers cancelled.
 * Same shape the Earnings page has always read.
 */
async function getJobEarnings(req, res, next) {
  try {
    const { finishedJobs } = require('../../jobs/earnings');
    const Transaction = require('../../payment/transaction.model');
    const page = Number(req.query.page) || 1;
    const limit = 25;
    const days = { week: 7, month: 30, '3months': 91 }[req.query.period];
    const since = days ? new Date(Date.now() - days * 86400000) : new Date(0);

    const [jobs, shield] = await Promise.all([
      finishedJobs({ workerId: req.auth.sub }, since),
      Transaction.find({
        'owner.kind': 'worker', 'owner.id': req.auth.sub, status: 'succeeded',
        reason: Transaction.REASONS.SHIELD_PAYOUT, createdAt: { $gte: since },
      }).select('amountPaise createdAt').lean(),
    ]);

    const rows = [
      ...jobs.map((j) => ({
        _id: j.id,
        orderId: j.reference || j.id.slice(-8).toUpperCase(),
        service: j.kind,
        serviceLabel: j.label.charAt(0).toUpperCase() + j.label.slice(1),
        completedAt: j.at,
        gross: j.gross + j.boostPaise,
        platformFee: j.platformPaise,
        net: j.paise + j.tipPaise,
        bonus: j.boostPaise,
        tip: j.tipPaise,
        surgeMultiplier: 1,
        cash: j.cash,
        commissionPct: j.gross > 0 ? Math.round((j.platformPaise / j.gross) * 100) : 0,
      })),
      ...shield.map((t) => ({
        _id: String(t._id), orderId: 'SHIELD', service: 'shield', serviceLabel: 'Cancellation pay (Shield fund)',
        completedAt: t.createdAt, gross: t.amountPaise, platformFee: 0, net: t.amountPaise, bonus: t.amountPaise,
        tip: 0, surgeMultiplier: 1, commissionPct: 0,
      })),
    ].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    res.json({
      jobs: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      totalPages: Math.ceil(rows.length / limit),
      summary: {
        totalNet: rows.reduce((t, r) => t + r.net, 0),
        totalTips: jobs.reduce((t, j) => t + j.tipPaise, 0),
        shieldPaise: shield.reduce((t, r) => t + r.amountPaise, 0),
        count: jobs.length,
        surgeCount: 0,
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
