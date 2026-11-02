// Mapbox for India: place search, the area of a pincode or locality as a box, and driving times in traffic; cached in Redis.
const { redis } = require('../../config/redis');

const TOKEN = () => process.env.MAPBOX_TOKEN;
const configured = () => Boolean(TOKEN());

async function geocode(q, params, ttlSec) {
  const key = `mapbox:geo:${Buffer.from(`${q}|${params}`).toString('base64').slice(0, 96)}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=in&language=en${params}&access_token=${TOKEN()}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw Object.assign(new Error(`Map search failed (${r.status})`), { status: 502, code: 'MAPS_FAILED' });
  const features = (await r.json()).features || [];
  await redis.set(key, JSON.stringify(features), 'EX', ttlSec).catch(() => {});
  return features;
}

const view = (f) => ({
  id: f.id, name: f.text, label: f.place_name, lat: f.center[1], lng: f.center[0],
  bbox: f.bbox ? { west: f.bbox[0], south: f.bbox[1], east: f.bbox[2], north: f.bbox[3] } : null,
});

async function search(q, near = null) {
  const prox = near?.lat != null ? `&proximity=${near.lng},${near.lat}` : '';
  return (await geocode(q, `&limit=6&autocomplete=true${prox}`, 86400)).map(view);
}

// A pincode, or a locality by name: its area as a box; null when not found or it has no area.
async function areaOf(text, near = null) {
  const pin = /^\d{6}$/.test(text);
  const prox = near?.lat != null ? `&proximity=${near.lng},${near.lat}` : '';
  const [f] = await geocode(text, pin ? '&types=postcode&limit=1' : `&types=neighborhood,locality,place,district&limit=1${prox}`, 30 * 86400);
  if (!f?.bbox) return null;
  return { ...view(f), kind: pin ? 'pincode' : 'locality', key: pin ? text : f.id, name: pin ? (f.context?.find((c) => c.id.startsWith('place') || c.id.startsWith('locality'))?.text || '') : f.text };
}

// Driving-with-traffic allows 10 points per call: up to 9 origins to one door.
const MATRIX_MAX_ORIGINS = 9;
const pt = (p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

// Driving minutes and km from each origin to `to`, in one call; null for a pair Mapbox could not route. Cached 60 s on ~100 m cells.
async function driveTimes(origins, to) {
  const from = origins.slice(0, MATRIX_MAX_ORIGINS);
  if (!from.length) return [];
  const cell = (p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  const key = `mapbox:eta:${cell(to)}|${from.map(cell).join(';')}`;
  const cached = await redis.get(key).catch(() => null);
  if (cached) return JSON.parse(cached);
  const coords = [...from, to].map(pt).join(';');
  // Mapbox needs at least two pairs, so a single pro also asks door to door (unused).
  const sources = (from.length === 1 ? [0, 1] : from.map((_, i) => i)).join(';');
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${coords}?sources=${sources}&destinations=${from.length}&annotations=duration,distance&access_token=${TOKEN()}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw Object.assign(new Error(`Route times failed (${r.status})`), { status: 502, code: 'MAPS_FAILED' });
  const body = await r.json();
  const out = from.map((_, i) => {
    const sec = body.durations?.[i]?.[0];
    const m = body.distances?.[i]?.[0];
    return sec == null ? null : { minutes: Math.max(1, Math.round(sec / 60)), km: Math.round((m || 0) / 100) / 10 };
  });
  await redis.set(key, JSON.stringify(out), 'EX', 60).catch(() => {});
  return out;
}

module.exports = { configured, search, areaOf, driveTimes, MATRIX_MAX_ORIGINS };
