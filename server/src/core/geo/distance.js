/**
 * Great-circle distance, in one place.
 *
 * Straight-line, not road distance. That is a deliberate trade wherever it is
 * used for a FEE: a routing API call per quote costs latency and money to move
 * the figure by a few rupees. Where a genuine ETA is needed, the tracking
 * service's routing is the right tool — this is not that.
 *
 * Accepts either GeoJSON order `[lng, lat]` (what Mongo stores) or `{lat, lng}`
 * (what a client sends), because mixing the two up silently produces a
 * plausible-looking wrong answer — the failure mode is a number, not an error.
 */

const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Normalise either accepted shape to `{ lat, lng }`, or null if unusable. */
function toLatLng(point) {
  if (!point) return null;
  if (Array.isArray(point)) {
    if (point.length !== 2) return null;
    const [lng, lat] = point;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.lon ?? point.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Metres between two points. Returns null when either point is unusable. */
function metresBetween(a, b) {
  const p1 = toLatLng(a);
  const p2 = toLatLng(b);
  if (!p1 || !p2) return null;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Kilometres, to one decimal. Zero when either point is unusable. */
function kmBetween(a, b) {
  const m = metresBetween(a, b);
  return m == null ? 0 : Math.round(m / 100) / 10;
}

/** Great-circle km between two lat/lng pairs, unrounded (ranking and radius checks). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return (2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))) / 1000;
}

/** The same, for two { lat, lng } points. */
const haversineKmPoints = (a, b) => haversineKm(a.lat, a.lng, b.lat, b.lng);

module.exports = { metresBetween, kmBetween, toLatLng, haversineKm, haversineKmPoints, EARTH_RADIUS_M };
