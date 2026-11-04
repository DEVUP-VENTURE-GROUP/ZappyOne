/**
 * How soon someone can be at the customer's door — before they book.
 *
 *   from     a worker: their live position (fresh while online, worker/presence);
 *            a shop: its pinned address, plus SHOP_PREP_MIN to send someone
 *   travel   close (≤ GOOGLE_KM): driving time in current traffic, from Mapbox
 *            (one matrix call for the nearest few, maps/mapbox.service, cached
 *            60 s) or else Google (maps/google-maps.service); further, or with
 *            no key or a failed call: road distance (straight line × ROAD_FACTOR)
 *            at CITY_KMH. Never a blank: the estimate falls back, it does not fail.
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
// The farthest a worker reaches within `min` minutes on this estimate.
const kmWithinPromise = (min = PROMISE_MIN) => Math.max(0, ((min - TRAVEL.fixedMin) * CITY_KMH) / 60 / ROAD_FACTOR);

// Road minutes for a straight-line distance; shops add their preparation time.
const roughMinutes = (km, kind = 'worker') => round(((km * ROAD_FACTOR) / CITY_KMH) * 60 + TRAVEL.fixedMin) + (kind === 'shop' ? SHOP_PREP_MIN : 0);

/** Driving minutes from a to b ({ lat, lng }). Google when close and allowed; otherwise a road estimate. */
const roughTravel = (a, b) => {
  const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
  return { minutes: round(((km * ROAD_FACTOR) / CITY_KMH) * 60 + 2), km: Math.round(km * 10) / 10, source: 'estimate' };
};
// Tests never call a maps provider (paid, and the network is not theirs to depend on).
const mapsAllowed = () => process.env.NODE_ENV !== 'test';
const mapbox = () => require('../maps/mapbox.service');

async function travel(a, b, { google = true } = {}) {
  const rough = roughTravel(a, b);
  if (!google || rough.km > GOOGLE_KM || !mapsAllowed()) return rough;
  if (mapbox().configured()) {
    const [t] = await mapbox().driveTimes([a], b).catch(() => [null]);
    if (t) return { ...t, source: 'traffic' };
  }
  try {
    const dm = await require('../maps/google-maps.service').getDistanceMatrix(a.lat, a.lng, b.lat, b.lng);
    return { minutes: round(dm.durationInTrafficSeconds / 60), km: Math.round(dm.distanceMeters / 100) / 10, source: 'traffic' };
  } catch (e) {
    logger.debug?.({ err: e.message }, '[arrival] google fell back');
    return rough;
  }
}

/** Where a provider sets off from, or null when we do not know. */
const freshAt = (at) => at && Date.now() - new Date(at).getTime() < FRESH_MS;

// A shop's trip starts from whoever would go and is nearest the door: the owner's phone or an online technician, live; else the shop, with time to set off.
async function originOf({ kind, id }, to = null) {
  if (kind === 'shop') {
    const [s, team] = await Promise.all([
      require('../shop/shop.model').findById(id).select('address.location ownerLocation').lean(),
      require('../worker/worker.model').find({ shopId: id, isOnline: true, 'currentLocation.coordinates.0': { $exists: true } }).select('currentLocation').limit(20).lean(),
    ]);
    const live = [
      ...(freshAt(s?.ownerLocation?.at) && s.ownerLocation.coordinates?.length === 2 ? [s.ownerLocation.coordinates] : []),
      ...team.filter((w) => freshAt(w.currentLocation?.updatedAt)).map((w) => w.currentLocation.coordinates),
    ].filter((c) => c?.length === 2 && (c[0] || c[1]));
    const c = s?.address?.location?.coordinates;
    const shopPin = c?.length === 2 ? { lat: c[1], lng: c[0], prep: SHOP_PREP_MIN } : null;
    if (!live.length || !to) return shopPin;
    // Someone can also set off from the shop: a live owner far from the customer never makes the shop look out of reach.
    const near = live.map((p) => ({ lat: p[1], lng: p[0], prep: 0, live: true, km: haversineKm(p[1], p[0], to.lat, to.lng) })).sort((x, y) => x.km - y.km)[0];
    if (shopPin && haversineKm(shopPin.lat, shopPin.lng, to.lat, to.lng) < near.km) return shopPin;
    return { lat: near.lat, lng: near.lng, prep: 0, live: true };
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
    const from = await originOf(p, to).catch(() => null);
    if (from) located.push({ p, from, km: haversineKm(from.lat, from.lng, to.lat, to.lng) });
  }));
  located.sort((a, b) => a.km - b.km);
  // The nearest few in one Mapbox call; anyone it could not route goes the old way.
  const routed = new Map();
  if (mapsAllowed() && mapbox().configured()) {
    const near = located.filter((l) => l.km <= GOOGLE_KM).slice(0, mapbox().MATRIX_MAX_ORIGINS);
    const times = await mapbox().driveTimes(near.map((l) => l.from), to).catch(() => []);
    near.forEach((l, i) => { if (times[i]) routed.set(l, { ...times[i], source: 'traffic' }); });
  }
  await Promise.all(located.map(async (l, i) => {
    const { p, from } = l;
    const t = routed.get(l) || (routed.size ? roughTravel(from, to) : await travel(from, to, { google: i < GOOGLE_PER_CALL }));
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

module.exports = { travel, forProviders, nearest, roughMinutes, kmWithinPromise, TRAVEL, PROMISE_MIN, SHOP_PREP_MIN };
