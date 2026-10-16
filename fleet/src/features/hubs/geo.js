// Distances and areas for the hub map, in km and km² (good to well under 1% at city scale).
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Shoelace over a local flat projection; points are [lng, lat].
export function areaKm2(points) {
  if (points.length < 3) return 0;
  const lat0 = rad(points.reduce((s, p) => s + p[1], 0) / points.length);
  const xy = points.map(([lng, lat]) => [rad(lng) * R * Math.cos(lat0), rad(lat) * R]);
  let s = 0;
  for (let i = 0; i < xy.length; i += 1) { const [x1, y1] = xy[i]; const [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}

// The point `km` due east of `at`, where the radius handle sits.
export const eastOf = (at, km) => ({ lat: at.lat, lng: at.lng + km / (111.32 * Math.cos(rad(at.lat))) });

export const fmtKm = (n) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
export const fmtKm2 = (n) => Math.round(n).toLocaleString('en-IN');
