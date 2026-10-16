// Whether a hub serves a place: inside its drawn service area if it has one, else within serviceKm of its meeting point.
const { haversineKm } = require('../../core/geo/distance');

// Ray casting over a GeoJSON ring of [lng, lat]; O(vertices).
function inRing(ring, lat, lng) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The drawn area and the pincodes and localities add up; the radius applies only when neither is set.
function covers(hub, at) {
  if (!hub || !at || !hub.isActive) return false;
  const rings = [hub.area?.coordinates?.[0], ...(hub.places || []).map((p) => p.area?.coordinates?.[0])].filter((r) => r?.length >= 4);
  if (rings.length) return rings.some((r) => inRing(r, at.lat, at.lng));
  const c = hub.meetingPoint?.location?.coordinates;
  return c?.length === 2 && haversineKm(at.lat, at.lng, c[1], c[0]) <= (hub.serviceKm || 0);
}

// Closes a list of [lng, lat] points into a GeoJSON polygon.
function toPolygon(points) {
  const ring = points.map(([lng, lat]) => [Number(lng), Number(lat)]);
  const [a, z] = [ring[0], ring[ring.length - 1]];
  if (a[0] !== z[0] || a[1] !== z[1]) ring.push([...a]);
  return { type: 'Polygon', coordinates: [ring] };
}

const boxPolygon = ({ south, west, north, east }) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });

const HUB_FIELDS = 'meetingPoint serviceKm area places isActive';

module.exports = { covers, inRing, toPolygon, boxPolygon, HUB_FIELDS };
