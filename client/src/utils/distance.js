/**
 * Distance between two points, in one place.
 *
 * There were six copies of the haversine formula across the client — two of
 * them inside the same file — and they did not agree on their arguments: some
 * took `{lat, lng}` objects, some took GeoJSON `[lng, lat]` arrays, one took
 * four loose numbers, and one returned kilometres while the rest returned
 * metres. Swapping lat and lng silently returns a plausible-looking wrong
 * number, which is how a technician standing at the door gets told they are
 * 4 km away and cannot tap "I've arrived".
 *
 * So this accepts either shape and says its unit in its name. GeoJSON order
 * ([lng, lat]) is what the database stores, `{lat, lng}` is what the browser's
 * geolocation API hands back, and both arrive here without a conversion step
 * for anyone to get wrong.
 */

/** Close enough to be at the door rather than on the street.
 *  Matches ARRIVE_BLOCK_KM (0.100) on the server. */
export const ARRIVAL_RADIUS_M = 100;

/** Normalise either accepted shape to [lng, lat]. */
function toLngLat(p) {
  if (!p) return null;
  if (Array.isArray(p)) return p.length >= 2 ? [Number(p[0]), Number(p[1])] : null;
  if (p.lng != null && p.lat != null) return [Number(p.lng), Number(p.lat)];
  if (p.longitude != null && p.latitude != null) return [Number(p.longitude), Number(p.latitude)];
  if (Array.isArray(p.coordinates)) return toLngLat(p.coordinates);
  return null;
}

/**
 * Metres between two points, or `null` when either is missing.
 *
 * Null rather than 0: callers gate real decisions on this ("may they mark
 * arrived?"), and a missing fix reported as 0 metres reads as "standing at the
 * door", which is the opposite of the truth.
 */
export function metresBetween(a, b) {
  const p = toLngLat(a);
  const q = toLngLat(b);
  if (!p || !q || p.some(Number.isNaN) || q.some(Number.isNaN)) return null;

  const [lng1, lat1] = p;
  const [lng2, lat2] = q;
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** The same distance in kilometres, for the screens that quote km. */
export function kmBetween(a, b) {
  const m = metresBetween(a, b);
  return m === null ? null : m / 1000;
}

/** "850 m" / "4.2 km" — the unit people actually expect at that scale. */
export function formatDistance(metres) {
  if (metres == null) return null;
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}
