const { redis } = require('../../config/redis');
const Worker = require('./worker.model');
const config = require('../../config');
const logger = require('../../utils/logger');

const ONLINE_GEO_KEY    = 'workers:online';    // Redis GEO set
const AVAIL_HASH_KEY    = 'workers:available'; // hash: workerId -> 1|0
const SKILLS_SET_PREFIX = 'workers:skill:';    // set: skill -> workerIds
const ALIVE_ZSET_KEY    = 'workers:alive';     // sorted set: workerId -> last_seen_timestamp
const AVAIL_SINCE_ZSET  = 'workers:available_since'; // zset: workerId -> ts became available (idle fairness)

/* ── ZeroWait Ready Pool ──────────────────────────────────────────────────────
 * Workers who opt in to auto-accept the next matching job. Dispatch can lock one
 * of these atomically with NO offer/accept round-trip — that round-trip is the
 * floor on match speed for every competitor, so removing it is the whole edge.
 *
 *   workers:ready:<skill>  SET   -> workerIds who will auto-accept that skill
 *   worker:ready:<id>      STRING(JSON) with TTL -> { radiusKm, until }
 *
 * The per-worker key carries the TTL, so Ready Mode self-expires; the sets are
 * cleaned lazily on read (a member with no live meta key is ignored + removed).
 * That keeps expiry correct without a sweeper. */
const READY_SET_PREFIX  = 'workers:ready:';
const READY_META_PREFIX = 'worker:ready:';

const STALE_THRESHOLD_MS = 8 * 60 * 1000; // 8 min without ping = stale

/* ── Geo-write buffer ─────────────────────────────────────────────────────────
 * High-frequency location updates are coalesced per-node and flushed every
 * ~1.5s in a single pipelined GEOADD+ZADD. Turns N writes/sec/worker into a
 * handful of batched ops — the difference between surviving 10k and 1M movers.
 * The flusher starts lazily (only in processes that actually write locations).
 */
const _geoBuffer = new Map(); // workerId -> { lng, lat }
let _flushTimer = null;

async function flushGeoBuffer() {
  if (_geoBuffer.size === 0) return;
  const entries = [..._geoBuffer.entries()];
  _geoBuffer.clear();
  const now = Date.now();
  const pipe = redis.pipeline();
  for (const [wid, { lng, lat }] of entries) {
    pipe.geoadd(ONLINE_GEO_KEY, lng, lat, wid);
    pipe.zadd(ALIVE_ZSET_KEY, now, wid);
  }
  try { await pipe.exec(); } catch { /* dropped batch — next tick refreshes */ }
}

function startGeoFlusher() {
  if (_flushTimer) return;
  _flushTimer = setInterval(() => { flushGeoBuffer().catch(() => {}); }, 1500);
  if (_flushTimer.unref) _flushTimer.unref(); // don't keep the process alive
}

/**
 * Called whenever a worker goes online or updates location.
 * Keeps Redis hot cache in sync with Mongo.
 */
async function markOnline(worker) {
  const { _id, currentLocation, skills, isAvailable } = worker;
  const [lng, lat] = currentLocation.coordinates;
  const now = Date.now();

  const pipe = redis.multi();
  pipe.geoadd(ONLINE_GEO_KEY, lng, lat, String(_id));
  pipe.hset(AVAIL_HASH_KEY, String(_id), isAvailable ? '1' : '0');
  pipe.zadd(ALIVE_ZSET_KEY, now, String(_id)); // heartbeat
  if (isAvailable) pipe.zadd(AVAIL_SINCE_ZSET, now, String(_id)); // idle-fairness clock
  for (const skill of skills) pipe.sadd(`${SKILLS_SET_PREFIX}${skill}`, String(_id));
  pipe.expire(ONLINE_GEO_KEY, 600);
  pipe.expire(ALIVE_ZSET_KEY, 600);
  await pipe.exec();

  // Notify any active dispatches that a new worker is available.
  // Dispatches subscribe to this channel and immediately offer the worker
  // if they fall within the already-searched radius — eliminates the case
  // where a worker comes online after their radius step already passed.
  if (isAvailable) {
    for (const skill of skills) {
      redis.publish(`worker:came_online:${skill}`, JSON.stringify({
        workerId: String(_id),
        lat,
        lng,
      })).catch(() => {});
    }
  }
}

async function markOffline(workerId) {
  // Fetch skills before wiping so we can remove from per-skill sets.
  // Small extra read is fine — markOffline is infrequent.
  let skills = [];
  try {
    const w = await Worker.findById(workerId).select('skills').lean();
    skills = w?.skills || [];
  } catch { /* best-effort */ }

  const pipe = redis.multi();
  pipe.zrem(ONLINE_GEO_KEY, String(workerId));
  pipe.hdel(AVAIL_HASH_KEY, String(workerId));
  pipe.zrem(ALIVE_ZSET_KEY, String(workerId));
  pipe.zrem(AVAIL_SINCE_ZSET, String(workerId));
  for (const skill of skills) pipe.srem(`${SKILLS_SET_PREFIX}${skill}`, String(workerId));
  // An offline worker must never auto-accept — always leave the Ready Pool.
  pipe.del(`${READY_META_PREFIX}${String(workerId)}`);
  for (const skill of skills) pipe.srem(`${READY_SET_PREFIX}${skill}`, String(workerId));
  await pipe.exec();
}

/**
 * Re-sync the per-skill Redis sets after a worker edits their skills.
 *
 * Dispatch matches on the Redis sets (`workers:skill:<code>`), NOT on Mongo. Without
 * this, an ONLINE worker who adds a skill is never offered those jobs until they
 * toggle offline→online, and a worker who REMOVES a skill keeps receiving offers
 * for it. Both are silent failures.
 */
async function syncSkills(workerId, oldSkills = [], newSkills = []) {
  const id = String(workerId);
  // Workers only live in the skill sets while online (markOnline adds, markOffline removes).
  const online = await redis.zscore(ALIVE_ZSET_KEY, id).catch(() => null);

  const pipe = redis.multi();
  // Drop skills they no longer have — must stop receiving those offers immediately.
  for (const s of oldSkills) {
    if (!newSkills.includes(s)) pipe.srem(`${SKILLS_SET_PREFIX}${s}`, id);
  }
  // Only (re)add while actually online — an offline worker belongs in no skill set.
  if (online) {
    for (const s of newSkills) pipe.sadd(`${SKILLS_SET_PREFIX}${s}`, id);
  }
  await pipe.exec();

  // Announce newly-added skills so in-flight dispatches can offer this worker at once.
  if (online) {
    const avail = await redis.hget(AVAIL_HASH_KEY, id).catch(() => null);
    if (avail === '1') {
      const pos = await getWorkerPosition(workerId).catch(() => null);
      if (pos) {
        for (const s of newSkills) {
          if (oldSkills.includes(s)) continue;
          redis.publish(`worker:came_online:${s}`, JSON.stringify({
            workerId: id, lat: pos.lat, lng: pos.lng,
          })).catch(() => {});
        }
      }
    }
  }
}

async function updateLocation(workerId, lng, lat) {
  // Coalesce into the per-node buffer; flushed in batches every ~1.5s.
  _geoBuffer.set(String(workerId), { lng, lat });
  startGeoFlusher();
}

async function setAvailability(workerId, isAvailable) {
  const wid = String(workerId);
  if (isAvailable) {
    // Reset the idle-fairness clock when the worker frees up.
    await redis.multi().hset(AVAIL_HASH_KEY, wid, '1').zadd(AVAIL_SINCE_ZSET, Date.now(), wid).exec();
  } else {
    await redis.multi().hset(AVAIL_HASH_KEY, wid, '0').zrem(AVAIL_SINCE_ZSET, wid).exec();
  }
  // When a worker marks themselves available again (e.g. after completing a job),
  // notify active dispatches so they can offer immediately without waiting for the
  // next radius step.
  if (isAvailable) {
    try {
      const pos = await getWorkerPosition(workerId);
      const w   = await Worker.findById(workerId).select('skills').lean();
      if (pos && w?.skills?.length) {
        for (const skill of w.skills) {
          redis.publish(`worker:came_online:${skill}`, JSON.stringify({
            workerId: String(workerId),
            lat: pos.lat,
            lng: pos.lng,
          })).catch(() => {});
        }
      }
    } catch { /* best-effort */ }
  }
}

/* ─── ZeroWait: Ready Pool ────────────────────────────────────────────────── */

/** Opt a worker into Ready Mode (auto-accept) for their skills, time-boxed. */
async function enterReady(workerId, skills = [], radiusKm = 5, minutes = 20) {
  const id  = String(workerId);
  const ttl = Math.max(60, Math.round(minutes * 60));
  const meta = JSON.stringify({ radiusKm, until: Date.now() + ttl * 1000, skills });

  const pipe = redis.multi();
  pipe.set(`${READY_META_PREFIX}${id}`, meta, 'EX', ttl); // TTL drives auto-expiry
  for (const s of skills) pipe.sadd(`${READY_SET_PREFIX}${s}`, id);
  await pipe.exec();
  return { radiusKm, minutes, expiresAt: Date.now() + ttl * 1000 };
}

/** Remove a worker from Ready Mode (manual exit, offline, assigned, or banned). */
async function exitReady(workerId, skills = null) {
  const id = String(workerId);
  let list = skills;
  if (!list) {
    // Prefer the skills captured at opt-in; fall back to Mongo.
    try {
      const raw = await redis.get(`${READY_META_PREFIX}${id}`);
      list = raw ? (JSON.parse(raw).skills || []) : null;
    } catch { list = null; }
    if (!list) {
      const w = await Worker.findById(id).select('skills').lean().catch(() => null);
      list = w?.skills || [];
    }
  }
  const pipe = redis.multi();
  pipe.del(`${READY_META_PREFIX}${id}`);
  for (const s of list) pipe.srem(`${READY_SET_PREFIX}${s}`, id);
  await pipe.exec();
}

/** Current Ready Mode state for a worker (null when not ready / expired). */
async function getReadyMeta(workerId) {
  try {
    const raw = await redis.get(`${READY_META_PREFIX}${String(workerId)}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Find workers who have PRE-ACCEPTED this kind of job and are in range.
 * These can be locked instantly — no offer, no accept round-trip.
 *
 * Honours each worker's OWN ready radius (they chose how far they'll travel),
 * applies the same quality gates as normal dispatch plus a higher trust bar,
 * and ranks nearest-first with a longest-idle tiebreak (fairness).
 */
async function findReadyCandidates({ lng, lat, skill, radiusKm = 12, minRating = 4.0, excludeIds = [] } = {}) {
  const excludeSet = new Set(excludeIds.map(String));
  const freshnessThreshold = Date.now() - STALE_THRESHOLD_MS;

  let geoResult;
  try {
    geoResult = await redis.geosearch(
      ONLINE_GEO_KEY, 'FROMLONLAT', lng, lat, 'BYRADIUS', radiusKm, 'km', 'ASC', 'COUNT', 100, 'WITHDIST',
    );
  } catch {
    geoResult = await redis.georadius(
      ONLINE_GEO_KEY, lng, lat, radiusKm, 'km', 'ASC', 'COUNT', '100', 'WITHDIST',
    );
  }

  const nearby = geoResult
    .map((r) => ({ id: String(r[0]), dist: parseFloat(r[1]) }))
    .filter((e) => !excludeSet.has(e.id));
  if (!nearby.length) return [];

  const ids = nearby.map((e) => e.id);

  // Ready-set membership + live meta (lazy expiry) + availability + heartbeat.
  const pipe = redis.multi();
  ids.forEach((id) => pipe.sismember(`${READY_SET_PREFIX}${skill}`, id));
  ids.forEach((id) => pipe.get(`${READY_META_PREFIX}${id}`));
  ids.forEach((id) => pipe.hget(AVAIL_HASH_KEY, id));
  ids.forEach((id) => pipe.zscore(ALIVE_ZSET_KEY, id));
  ids.forEach((id) => pipe.zscore(AVAIL_SINCE_ZSET, id));
  const res = await pipe.exec();
  const val = (i) => res[i]?.[1];
  const n = ids.length;

  const staleMembers = [];
  const eligible = [];
  for (let i = 0; i < n; i++) {
    const id      = ids[i];
    const inSet   = val(i) === 1;
    const metaRaw = val(n + i);
    const avail   = val(2 * n + i);
    const alive   = val(3 * n + i);
    const since   = Number(val(4 * n + i)) || 0;

    if (!inSet) continue;
    if (!metaRaw) { staleMembers.push(id); continue; } // meta expired → drop from set
    if (avail !== '1') continue;
    if (alive && Number(alive) < freshnessThreshold) continue;

    let meta;
    try { meta = JSON.parse(metaRaw); } catch { continue; }
    const dist = nearby[i].dist;
    // The worker chose how far they're willing to auto-accept — respect it.
    if (dist > (Number(meta.radiusKm) || 5)) continue;

    eligible.push({ id, dist, since });
  }

  // Lazily clean expired members so the set doesn't grow stale.
  if (staleMembers.length) {
    redis.srem(`${READY_SET_PREFIX}${skill}`, ...staleMembers).catch(() => {});
  }
  if (!eligible.length) return [];

  // Quality gates — Ready Mode carries a HIGHER trust bar than normal dispatch,
  // because the worker is auto-accepting on the customer's behalf.
  const workers = await Worker.find({
    _id: { $in: eligible.map((e) => e.id) },
    isBlocked: false,
    'kyc.status': 'approved',
    rating: { $gte: minRating },
    skills: skill,
  }).select('_id').lean();
  const okIds = new Set(workers.map((w) => String(w._id)));

  let ranked = eligible
    .filter((e) => okIds.has(e.id))
    // Nearest first; longest-idle wins ties (fairness — same idle clock dispatch uses).
    .sort((a, b) => (a.dist - b.dist) || (a.since - b.since))
    .map((e) => e.id);

  // Never hand a job to a worker who is over their dues limit.
  try {
    const duesService = require('./worker-dues.service');
    const working = await duesService.filterWorkingWorkers(ranked);
    ranked = ranked.filter((id) => working.has(String(id)));
  } catch { /* fail open */ }

  return ranked;
}

/**
 * Find candidate workers for an order.
 * Tier 1: Redis GEO — sub-ms, returns candidates sorted by distance.
 * Tier 2: Mongo $near — fallback if Redis has no results (after cold start).
 *
 * Returns workerIds in order of preference (nearest + rating-boosted).
 */
async function findCandidates({ lng, lat, skill, excludeIds = [], radiusKm: radiusKmOverride, skipSkillFilter = false, shopId = null } = {}) {
  const excludeSet = new Set(excludeIds.map(String));
  const radiusKm = radiusKmOverride ?? config.dispatch.radiusKm;
  const maxCandidates = config.dispatch.maxCandidates;
  const freshnessThreshold = Date.now() - STALE_THRESHOLD_MS; // workers alive within 8 min

  // Tier 1: Redis GEO (GEOSEARCH added in Redis 6.2, fall back to GEORADIUS for older)
  let geoResult;
  try {
    geoResult = await redis.geosearch(
      ONLINE_GEO_KEY,
      'FROMLONLAT', lng, lat,
      'BYRADIUS', radiusKm, 'km',
      'ASC',
      'COUNT', maxCandidates * 3,
      'WITHCOORD', 'WITHDIST',
    );
  } catch {
    geoResult = await redis.georadius(
      ONLINE_GEO_KEY,
      lng, lat, radiusKm, 'km',
      'ASC',
      'COUNT', String(maxCandidates * 3),
      'WITHCOORD', 'WITHDIST',
    );
  }

  logger.info({ radiusKm, skill, geoHits: geoResult.length }, '[GEO] Raw geo results');

  // Keep distance paired with each id so filtering doesn't break index alignment
  const nearbyEntries = geoResult
    .map((r) => ({ id: r[0], dist: parseFloat(r[1]) }))
    .filter((e) => !excludeSet.has(e.id));
  const nearbyIds = nearbyEntries.map((e) => e.id);

  if (nearbyIds.length === 0) {
    return mongoFallback({ lng, lat, skill, excludeIds, radiusKm, skipSkillFilter, shopId });
  }

  // Filter by availability + skill + freshness in one pipelined batch
  const availPipe  = redis.pipeline();
  const skillPipe  = redis.pipeline();
  const alivePipe  = redis.pipeline();
  nearbyIds.forEach((id) => {
    availPipe.hget(AVAIL_HASH_KEY, id);
    skillPipe.sismember(`${SKILLS_SET_PREFIX}${skill}`, id);
    alivePipe.zscore(ALIVE_ZSET_KEY, id);
  });

  const [availResults, skillResults, aliveResults] = await Promise.all([
    availPipe.exec(),
    skillPipe.exec(),
    alivePipe.exec(),
  ]);

  const filtered = [];
  for (let i = 0; i < nearbyIds.length; i++) {
    const isAvail    = availResults[i][1] === '1';
    const hasSkill   = skipSkillFilter || skillResults[i][1] === 1;
    const lastSeen   = Number(aliveResults[i][1] ?? 0);
    const isFresh    = lastSeen === 0 || lastSeen >= freshnessThreshold; // 0 = legacy, allow through

    if (isAvail && hasSkill && isFresh) {
      filtered.push({ workerId: nearbyIds[i], distanceKm: nearbyEntries[i].dist });
    }
    if (filtered.length >= maxCandidates) break;
  }

  logger.info({ radiusKm, skill, filtered: filtered.length }, '[GEO] After availability+skill+freshness filter');

  if (filtered.length === 0) {
    return mongoFallback({ lng, lat, skill, excludeIds, radiusKm, skipSkillFilter, shopId });
  }

  // Rating + penalty + KYC — fetch from Mongo in one query.
  const ids = filtered.map((f) => f.workerId);
  const minRating = config.dispatch.minWorkerRating ?? 3.0;

  const [ratings, cancellationCfg] = await Promise.all([
    Worker.find(
      {
        _id: { $in: ids },
        isBlocked: false,
        'kyc.status': 'approved',       // never dispatch to unverified workers
        rating: { $gte: minRating },    // skip workers below quality threshold
        // Shop-routed booking (customer picked a specific shop, or a worker
        // handed the job off to their shop mid-job) — only that shop's own
        // workers are eligible. Never widen a shop-scoped order to the open pool.
        ...(shopId && { shopId }),
      },
      { _id: 1, rating: 1, completedJobs: 1, penalties: 1 }
    ).lean(),
    require('../order/cancellation.service').getConfig(),
  ]);

  // WORKER_PRO subscription effects — Pro workers get a score boost so they
  // surface higher on equal-distance ties.
  // One MGET fetches all cached boost values in a single Redis round-trip.
  // Only the cache-miss IDs issue a DB lookup (batched via Promise.all).
  const subscriptionService = require('../subscription/subscription.service');
  const cacheKeys = ids.map((id) => `geo:sub:boost:${id}`);
  let cachedBoosts;
  try { cachedBoosts = await redis.mget(...cacheKeys); } catch { cachedBoosts = ids.map(() => null); }

  const missIds = ids.filter((_, i) => cachedBoosts[i] === null);
  const missBoosts = await Promise.all(
    missIds.map(async (id) => {
      try {
        const fx = await subscriptionService.getEffects({ kind: 'worker', id });
        const boost = Number(fx.proBoost) || 0;
        await redis.set(`geo:sub:boost:${id}`, String(boost), 'EX', 60);
        return [id, boost];
      } catch { return [id, 0]; }
    })
  );
  const missMap = new Map(missBoosts);
  const boostMap = new Map(
    ids.map((id, i) => [id, cachedBoosts[i] !== null ? Number(cachedBoosts[i]) : (missMap.get(id) || 0)])
  );

  // Idle-fairness clock: how long each candidate has been available (sec).
  let sinceResults = [];
  try {
    const sincePipe = redis.pipeline();
    ids.forEach((id) => sincePipe.zscore(AVAIL_SINCE_ZSET, id));
    sinceResults = await sincePipe.exec();
  } catch { sinceResults = []; }
  const sinceMap = new Map(ids.map((id, i) => [id, Number(sinceResults?.[i]?.[1] ?? 0)]));

  const ratingMap = new Map(ratings.map((r) => [String(r._id), r]));
  const scored = filtered
    .filter((f) => ratingMap.has(f.workerId))
    .map((f) => {
      const w = ratingMap.get(f.workerId);
      const proBoost = boostMap.get(f.workerId) || 0;

      // Penalty degradation — higher reject/cancel rates push the score up
      // (worse rank). Guards against re-dispatching chronic cancellers.
      const rejectRate = (w.penalties?.totalOffers || 0) > 0
        ? (w.penalties.totalRejects || 0) / w.penalties.totalOffers
        : 0;
      const cancelRate = (w.completedJobs || 0) > 0
        ? (w.penalties?.totalCancels || 0) / w.completedJobs
        : 0;
      const penaltyScore = rejectRate * (cancellationCfg.rejectRatePenaltyWeight || 3.0)
        + cancelRate * (cancellationCfg.cancelRatePenaltyWeight || 5.0);

      // Score: lower is better. Distance dominates, rating tie-breaks, Pro boost
      // subtracts, penalty history adds (degrades rank).
      //
      // Fairness jitter: when workers are at the same location (distanceKm < 0.05,
      // e.g. 500 workers in a warehouse or same pin), pure distance gives no
      // differentiation and the same top-N are always notified first.
      // We inject a small random perturbation (±0.05, max ~5% of a 1-star rating
      // difference) so the broadcast rotates across the equal-distance pool.
      // High-penalty workers are still reliably pushed to the back.
      const SAME_LOCATION_THRESHOLD_KM = 0.05;
      const fairnessJitter = f.distanceKm < SAME_LOCATION_THRESHOLD_KM
        ? (Math.random() - 0.5) * 0.1
        : 0;

      // Reliability + fairness (tie-breakers — distance still dominates):
      //  - acceptanceRate rewards workers who actually take offers
      //  - idleBonus nudges the longest-waiting available worker up (Rapido-style)
      const acceptanceRate = 1 - rejectRate; // 0..1
      const since   = sinceMap.get(f.workerId) || 0;
      const idleSec = since ? Math.max(0, (Date.now() - since) / 1000) : 0;
      const idleBonus = Math.min(idleSec / 300, 1) * (cancellationCfg.idleFairnessWeight ?? 0.6); // caps at 5min

      const score = f.distanceKm * 10
        - (w.rating || 0) * 0.5
        - Math.log1p(w.completedJobs) * 0.1
        - proBoost
        - acceptanceRate * (cancellationCfg.acceptanceBoostWeight ?? 0.5)
        + penaltyScore
        + fairnessJitter
        - idleBonus;
      return { ...f, score };
    })
    .sort((a, b) => a.score - b.score);

  // Exclude workers whose dues exceed the hard limit. This is the primary
  // dispatch-time gate — workers with -₹500+ debt never see new offers.
  const duesService = require('./worker-dues.service');
  const workingIds = await duesService.filterWorkingWorkers(scored.map((s) => s.workerId));

  return scored.map((s) => s.workerId).filter((id) => workingIds.has(String(id)));
}

async function mongoFallback({ lng, lat, skill, excludeIds, radiusKm, skipSkillFilter = false, shopId = null }) {
  const effectiveRadius = radiusKm ?? config.dispatch.radiusKm;
  const minRating = config.dispatch.minWorkerRating ?? 3.0;
  logger.info({ lng, lat, skill, radiusKm: effectiveRadius, skipSkillFilter, shopId }, 'Falling back to Mongo $near query');

  const query = {
    isOnline: true,
    isAvailable: true,
    isBlocked: false,
    'kyc.status': 'approved',
    rating: { $gte: minRating },
    _id: { $nin: excludeIds },
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: effectiveRadius * 1000,
      },
    },
  };
  if (!skipSkillFilter) query.skills = skill;
  if (shopId) query.shopId = shopId;

  const docs = await Worker.find(query)
    .limit(config.dispatch.maxCandidates)
    .select('_id rating')
    .lean();

  return docs.map((d) => String(d._id));
}

/**
 * Returns anonymised positions of all online workers within radiusKm.
 * No worker IDs are exposed — used only for ambient map display.
 */
async function findNearbyWorkers({ lat, lng, radiusKm = 5, limit = 25 }) {
  try {
    let geoResult;
    try {
      geoResult = await redis.geosearch(
        ONLINE_GEO_KEY,
        'FROMLONLAT', lng, lat,
        'BYRADIUS', radiusKm, 'km',
        'ASC',
        'COUNT', limit,
        'WITHCOORD', 'WITHDIST',
      );
    } catch {
      geoResult = await redis.georadius(
        ONLINE_GEO_KEY,
        lng, lat, radiusKm, 'km',
        'ASC',
        'COUNT', String(limit),
        'WITHCOORD', 'WITHDIST',
      );
    }
    return geoResult.map((r) => ({
      distanceKm: parseFloat(r[1]),
      lng: parseFloat(r[2][0]),
      lat: parseFloat(r[2][1]),
    }));
  } catch {
    return [];
  }
}

/**
 * Returns { lat, lng } of a worker from the Redis GEO set, or null if not found.
 * Used to emit initial worker position to the order room immediately on assignment.
 */
async function getWorkerPosition(workerId) {
  try {
    const result = await redis.geopos(ONLINE_GEO_KEY, String(workerId));
    const pos = result?.[0];
    if (!pos || pos[0] == null || pos[1] == null) return null;
    return { lng: parseFloat(pos[0]), lat: parseFloat(pos[1]) };
  } catch {
    return null;
  }
}

module.exports = {
  markOnline,
  markOffline,
  syncSkills,
  // ZeroWait Ready Pool
  enterReady,
  exitReady,
  getReadyMeta,
  findReadyCandidates,
  updateLocation,
  setAvailability,
  findCandidates,
  findNearbyWorkers,
  getWorkerPosition,
};
