// Mapbox geocoding for India: place search, and the area of a pincode or locality as a box; cached in Redis.
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

module.exports = { configured, search, areaOf };
