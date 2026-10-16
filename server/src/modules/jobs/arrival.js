/**
 * How soon someone can be at the customer's door — before they book.
 *
 *   from     a worker: their live position (fresh while online, worker/presence);
 *            a shop: its pinned address, plus SHOP_PREP_MIN to send someone
 *   travel   close (≤ GOOGLE_KM): Google driving time in current traffic
 *            (maps/google-maps.service, cached ~30 s); further, or with no key
 *            or a failed call: road distance (straight line × ROAD_FACTOR) at
 *            CITY_KMH. Never a blank: the estimate falls back, it does not fail.
 *   busy     a provider finishing another job adds what is left of it.
 *
 *   promise  "10 min" is shown only when the estimate is ≤ PROMISE_MIN
 *            (ZappyOne's arrival promise: the provider arrives, not the job done).
 *
 * Kind-agnostic: repairs use it per provider in matching; pet care and helping
 * use nearest() for "someone can be with you in ~X min".
 */
const { haversineKm } = require('../../core/geo/distance');
const logger = require('../../core/logger');

const PROMISE_MIN = 10;
const GOOGLE_KM = 15;
const ROAD_FACTOR = 1.35;
const CITY_KMH = 22;
const SHOP_PREP_MIN = 5;
const FRESH_MS = 15 * 60000;
const GOOGLE_PER_CALL = 5; // at most this many Google lookups per estimate

const round = (n) => Math.max(1, Math.round(n));
// The road estimate's terms, shared with screens that show reach in minutes (Fleet hub map).
const TRAVEL = { roadFactor: ROAD_FACTOR, kmh: CITY_KMH, fixedMin: 2 };

// Road minutes for a straight-line distance; shops add their preparation time.
const roughMinutes = (km, kind = 'worker') => round(((km * ROAD_FACTOR) / CITY_KMH) * 60 + TRAVEL.fixedMin) + (kind === 'shop' ? SHOP_PREP_MIN : 0);

/** Driving minutes from a to b ({ lat, lng }). Google when close and allowed; otherwise a road estimate. */
async function travel(a, b, { google = true } = {}) {
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const rough = { minutes: round(((km * ROAD_FACTOR) / CITY_KMH) * 60 + 2), km: Math.round(km * 10) / 10, source: 'estimate' };
  // Tests never call Google (paid, and the network is not theirs to depend on).
  if (!google || km > GOOGLE_KM || process.env.NODE_ENV === 'test') return rough;
  try {
    const dm = await require('../maps/google-maps.service').getDistanceMatrix(a.lat, a.lng, b.lat, b.lng);
    return { minutes: round(dm.durationInTrafficSeconds / 60), km: Math.round(dm.distanceMeters / 100) / 10, source: 'traffic' };
  } catch (e) {
    logger.debug?.({ err: e.message }, '[arrival] google fell back');
    return rough;
  }
}

/** Where a provider sets off from, or null when we do not know. */
async function originOf({ kind, id }) {
  if (kind === 'shop') {
    const s = await require('../shop/shop.model').findById(id).select('address.location').lean();
    const c = s?.address?.location?.coordinates;
    return c?.length === 2 ? { lat: c[1], lng: c[0], prep: SHOP_PREP_MIN } : null;
  }
  const w = await require('../worker/worker.model').findById(id).select('currentLocation isOnline').lean();
  const c = w?.currentLocation?.coordinates;
  const fresh = w?.currentLocation?.updatedAt && Date.now() - new Date(w.currentLocation.updatedAt).getTime() < FRESH_MS;
  return c?.length === 2 && (c[0] || c[1]) && (fresh || w?.isOnline) ? { lat: c[1], lng: c[0], prep: 0 } : null;
}

/**
 * Arrival estimates for a list of providers to one door. The nearest few get
 * Google; the rest the road estimate. Returns Map("kind:id" → estimate).
 * Each item: { kind, id, busyMin? }.
 */
async function forProviders(items, to) {
  const out = new Map();
  if (!to || typeof to.lat !== 'number') return out;
  const located = [];
  await Promise.all(items.map(async (p) => {
    const from = await originOf(p).catch(() => null);
    if (from) located.push({ p, from, km: haversineKm(from.lat, from.lng, to.lat, to.lng) });
  }));
  located.sort((a, b) => a.km - b.km);
  await Promise.all(located.map(async ({ p, from }, i) => {
    const t = await travel(from, to, { google: i < GOOGLE_PER_CALL });
    const minutes = t.minutes + (from.prep || 0) + (p.busyMin || 0);
    out.set(`${p.kind}:${p.id}`, { minutes, km: t.km, source: t.source, withinPromise: minutes <= PROMISE_MIN, busy: !!p.busyMin });
  }));
  return out;
}

/**
 * The soonest anyone approved for this service can be at the door: online
 * workers first (free before busy), and shops. For a booking screen's
 * "Someone can be with you in ~X min". Null when nobody can.
 */
async function nearest({ lineCode, lat, lng }) {
  if (!lineCode || typeof lat !== 'number') return null;
  const providers = await require('../onboarding/eligibility').approvedProviders(lineCode);
  if (!providers.length) return null;
  const workerIds = providers.filter((p) => p.kind === 'worker').map((p) => p.id);
  const [live, working, load] = await Promise.all([
    require('../worker/presence').liveIds(workerIds),
    require('../worker/worker-dues.service').filterWorkingWorkers(workerIds),
    require('./workload').classify(workerIds),
  ]);
  const candidates = providers.filter((p) => p.kind === 'shop'
    || (live.has(String(p.id)) && working.has(String(p.id)) && (load.free.has(String(p.id)) || load.busy.has(String(p.id)))))
    .map((p) => ({ ...p, busyMin: p.kind === 'worker' && !load.free.has(String(p.id)) ? require('./workload').BUSY_EXTRA_MIN : 0 }));
  if (!candidates.length) return null;
  const est = await forProviders(candidates.slice(0, 40), { lat, lng });
  const best = [...est.values()].sort((a, b) => a.minutes - b.minutes)[0];
  if (!best) return null;
  return { ...best, nearby: est.size, promiseMinutes: PROMISE_MIN };
}

module.exports = { travel, forProviders, nearest, roughMinutes, TRAVEL, PROMISE_MIN, SHOP_PREP_MIN };
