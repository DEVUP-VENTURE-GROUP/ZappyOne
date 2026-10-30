const config = require('../../config');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');
const { haversineKmPoints: haversineKm } = require('../../core/geo/distance');

const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const CACHE_TTL_SECONDS = 60 * 5; // 5 min — routes don't change fast.

function cacheKey(origin, dest) {
  // Round to 3 decimal places (~111m grid). This buckets nearby coordinates into
  // the same cache cell so two users 50m apart share the same distance result —
  // reducing Google API calls and preventing tiny GPS jitter from creating cache
  // misses that surface as different quoted distances to the same destination.
  const round = (n) => n.toFixed(3);
  return `dm:${round(origin.lat)},${round(origin.lng)}:${round(dest.lat)},${round(dest.lng)}`;
}


/**
 * Returns { distanceKm, etaMinutes, source }.
 * Strategy: Redis cache → Google Distance Matrix → Haversine fallback.
 */
async function getDistanceAndEta(origin, dest) {
  const key = cacheKey(origin, dest);
  const cached = await redis.get(key);
  if (cached) return { ...JSON.parse(cached), source: 'cache' };

  try {
    const url = new URL(DISTANCE_MATRIX_URL);
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${dest.lat},${dest.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', config.googleMaps.key);

    const res = await fetch(url.toString());
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (data.status === 'OK' && el?.status === 'OK') {
      const result = {
        distanceKm: el.distance.value / 1000,
        etaMinutes: Math.ceil(el.duration.value / 60),
      };
      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(result));
      return { ...result, source: 'google' };
    }
    logger.warn({ status: data.status, el }, 'DistanceMatrix non-OK, using haversine');
  } catch (err) {
    logger.error({ err: err.message }, 'DistanceMatrix failed, using haversine');
  }

  // Graceful fallback — the order must not fail because of an API hiccup.
  const km = haversineKm(origin, dest);
  return { distanceKm: km, etaMinutes: Math.ceil((km / 25) * 60), source: 'haversine' };
}

async function reverseGeocode(lat, lng) {
  const key = `rg:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = await redis.get(key);
  if (cached) return cached;
  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', config.googleMaps.key);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status === 'OK' && data.results[0]) {
      const addr = data.results[0].formatted_address;
      await redis.setex(key, 60 * 60 * 24, addr);
      return addr;
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Reverse geocode failed');
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Returns a short human-readable zone label e.g. "Kondapur, Hyderabad" or
 * "Vikarabad, Telangana" — never raw coordinates unless every lookup fails.
 *
 * Strategy: Redis cache → Google reverse geocode (full result set, no over-
 * restrictive result_type) → OpenStreetMap Nominatim fallback (free, no key).
 * Real labels cached 48h; the coordinate fallback is cached only 2h so a
 * transient geocoder hiccup self-heals on the next view.
 */
async function getZoneLabel(lat, lng) {
  const key = `zone-label:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = await redis.get(key);
  if (cached) return cached;

  // 1) Google — take the FULL result set and walk components from most to least
  //    specific. The previous result_type=sublocality|locality filter returned
  //    ZERO_RESULTS for semi-urban/rural points, forcing a coordinate fallback.
  try {
    if (config.googleMaps?.key) {
      const url = new URL(GEOCODE_URL);
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', config.googleMaps.key);
      const res  = await fetch(url.toString());
      const data = await res.json();
      if (data.status === 'OK' && data.results?.length) {
        // Merge components across results so a sparse first result still yields a name.
        const comps = data.results.flatMap((r) => r.address_components || []);
        const pick  = (type) => comps.find((c) => c.types.includes(type))?.long_name;
        const local = pick('sublocality_level_1') || pick('sublocality') || pick('locality')
                   || pick('administrative_area_level_3') || pick('administrative_area_level_2');
        const region = pick('administrative_area_level_2') || pick('administrative_area_level_1');
        const label = [local, local !== region ? region : null].filter(Boolean).join(', ')
                   || data.results[0].formatted_address?.split(',').slice(0, 2).join(',').trim();
        if (label) { await redis.setex(key, 60 * 60 * 48, label); return label; }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'getZoneLabel google failed — trying OSM');
  }

  // 2) OpenStreetMap Nominatim — free reverse geocode, no API key required.
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=13`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ZappyAdmin/1.0', 'Accept-Language': 'en' } });
    const data = await res.json();
    const a = data?.address ?? {};
    const local  = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.county;
    const region = a.state_district || a.state;
    const label  = [local, local !== region ? region : null].filter(Boolean).join(', ');
    if (label) { await redis.setex(key, 60 * 60 * 48, label); return label; }
  } catch (err) {
    logger.warn({ err: err.message }, 'getZoneLabel OSM fallback failed');
  }

  // 3) Last resort — coordinates, cached briefly so it retries soon.
  const fallback = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  await redis.setex(key, 60 * 60 * 2, fallback).catch(() => {});
  return fallback;
}

module.exports = { getDistanceAndEta, reverseGeocode, getZoneLabel, haversineKm };
