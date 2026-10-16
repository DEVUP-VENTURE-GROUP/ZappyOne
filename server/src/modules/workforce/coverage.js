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

function covers(hub, at) {
  if (!hub || !at || !hub.isActive) return false;
  const ring = hub.area?.coordinates?.[0];
  if (ring?.length >= 4) return inRing(ring, at.lat, at.lng);
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

const HUB_FIELDS = 'meetingPoint serviceKm area isActive';

module.exports = { covers, inRing, toPolygon, HUB_FIELDS };
