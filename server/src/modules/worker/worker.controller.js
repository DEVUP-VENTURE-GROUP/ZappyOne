const Worker = require('./worker.model');
const workerService = require('./worker.service');
const orderService = require('../order/order.service');

async function getMe(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker });
  } catch (err) { next(err); }
}

async function goOnline(req, res, next) {
  try {
    const worker = await workerService.goOnline({ workerId: req.auth.sub, lat: req.body.lat, lng: req.body.lng });
    res.json({ worker });
  } catch (err) { next(err); }
}

async function goOffline(req, res, next) {
  try {
    const worker = await workerService.goOffline({ workerId: req.auth.sub });
    res.json({ worker });
  } catch (err) { next(err); }
}

async function updateLocation(req, res, next) {
  try {
    await workerService.updateLocation({ workerId: req.auth.sub, lat: req.body.lat, lng: req.body.lng, orderId: req.body.orderId });
    res.json({ ok: true });
  } catch (err) {
    // Location update is best-effort — Redis outages should not block the worker app.
    // Return 200 so the client doesn't retry-spam; log the failure server-side.
    if (err?.name === 'ReplyError' || err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      const logger = require('../../utils/logger');
      logger.warn({ workerId: req.auth.sub, err: err.message }, '[LOCATION] Redis unavailable — location update skipped');
      return res.json({ ok: true, degraded: true });
    }
    next(err);
  }
}

async function getEarnings(req, res, next) {
  try {
    const data = await workerService.getEarnings({ workerId: req.auth.sub, range: req.query.range });
    res.json(data);
  } catch (err) { next(err); }
}

async function getOrders(req, res, next) {
  try {
    const orders = await orderService.listByWorker(req.auth.sub, { page: Number(req.query.page) || 1 });
    res.json({ orders });
  } catch (err) { next(err); }
}

async function getNearbyWorkers(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const geoService = require('./geo.service');
    const workers = await geoService.findNearbyWorkers({ lat, lng, radiusKm: 5, limit: 25 });
    res.json({ workers, count: workers.length });
  } catch (err) { next(err); }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* Known zones — used as demand-hotspot seeds.
   In production, replace with a database of service areas. */
const DEMAND_ZONE_SEEDS = [
  { name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
  { name: 'HSR Layout',  lat: 12.9116, lng: 77.6389 },
  { name: 'BTM Layout',  lat: 12.9165, lng: 77.6101 },
  { name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
  { name: 'Whitefield',  lat: 12.9698, lng: 77.7500 },
  { name: 'Jayanagar',   lat: 12.9308, lng: 77.5839 },
  { name: 'Marathahalli',lat: 12.9591, lng: 77.6974 },
  { name: 'Electronic City', lat: 12.8458, lng: 77.6630 },
];

async function getDemandZones(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    const { redis } = require('../../config/redis');
    const logger = require('../../utils/logger');

    // Positioning-bonus config (read once, not per zone).
    const _zoneCfg = await require('../pricing/pricing.service')
      .getActiveConfig()
      .catch(() => ({}));

    const zones = await Promise.all(
      DEMAND_ZONE_SEEDS.map(async (zone) => {
        const bucket = `${zone.lat.toFixed(2)}:${zone.lng.toFixed(2)}`;
        let demand = 0, supply = 0;
        try {
          [demand, supply] = await Promise.all([
            redis.get(`demand:${bucket}`).then((v) => Number(v) || 0),
            redis.scard(`supply:${bucket}`).then((v) => Number(v) || 0),
          ]);
        } catch (redisErr) {
          // Redis unavailable — fall back to zero counts (renders as "low" demand)
          logger.warn({ bucket, err: redisErr.message }, '[DEMAND_ZONES] Redis unavailable — using fallback values');
        }

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

/* ── Shift Slots ─────────────────────────────────────────────────────────── */

async function getShifts(req, res, next) {
  try {
    const availService = require('./availability.service');
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to   = req.query.to   ? new Date(req.query.to)   : new Date(Date.now() + 7 * 86400000);
    const shifts = await availService.getShifts({ workerId: req.auth.sub, fromDate: from, toDate: to });
    const today  = await availService.getTodayShifts(req.auth.sub);
    res.json({ shifts, today });
  } catch (err) { next(err); }
}

async function previewShift(req, res, next) {
  try {
    const availService = require('./availability.service');
    const { startHour, endHour, lat, lng } = req.query;
    if (!startHour || !endHour || !lat || !lng) {
      return res.status(400).json({ error: 'startHour, endHour, lat, lng required' });
    }
    const data = await availService.previewShift({
      startHour: Number(startHour),
      endHour:   Number(endHour),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function commitShift(req, res, next) {
  try {
    const availService = require('./availability.service');
    const { startHour, endHour, lat, lng, date, zoneLabel } = req.body;
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
      return res.status(400).json({ error: 'startHour and endHour must be integers' });
    }
    const result = await availService.commitShift({
      workerId: req.auth.sub,
      date: date ? new Date(date) : new Date(),
      startHour,
      endHour,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      zoneLabel,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function cancelShiftSlot(req, res, next) {
  try {
    const availService = require('./availability.service');
    const doc = await availService.cancelSlot({
      workerId: req.auth.sub,
      startHour: Number(req.body.startHour),
      date: req.body.date ? new Date(req.body.date) : new Date(),
    });
    res.json({ ok: true, doc });
  } catch (err) { next(err); }
}

/* ── Wellness ──────────────────────────────────────────────────────────────── */

async function getWellness(req, res, next) {
  try {
    const wellnessService = require('./wellness.service');
    const data = await wellnessService.computeWellnessScore(req.auth.sub);
    if (!data) return res.status(404).json({ error: 'Worker not found' });
    res.json(data);
  } catch (err) { next(err); }
}

async function claimBreakBonus(req, res, next) {
  try {
    const wellnessService = require('./wellness.service');
    const result = await wellnessService.creditBreakBonus(req.auth.sub);
    if (!result.ok) return res.status(400).json({ error: 'No break bonus available right now' });
    res.json(result);
  } catch (err) { next(err); }
}

/* ── Neighborhood Reputation ───────────────────────────────────────────────── */

async function getNeighborhoodRep(req, res, next) {
  try {
    const Order = require('../order/order.model');
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

    /* Area label from demand-zone seeds (nearest match within 3km) */
    const ZONES = [
      { name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
      { name: 'HSR Layout',  lat: 12.9116, lng: 77.6389 },
      { name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
      { name: 'Whitefield',  lat: 12.9698, lng: 77.7500 },
      { name: 'Jayanagar',   lat: 12.9308, lng: 77.5839 },
      { name: 'BTM Layout',  lat: 12.9165, lng: 77.6101 },
      { name: 'Marathahalli',lat: 12.9591, lng: 77.6974 },
    ];
    const nearest = ZONES.reduce((best, z) => {
      const d = haversineKm(lat, lng, z.lat, z.lng);
      return (!best || d < best.d) ? { name: z.name, d } : best;
    }, null);
    const areaLabel = nearest?.d < 3 ? nearest.name : `${lat.toFixed(2)},${lng.toFixed(2)}`;

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

async function getPublicProfile(req, res, next) {
  try {
    const worker = await Worker.findById(req.params.id)
      .select('name rating completedJobs skills kyc.status penalties createdAt')
      .lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Trust signals: recent reviews + star breakdown + top services this pro does.
    const Order = require('../order/order.model');
    const rated = await Order.find({ workerId: worker._id, userRating: { $exists: true, $ne: null } })
      .select('userRating userReview service ratingSubmittedAt completedAt')
      .sort({ ratingSubmittedAt: -1 })
      .limit(60)
      .lean();

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const serviceCounts = {};
    const reviews = [];
    for (const o of rated) {
      breakdown[o.userRating] = (breakdown[o.userRating] || 0) + 1;
      if (o.service) serviceCounts[o.service] = (serviceCounts[o.service] || 0) + 1;
      if (o.userReview && reviews.length < 12) {
        reviews.push({
          rating: o.userRating,
          text: String(o.userReview).slice(0, 400),
          service: o.service,
          at: o.ratingSubmittedAt || o.completedAt,
        });
      }
    }
    const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);

    res.json({
      worker: {
        _id:           worker._id,
        name:          worker.name,
        rating:        worker.rating,
        completedJobs: worker.completedJobs,
        skills:        worker.skills || [],
        verified:      worker.kyc?.status === 'approved',
        memberSince:   worker.createdAt,
        acceptRate:    worker.penalties?.totalOffers > 0
          ? Math.round(((worker.penalties.totalOffers - (worker.penalties.totalRejects || 0)) / worker.penalties.totalOffers) * 100)
          : null,
        ratingCount:   rated.length,
        breakdown,
        topServices,
      },
      reviews,
    });
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const Order = require('../order/order.model');
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

async function updateProfile(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const { name, skills, bio, expertise } = req.body;
    const update = {};
    if (name)   update.name   = name;
    if (bio !== undefined) update.bio = bio;

    // When rich expertise is provided, it becomes the source of truth and the flat
    // `skills` dispatch match-set is derived from the union of all handled services.
    // An explicit `skills` array still wins if sent without expertise (legacy path).
    let effectiveSkills = skills;
    if (Array.isArray(expertise)) {
      update.expertise = expertise;
      const derived = [...new Set(expertise.flatMap(e => e.services || []))];
      if (derived.length) effectiveSkills = derived;
    }
    if (effectiveSkills) update.skills = effectiveSkills;

    // Capture the previous skills so removed ones can be pruned from Redis.
    const before = effectiveSkills
      ? await require('./worker.model').findById(workerId).select('skills').lean()
      : null;

    const worker = await require('./worker.model').findByIdAndUpdate(
      workerId,
      { $set: update },
      { new: true, runValidators: true }
    ).select('name skills bio expertise').lean();

    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Resync the Redis skill sets. (markOnline alone only ADDS — it never removed
    // skills the worker dropped, so they kept getting offers for them.)
    if (effectiveSkills) {
      const geoService = require('./geo.service');
      await geoService.syncSkills(workerId, before?.skills || [], effectiveSkills).catch(() => {});
    }

    res.json({ worker });
  } catch (err) { next(err); }
}

async function completeOnboarding(req, res, next) {
  try {
    const { name, skills, emergencyContact } = req.body;
    const before = await Worker.findById(req.auth.sub).select('skills').lean();
    const worker = await Worker.findByIdAndUpdate(
      req.auth.sub,
      {
        $set: {
          name,
          skills,
          onboardingComplete: true,
          ...(emergencyContact && { emergencyContact }),
        },
      },
      { new: true }
    );
    // Keep the Redis skill sets in step (no-op if they're offline, which is usual here).
    if (Array.isArray(skills)) {
      const geoService = require('./geo.service');
      await geoService.syncSkills(req.auth.sub, before?.skills || [], skills).catch(() => {});
    }
    res.json({ worker });
  } catch (err) { next(err); }
}

async function streamAvatar(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).select('profilePhotoKey kyc').lean();
    const key = worker?.profilePhotoKey ?? worker?.kyc?.selfieUrl;
    if (!key) return res.status(404).json({ error: 'No profile photo set' });
    const s3Service = require('../../utils/s3.service');
    await s3Service.streamToResponse(key, res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'Photo not found' });
    next(err);
  }
}

/* ── Bank Account Management ──────────────────────────────────────────────── */

async function getBankAccounts(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    const banks = (worker.savedBankAccounts || []).map(b => ({
      ...b,
      accountNumber: `XXXX${b.accountNumber.slice(-4)}`,
    }));
    res.json({ banks, upiIds: worker.savedUpiIds || [] });
  } catch (err) { next(err); }
}

async function addBankAccount(req, res, next) {
  try {
    const { label, accountName, accountNumber, bankName, ifsc, type, upiId, upiLabel } = req.body;
    const worker = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const MAX_ACCOUNTS = 5;
    if (type === 'upi') {
      if ((worker.savedUpiIds || []).length >= MAX_ACCOUNTS) {
        return res.status(400).json({ error: `Maximum ${MAX_ACCOUNTS} UPI IDs allowed. Delete one first.` });
      }
      // Prevent duplicate UPI IDs
      const exists = (worker.savedUpiIds || []).some(u => u.upiId === upiId);
      if (exists) return res.status(409).json({ error: 'This UPI ID is already saved' });

      await Worker.updateOne({ _id: req.auth.sub }, { $push: { savedUpiIds: { upiId, label: upiLabel || upiId, isDefault: false } } });
    } else {
      if ((worker.savedBankAccounts || []).length >= MAX_ACCOUNTS) {
        return res.status(400).json({ error: `Maximum ${MAX_ACCOUNTS} bank accounts allowed. Delete one first.` });
      }
      // Prevent duplicate account numbers
      const exists = (worker.savedBankAccounts || []).some(b => b.accountNumber === accountNumber && b.ifsc === ifsc);
      if (exists) return res.status(409).json({ error: 'This bank account is already saved' });

      await Worker.updateOne({ _id: req.auth.sub }, { $push: { savedBankAccounts: { label, accountName, accountNumber, bankName, ifsc, isDefault: false } } });
    }
    const w = await Worker.findById(req.auth.sub).select('savedBankAccounts savedUpiIds').lean();
    res.status(201).json({
      banks: (w.savedBankAccounts || []).map(b => ({ ...b, accountNumber: `XXXX${b.accountNumber.slice(-4)}` })),
      upiIds: w.savedUpiIds || [],
    });
  } catch (err) { next(err); }
}

async function deleteBankAccount(req, res, next) {
  try {
    const { id, type } = req.params;
    if (type === 'upi') {
      await Worker.updateOne({ _id: req.auth.sub }, { $pull: { savedUpiIds: { _id: id } } });
    } else {
      await Worker.updateOne({ _id: req.auth.sub }, { $pull: { savedBankAccounts: { _id: id } } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function setDefaultBankAccount(req, res, next) {
  try {
    const { id, type } = req.params;
    if (type === 'upi') {
      await Worker.updateOne({ _id: req.auth.sub }, { $set: { 'savedUpiIds.$[].isDefault': false } });
      await Worker.updateOne({ _id: req.auth.sub, 'savedUpiIds._id': id }, { $set: { 'savedUpiIds.$.isDefault': true } });
    } else {
      await Worker.updateOne({ _id: req.auth.sub }, { $set: { 'savedBankAccounts.$[].isDefault': false } });
      await Worker.updateOne({ _id: req.auth.sub, 'savedBankAccounts._id': id }, { $set: { 'savedBankAccounts.$.isDefault': true } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* ── Block Customer ───────────────────────────────────────────────────────── */

async function blockCustomer(req, res, next) {
  try {
    const { userId, orderId, reason } = req.body;
    const mongoose = require('mongoose');
    const uid = new mongoose.Types.ObjectId(userId);
    await Worker.updateOne({ _id: req.auth.sub }, { $addToSet: { 'trust.blockedFromUserIds': uid } });
    // Log the block with context for admin review
    const logger = require('../../utils/logger');
    logger.info({ workerId: req.auth.sub, userId, orderId, reason }, '[WORKER] Customer blocked by worker — pending admin review');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* ── Zone Benchmark ───────────────────────────────────────────────────────── */

async function getZoneBenchmark(req, res, next) {
  try {
    const Order = require('../order/order.model');
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

/* ── Per-Job Earnings Breakdown ──────────────────────────────────────────── */

const SERVICE_LABELS = {
  electrical: 'Electrical', plumbing: 'Plumbing', ac_repair: 'AC Repair',
  carpenter: 'Carpentry', helper: 'Helper', cleaning: 'Cleaning',
  painting: 'Painting', delivery: 'Delivery', laundry: 'Laundry',
  beauty: 'Beauty & Grooming', gardening: 'Gardening', appliance: 'Appliance Repair',
  screen_replacement: 'Screen Replacement', battery_replacement: 'Battery Replacement',
  charging_issue: 'Charging Issue', speaker_mic_issue: 'Speaker/Mic Repair',
  software_issue: 'Software Issue', water_damage_check: 'Water Damage',
  mason: 'Mason', puncture: 'Puncture Repair', battery_jump_start: 'Battery Jump Start',
  fuel_delivery: 'Fuel Delivery', bike_wash: 'Bike Wash', car_wash: 'Car Wash',
  minor_roadside_repair: 'Roadside Repair',
};
function toLabel(slug) {
  return SERVICE_LABELS[slug] || (slug || 'Service').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function getJobEarnings(req, res, next) {
  try {
    const Order = require('../order/order.model');
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

    const jobs = orders.map(o => {
      const grossPaise = (o.pricing?.total || 0) * 100;
      const workerPaise = o.earnings?.workerPaise || Math.round(grossPaise * 0.8);
      const platformPaise = o.earnings?.platformPaise || Math.round(grossPaise * 0.2);
      const bonusPaise = o.earnings?.bonusPaise || 0;
      const tipPaise = o.tip || 0;
      return {
        _id: o._id,
        orderId: o.orderId || String(o._id).slice(-8).toUpperCase(),
        service: o.service,
        serviceLabel: toLabel(o.service),
        completedAt: o.completedAt,
        gross: grossPaise,
        platformFee: platformPaise,
        net: workerPaise + bonusPaise + tipPaise,
        bonus: bonusPaise,
        tip: tipPaise,
        surgeMultiplier: o.surgeMultiplier || 1,
        commissionPct: grossPaise > 0 ? Math.round((platformPaise / grossPaise) * 100) : 20,
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

/* ─── ZeroWait: Ready Mode (pre-accept) ───────────────────────────────────────
 * The worker pre-commits to auto-accept the next matching job (their skill, their
 * radius, time-boxed) in exchange for a bonus. This is what lets dispatch skip the
 * offer→accept round-trip entirely. Strictly opt-in and strictly gated: only
 * high-trust workers, because they're accepting on the customer's behalf. */

const READY_BAN_PREFIX = 'worker:ready:ban:';

/** Why this worker may not enter Ready Mode (null = eligible). */
async function readyIneligibleReason(worker, cfg) {
  const { redis } = require('../../config/redis');

  const banned = await redis.get(`${READY_BAN_PREFIX}${String(worker._id)}`).catch(() => null);
  if (banned) return 'Ready Mode is temporarily locked after a cancelled auto-accepted job.';

  if (worker.isBlocked) return 'Account is blocked.';
  if (worker.kyc?.status !== 'approved') return 'Complete KYC verification first.';
  if (!worker.isOnline) return 'Go online first.';
  if (!worker.isAvailable) return 'Finish your current job first.';

  const minRating = cfg.readyMinRating ?? 4.0;
  if ((worker.rating ?? 5) < minRating) return `Ready Mode needs a ${minRating.toFixed(1)}★ rating or higher.`;

  const minJobs = cfg.readyMinCompletedJobs ?? 5;
  if ((worker.completedJobs || 0) < minJobs) return `Complete ${minJobs} jobs to unlock Ready Mode.`;

  const totalOffers = worker.penalties?.totalOffers || 0;
  if (totalOffers > 0) {
    const acceptRate = (totalOffers - (worker.penalties?.totalRejects || 0)) / totalOffers;
    const minAccept = cfg.readyMinAcceptRate ?? 0.6;
    if (acceptRate < minAccept) return `Ready Mode needs a ${Math.round(minAccept * 100)}% acceptance rate.`;
  }

  // Never let a worker over their dues limit take auto-assigned work.
  try {
    const dues = await require('./worker-dues.service').getDuesStatus(worker._id);
    if (dues.status === 'blocked') return 'Clear your wallet dues to use Ready Mode.';
  } catch { /* fail open */ }

  return null;
}

async function setReadyMode(req, res, next) {
  try {
    const geoService = require('./geo.service');
    const pricingService = require('../pricing/pricing.service');
    const cfg = await pricingService.getActiveConfig();

    if (cfg.readyPoolEnabled === false) {
      return res.status(409).json({ error: 'Ready Mode is currently disabled.', code: 'READY_DISABLED' });
    }

    const { enabled } = req.body;
    const workerId = req.auth.sub;

    if (!enabled) {
      await geoService.exitReady(workerId);
      return res.json({ ready: false });
    }

    const worker = await Worker.findById(workerId)
      .select('skills rating completedJobs penalties kyc isOnline isAvailable isBlocked')
      .lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const reason = await readyIneligibleReason(worker, cfg);
    if (reason) return res.status(403).json({ error: reason, code: 'READY_INELIGIBLE' });

    if (!worker.skills?.length) {
      return res.status(409).json({ error: 'Add at least one skill first.', code: 'NO_SKILLS' });
    }

    // Clamp to admin-configured bounds — a worker can pick a tighter radius/window, never a looser one.
    const maxMin    = cfg.readyMaxMinutes ?? 20;
    const defRadius = cfg.readyDefaultRadiusKm ?? 5;
    const minutes   = Math.min(Number(req.body.minutes) || maxMin, maxMin);
    const radiusKm  = Math.min(Number(req.body.radiusKm) || defRadius, defRadius);

    const state = await geoService.enterReady(workerId, worker.skills, radiusKm, minutes);
    res.json({
      ready: true,
      ...state,
      bonusPaise: cfg.readyBonusPaise ?? 2000,
      skills: worker.skills,
    });
  } catch (err) { next(err); }
}

async function getReadyMode(req, res, next) {
  try {
    const geoService = require('./geo.service');
    const pricingService = require('../pricing/pricing.service');
    const [meta, cfg] = await Promise.all([
      geoService.getReadyMeta(req.auth.sub),
      pricingService.getActiveConfig(),
    ]);

    // Surface WHY it's unavailable so the app can show a real reason, not a dead toggle.
    let ineligibleReason = null;
    if (!meta) {
      const worker = await Worker.findById(req.auth.sub)
        .select('skills rating completedJobs penalties kyc isOnline isAvailable isBlocked')
        .lean();
      if (worker) ineligibleReason = await readyIneligibleReason(worker, cfg);
    }

    res.json({
      ready: !!meta,
      radiusKm: meta?.radiusKm ?? (cfg.readyDefaultRadiusKm ?? 5),
      until: meta?.until ?? null,
      enabledOnPlatform: cfg.readyPoolEnabled !== false,
      maxMinutes: cfg.readyMaxMinutes ?? 20,
      maxRadiusKm: cfg.readyDefaultRadiusKm ?? 5,
      bonusPaise: cfg.readyBonusPaise ?? 2000,
      ineligibleReason,
    });
  } catch (err) { next(err); }
}

async function updateSkills(req, res, next) {
  try {
    const workerId = req.auth.sub;
    const { skills, skillPrimary, expertise } = req.body;

    // Read the current skills BEFORE the write so we can diff the Redis sets.
    const before = await Worker.findById(workerId).select('skills').lean();
    const oldSkills = before?.skills || [];

    const update = {};
    // Rich expertise (#4) is the source of truth when present; the flat `skills`
    // dispatch set is derived from the union of its services so the two never drift.
    let effectiveSkills = Array.isArray(skills) ? skills : null;
    if (Array.isArray(expertise)) {
      update.expertise = expertise;
      const derived = [...new Set(expertise.flatMap(e => e.services || []))];
      if (derived.length) effectiveSkills = derived;
    }
    if (Array.isArray(effectiveSkills)) update.skills = effectiveSkills;
    if (skillPrimary !== undefined) update.skillPrimary = skillPrimary ?? null;
    await Worker.updateOne({ _id: workerId }, { $set: update });

    // Dispatch matches on the Redis skill sets, not Mongo. Without this resync an
    // online worker who adds a skill would never be offered those jobs (and a
    // removed skill would keep producing offers) until they toggled offline/online.
    if (Array.isArray(effectiveSkills)) {
      const geoService = require('./geo.service');
      await geoService.syncSkills(workerId, oldSkills, effectiveSkills).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getGoals(req, res, next) {
  try {
    const Order = require('../order/order.model');
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
  getMe, goOnline, goOffline, updateLocation, getEarnings,
  getOrders, getNearbyWorkers, getDemandZones,
  getShifts, previewShift, commitShift, cancelShiftSlot,
  getWellness, claimBreakBonus,
  getNeighborhoodRep,
  getPublicProfile,
  getLeaderboard,
  updateProfile,
  completeOnboarding,
  streamAvatar,
  getBankAccounts, addBankAccount, deleteBankAccount, setDefaultBankAccount,
  blockCustomer,
  getZoneBenchmark,
  getJobEarnings,
  updateSkills,
  setReadyMode,
  getReadyMode,
  getGoals,
  setGoal,
};
