const config = require('../../config');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Resolve { district, city, state, country } from coordinates.
 * Cached 48h in Redis keyed by 2-decimal bucket (matches geo-analytics precision,
 * keeps Google geocode calls cheap — one per ~1km cell per 48h).
 */
async function resolveGeo(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return {};
  const key = `geo-admin:${lat.toFixed(2)},${lng.toFixed(2)}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (_) { /* ignore cache read errors */ }

  let out = {};
  // 1) Google reverse geocode (full result set).
  try {
    if (config.googleMaps?.key) {
      const url = new URL(GEOCODE_URL);
      url.searchParams.set('latlng', `${lat},${lng}`);
      url.searchParams.set('key', config.googleMaps.key);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.status === 'OK' && data.results?.length) {
        const comps = data.results.flatMap((r) => r.address_components || []);
        const pick = (type) => comps.find((c) => c.types.includes(type))?.long_name;
        out = {
          district: pick('administrative_area_level_3') || pick('administrative_area_level_2') || null,
          city:     pick('locality') || pick('administrative_area_level_3') || pick('administrative_area_level_2') || null,
          state:    pick('administrative_area_level_1') || null,
          country:  pick('country') || 'India',
        };
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'telemetry resolveGeo google failed');
  }

  // 2) OpenStreetMap Nominatim fallback (free, no key) — so city/district grouping
  //    works even when Google has no key / is restricted / returns ZERO_RESULTS.
  if (!out.city && !out.district && !out.state) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12`,
        { headers: { 'User-Agent': 'ZappyAdmin/1.0', 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const a = data?.address ?? {};
      out = {
        district: a.state_district || a.county || null,
        city:     a.city || a.town || a.village || a.suburb || a.county || null,
        state:    a.state || null,
        country:  a.country || 'India',
      };
    } catch (err) {
      logger.warn({ err: err.message }, 'telemetry resolveGeo OSM fallback failed');
    }
  }

  // Cache real resolutions 48h; cache an empty result only 2h so it self-heals.
  const ttl = (out.city || out.district || out.state) ? 60 * 60 * 48 : 60 * 60 * 2;
  try { await redis.setex(key, ttl, JSON.stringify(out)); } catch (_) { /* ignore */ }
  return out;
}

// Private / loopback ranges — these never resolve to a public location
// (e.g. localhost in dev), so we skip the lookup entirely.
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|::ffff:127\.|fc|fd|fe80)/i;

/**
 * Resolve { city, state, country } from a visitor IP — how we locate web
 * visitors who never share GPS. Uses the free ip-api.com (45 req/min, no key),
 * cached 24h per IP in Redis. Returns {} for private/loopback IPs (dev).
 */
async function resolveGeoFromIp(ip) {
  if (!ip || PRIVATE_IP_RE.test(ip)) return {};
  const clean = ip.replace(/^::ffff:/, '');
  const key = `geo-ip:${clean}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (_) { /* ignore */ }

  let out = {};
  try {
    const res = await fetch(`http://ip-api.com/json/${clean}?fields=status,country,regionName,city`);
    const d = await res.json();
    if (d.status === 'success') {
      out = { city: d.city || null, state: d.regionName || null, country: d.country || null };
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'telemetry resolveGeoFromIp failed');
  }
  const ttl = (out.city || out.state) ? 86400 : 3600; // re-try unresolved IPs sooner
  try { await redis.setex(key, ttl, JSON.stringify(out)); } catch (_) { /* ignore */ }
  return out;
}

/**
 * Minimal, dependency-free User-Agent parser — enough for analytics buckets.
 * Returns { device, browser, os }.
 */
function parseUA(ua = '') {
  const s = String(ua);
  if (!s) return { device: 'unknown', browser: 'unknown', os: 'unknown' };

  const isBot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram/i.test(s);
  const isTablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s);
  const isMobile = /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(s);
  const device = isBot ? 'bot' : isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let os = 'unknown';
  if (/windows nt/i.test(s)) os = 'Windows';
  else if (/android/i.test(s)) os = 'Android';
  else if (/iphone|ipad|ipod|ios/i.test(s)) os = 'iOS';
  else if (/mac os x/i.test(s)) os = 'macOS';
  else if (/linux/i.test(s)) os = 'Linux';

  let browser = 'unknown';
  if (/edg\//i.test(s)) browser = 'Edge';
  else if (/opr\/|opera/i.test(s)) browser = 'Opera';
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/chrome|crios/i.test(s)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(s)) browser = 'Firefox';
  else if (/safari/i.test(s)) browser = 'Safari';

  return { device, browser, os };
}

/**
 * Normalise a referrer URL to a host (or 'direct'). Treats our own origins as 'direct'.
 */
function normaliseReferrer(ref) {
  if (!ref) return 'direct';
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    return host || 'direct';
  } catch (_) {
    return 'direct';
  }
}

module.exports = { resolveGeo, resolveGeoFromIp, parseUA, normaliseReferrer };
