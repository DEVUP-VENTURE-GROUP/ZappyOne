'use strict';

/**
 * Location validation / anti-spoofing helpers.
 *
 * Catches the two real-world failure modes we've seen in production:
 *   - Foreign coordinates from VPN / IP-geolocation (e.g. Belén CR, Loreto PE)
 *   - Mock-location providers (rooted Android, GPS spoofing apps)
 *   - Garbage accuracy from desktop Wi-Fi triangulation
 *
 * Server is authoritative — never trust the client to self-validate.
 */

// Generous bounding box for India (incl. islands). Mainland is ~8–37N, 68–97E;
// we pad slightly for Andaman/Nicobar and Lakshadweep.
const INDIA_BBOX = { latMin: 6.0, latMax: 37.5, lngMin: 68.0, lngMax: 97.5 };

/** True if the coordinate is a real number inside the India bounding box. */
function isInIndia(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return (
    lat >= INDIA_BBOX.latMin && lat <= INDIA_BBOX.latMax &&
    lng >= INDIA_BBOX.lngMin && lng <= INDIA_BBOX.lngMax
  );
}

/** Basic latitude/longitude sanity (valid earth coordinate). */
function isValidCoord(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Validate a location for a trust-sensitive action (go-online / KYC / dispatch).
 * Returns { ok, reason }.
 *
 * @param {object} p
 * @param {number} p.lat
 * @param {number} p.lng
 * @param {number} [p.accuracy]  metres; reject if clearly desktop-grade
 * @param {boolean} [p.mock]     Android isFromMockProvider flag
 * @param {number} [p.maxAccuracy=200] reject fixes coarser than this (metres)
 */
function validateLocation({ lat, lng, accuracy, mock, maxAccuracy = 200 } = {}) {
  if (mock === true) return { ok: false, reason: 'mock_location' };
  if (!isValidCoord(lat, lng)) return { ok: false, reason: 'invalid_coord' };
  if (!isInIndia(lat, lng)) return { ok: false, reason: 'outside_service_area' };
  if (typeof accuracy === 'number' && accuracy > maxAccuracy) {
    return { ok: false, reason: 'low_accuracy' };
  }
  return { ok: true };
}

module.exports = { isInIndia, isValidCoord, validateLocation, INDIA_BBOX };
