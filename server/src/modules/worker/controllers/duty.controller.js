const Worker = require('../worker.model');
const workerService = require('../worker.service');
const orderService = require('../../order/order.service');

/** The worker on duty: online/offline, location, their jobs and earnings, Ready Mode. */

async function getMe(req, res, next) {
  try {
    const worker = await Worker.findById(req.auth.sub).lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    // No reviews yet reads as new, never a default five stars.
    if (!worker.reviewCount) worker.rating = null;
    res.json({ worker });
  } catch (err) { next(err); }
}

async function goOnline(req, res, next) {
  try {
    const worker = await workerService.goOnline({ workerId: req.auth.sub, lat: req.body.lat, lng: req.body.lng, accuracy: req.body.accuracy });
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
    await workerService.updateLocation({
      workerId: req.auth.sub,
      lat: req.body.lat,
      lng: req.body.lng,
      orderId: req.body.orderId,
      repairBookingId: req.body.repairBookingId,
      jobId: req.body.jobId,
      accuracy: req.body.accuracy,
    });
    res.json({ ok: true });
  } catch (err) {
    // Location update is best-effort — Redis outages should not block the worker app.
    // Return 200 so the client doesn't retry-spam; log the failure server-side.
    if (err?.name === 'ReplyError' || err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      const logger = require('../../../core/logger');
      logger.warn({ workerId: req.auth.sub, err: err.message }, '[LOCATION] Redis unavailable - location update skipped');
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

// Who is near, for the map only: a key that changes daily (so a marker can glide) and a spot blurred to ~160 m; never who or exactly where.
const CELL = 0.0015;
function publicPosition(w) {
  const day = new Date().toISOString().slice(0, 10);
  const h = require('crypto').createHmac('sha256', process.env.JWT_SECRET || 'nearby').update(`${w.id}:${day}`).digest();
  const jitter = (byte) => ((byte / 255) - 0.5) * CELL * 0.8;
  const snap = (v) => Math.round(v / CELL) * CELL;
  return {
    key: h.subarray(0, 6).toString('base64url'),
    lat: +(snap(w.lat) + jitter(h[6])).toFixed(5),
    lng: +(snap(w.lng) + jitter(h[7])).toFixed(5),
    distanceKm: Math.round(w.distanceKm * 10) / 10,
  };
}

// Approved providers per service line, kept a minute: every customer's map asks every few seconds and the list changes rarely.
const approvedCache = new Map();
async function approvedFor(lineCode) {
  const hit = approvedCache.get(lineCode);
  if (hit && hit.at > Date.now() - 60000) return hit.set;
  const rows = await require('../../onboarding/eligibility').approvedProviders(lineCode);
  const set = { workers: new Set(rows.filter((r) => r.kind === 'worker').map((r) => r.id)), shops: new Set(rows.filter((r) => r.kind === 'shop').map((r) => r.id)) };
  if (approvedCache.size > 200) approvedCache.clear();
  approvedCache.set(lineCode, { at: Date.now(), set });
  return set;
}

async function forService(found, lineCode, at) {
  const ok = await approvedFor(lineCode);
  const team = new Map((await require('../worker.model').find({ _id: { $in: found.map((f) => f.id) } }).select('shopId').lean()).map((w) => [String(w._id), w.shopId ? String(w.shopId) : null]));
  const pros = found.filter((f) => ok.workers.has(f.id) || (team.get(f.id) && ok.shops.has(team.get(f.id))));
  if (ok.shops.size && pros.length < 25) {
    const { haversineKm } = require('../../../core/geo/distance');
    const since = new Date(Date.now() - 15 * 60000);
    const shops = await require('../../shop/shop.model').find({ _id: { $in: [...ok.shops].slice(0, 500) }, 'ownerLocation.at': { $gte: since } }).select('_id ownerLocation').lean();
    for (const s of shops) {
      const c = s.ownerLocation?.coordinates;
      const km = c?.length === 2 ? haversineKm(at.lat, at.lng, c[1], c[0]) : Infinity;
      if (km <= 5) pros.push({ id: `shop:${s._id}`, lat: c[1], lng: c[0], distanceKm: km });
    }
  }
  return pros.sort((x, y) => x.distanceKm - y.distanceKm).slice(0, 25);
}

async function getNearbyWorkers(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const geoService = require('../geo.service');
    let found = await geoService.findNearbyWorkers({ lat, lng, radiusKm: 5, limit: 25 });
    // For one service: only pros who may do it, and shop owners out with ServicePro open (shops/me/location).
    const vertical = String(req.query.vertical || '').slice(0, 40);
    const lineCode = vertical ? await require('../../jobs/kinds').KINDS.repair.line({ vertical }).catch(() => null) : null;
    if (lineCode) found = await forService(found, lineCode, { lat, lng });
    res.json({ workers: found.map(publicPosition), count: found.length });
  } catch (err) { next(err); }
}

/* ZeroWait: Ready Mode (pre-accept)
 * The worker pre-commits to auto-accept the next matching job (their skill, their
 * radius, time-boxed) in exchange for a bonus. This is what lets dispatch skip the
 * offer→accept round-trip entirely. Strictly opt-in and strictly gated: only
 * high-trust workers, because they're accepting on the customer's behalf. */

const READY_BAN_PREFIX = 'worker:ready:ban:';

/** Why this worker may not enter Ready Mode (null = eligible). */
async function readyIneligibleReason(worker, cfg) {
  const { redis } = require('../../../config/redis');

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
    const dues = await require('../worker-dues.service').getDuesStatus(worker._id);
    if (dues.status === 'blocked') return 'Clear your wallet dues to use Ready Mode.';
  } catch { /* fail open */ }

  return null;
}

async function setReadyMode(req, res, next) {
  try {
    const geoService = require('../geo.service');
    const pricingService = require('../../pricing/pricing.service');
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
    const geoService = require('../geo.service');
    const pricingService = require('../../pricing/pricing.service');
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

module.exports = {
  getMe,
  goOnline,
  goOffline,
  updateLocation,
  getEarnings,
  getOrders,
  getNearbyWorkers,
  publicPosition,
  setReadyMode,
  getReadyMode,
};
