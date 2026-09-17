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

module.exports = { metresBetween, kmBetween, toLatLng, EARTH_RADIUS_M };
