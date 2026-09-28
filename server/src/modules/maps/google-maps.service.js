'use strict';

/**
 * Server-side Google Maps API wrapper.
 *
 * APIs used:
 *  - Geocoding API          — reverse geocode & forward geocode
 *  - Distance Matrix API    — traffic-aware road ETA
 *  - Directions API         — turn-by-turn route with encoded polyline
 *  - Roads API              — snap GPS trail to nearest road
 *  - Places API (Text Search) — find nearby POIs for location context
 */

const https   = require('https');
const { redis } = require('../../config/redis');
const logger  = require('../../utils/logger');

const KEY  = process.env.GOOGLE_MAPS_KEY;
const BASE = 'https://maps.googleapis.com/maps/api';

// HTTP helper

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Google Maps API returned non-JSON')); }
      });
    }).on('error', reject);
  });
}

function requireKey() {
  if (!KEY) throw new Error('GOOGLE_MAPS_KEY env var is not set');
}

// Polyline decode

/**
 * Decode Google's encoded polyline to [[lat, lng], ...].
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded) {
  const coords = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

// Reverse Geocoding

/**
 * Coordinates → rich address object.
 * Cached 1 hour (coordinates rounded to 4dp ≈ 11 m precision).
 *
 * @returns {{ formattedAddress, locality, city, state, pincode, country, placeId }}
 */
async function reverseGeocode(lat, lng) {
  requireKey();
  const cacheKey = `gmaps:rgeo:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url = `${BASE}/geocode/json?latlng=${lat},${lng}&key=${KEY}&language=en&region=in`;
  const data = await httpsGet(url);

  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(`Reverse geocode failed: ${data.status}`);
  }

  const result = data.results[0];
  const parts  = result.address_components || [];

  const get = (...types) => {
    for (const t of types) {
      const c = parts.find((p) => p.types.includes(t));
      if (c) return c.long_name;
    }
    return null;
  };

  const payload = {
    formattedAddress : result.formatted_address,
    locality         : get('sublocality_level_1', 'sublocality', 'neighborhood', 'locality'),
    city             : get('locality', 'administrative_area_level_3', 'administrative_area_level_2'),
    state            : get('administrative_area_level_1'),
    pincode          : get('postal_code'),
    country          : get('country'),
    placeId          : result.place_id,
  };

  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600).catch(() => {});
  logger.debug({ lat, lng, locality: payload.locality }, '[Maps] Reverse geocoded');
  return payload;
}

// Forward Geocoding

/**
 * Address string → coordinates + metadata.
 *
 * @returns {{ lat, lng, formattedAddress, city, state, pincode, placeId }}
 */
async function geocodeAddress(address) {
  requireKey();
  const cacheKey = `gmaps:fgeo:${Buffer.from(address).toString('base64').slice(0, 64)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url = `${BASE}/geocode/json?address=${encodeURIComponent(address)}&key=${KEY}&region=in&language=en`;
  const data = await httpsGet(url);

  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(`Geocode failed: ${data.status}`);
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;
  const parts  = result.address_components || [];

  const get = (...types) => {
    for (const t of types) {
      const c = parts.find((p) => p.types.includes(t));
      if (c) return c.long_name;
    }
    return null;
  };

  const payload = {
    lat, lng,
    formattedAddress : result.formatted_address,
    city             : get('locality', 'administrative_area_level_3'),
    state            : get('administrative_area_level_1'),
    pincode          : get('postal_code'),
    placeId          : result.place_id,
  };

  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 86400).catch(() => {});
  return payload;
}

// Distance Matrix

/**
 * Real road distance + traffic-aware ETA between two points.
 *
 * @param {number} oLat  origin latitude
 * @param {number} oLng  origin longitude
 * @param {number} dLat  destination latitude
 * @param {number} dLng  destination longitude
 * @param {'driving'|'walking'|'bicycling'|'transit'} mode
 *
 * @returns {{ distanceMeters, durationSeconds, durationInTrafficSeconds, distanceText, durationText }}
 */
async function getDistanceMatrix(oLat, oLng, dLat, dLng, mode = 'driving') {
  requireKey();

  // Cache by coords rounded to 3dp (~110m) for ~30s. A worker moving toward a
  // fixed pickup, and multiple co-located orders, reuse the same traffic read
  // instead of paying for a Distance Matrix element on every tick.
  const cacheKey =
    `gmaps:dm:${mode}:${oLat.toFixed(3)},${oLng.toFixed(3)}:${dLat.toFixed(3)},${dLng.toFixed(3)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url =
    `${BASE}/distancematrix/json` +
    `?origins=${oLat},${oLng}` +
    `&destinations=${dLat},${dLng}` +
    `&mode=${mode}` +
    `&departure_time=now` +
    `&traffic_model=best_guess` +
    `&key=${KEY}` +
    `&language=en&region=in&units=metric`;

  const data = await httpsGet(url);

  if (data.status !== 'OK') throw new Error(`Distance Matrix API error: ${data.status}`);

  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') {
    throw new Error(`Distance Matrix element error: ${el?.status || 'NO_RESULTS'}`);
  }

  const result = {
    distanceMeters          : el.distance.value,
    durationSeconds         : el.duration.value,
    durationInTrafficSeconds: el.duration_in_traffic?.value ?? el.duration.value,
    distanceText            : el.distance.text,
    durationText            : el.duration_in_traffic?.text ?? el.duration.text,
  };
  redis.set(cacheKey, JSON.stringify(result), 'EX', 30).catch(() => {});
  return result;
}

// Directions / Route

/**
 * Route polyline + metadata from Directions API.
 * Cached 10 minutes — short enough to be somewhat fresh, long enough to avoid
 * hammering the API when multiple workers/users refresh the same route.
 *
 * @returns {{
 *   encodedPolyline, decodedPath: [[lat,lng],...],
 *   lngLatPath: [[lng,lat],...],       ← Mapbox-ready (lng first)
 *   distanceMeters, durationSeconds, durationInTrafficSeconds,
 *   distanceText, durationText,
 *   steps: [{ instruction, distanceMeters, durationSeconds, startLat, startLng, endLat, endLng }]
 * }}
 */
async function getDirections(oLat, oLng, dLat, dLng) {
  requireKey();

  const cacheKey = `gmaps:dir:${oLat.toFixed(3)},${oLng.toFixed(3)}:${dLat.toFixed(3)},${dLng.toFixed(3)}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url =
    `${BASE}/directions/json` +
    `?origin=${oLat},${oLng}` +
    `&destination=${dLat},${dLng}` +
    `&mode=driving` +
    `&departure_time=now` +
    `&traffic_model=best_guess` +
    `&alternatives=false` +
    `&key=${KEY}` +
    `&language=en&region=in`;

  const data = await httpsGet(url);

  if (data.status !== 'OK' || !data.routes?.[0]) {
    throw new Error(`Directions API error: ${data.status}`);
  }

  const route = data.routes[0];
  const leg   = route.legs[0];
  const encodedPolyline = route.overview_polyline.points;
  const decodedPath     = decodePolyline(encodedPolyline);
  const lngLatPath      = decodedPath.map(([lat, lng]) => [lng, lat]);

  const payload = {
    encodedPolyline,
    decodedPath,
    lngLatPath,
    distanceMeters          : leg.distance.value,
    durationSeconds         : leg.duration.value,
    durationInTrafficSeconds: leg.duration_in_traffic?.value ?? leg.duration.value,
    distanceText            : leg.distance.text,
    durationText            : leg.duration_in_traffic?.text ?? leg.duration.text,
    steps: leg.steps.map((s) => ({
      instruction    : (s.html_instructions || '').replace(/<[^>]*>/g, ''),
      distanceMeters : s.distance.value,
      durationSeconds: s.duration.value,
      startLat       : s.start_location.lat,
      startLng       : s.start_location.lng,
      endLat         : s.end_location.lat,
      endLng         : s.end_location.lng,
    })),
  };

  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 600).catch(() => {});
  logger.debug({ oLat, oLng, dLat, dLng, distanceText: payload.distanceText }, '[Maps] Directions fetched');
  return payload;
}

// Roads API — Snap to Road

/**
 * Snap up to 100 GPS coordinates to the nearest road segment.
 * Cleans up jittery GPS trails for display.
 *
 * @param {[lat, lng][]} path
 * @returns {[lat, lng][]} snapped path
 */
async function snapToRoads(path) {
  requireKey();
  if (!path?.length) return [];

  const points = path.slice(0, 100).map(([lat, lng]) => `${lat},${lng}`).join('|');
  const url = `https://roads.googleapis.com/v1/snapToRoads?path=${points}&interpolate=true&key=${KEY}`;

  const data = await httpsGet(url);
  if (!data.snappedPoints?.length) return path; // graceful passthrough on failure

  return data.snappedPoints.map((p) => [p.location.latitude, p.location.longitude]);
}

// Places Autocomplete

/**
 * Google Places Autocomplete server-side proxy (avoids CORS from browser).
 *
 * @param {string} input      User-typed text
 * @param {number} [lat]      Bias center latitude
 * @param {number} [lng]      Bias center longitude
 * @param {number} [radius]   Bias radius in metres (default 50 000 = 50 km)
 * @returns {{ placeId, description, mainText, secondaryText }[]}
 */
async function placesAutocomplete(input, lat, lng, radius = 50000) {
  requireKey();
  if (!input?.trim()) return [];

  let url =
    `${BASE}/place/autocomplete/json` +
    `?input=${encodeURIComponent(input)}` +
    `&components=country:in` +
    `&language=en` +
    `&key=${KEY}`;

  if (lat != null && lng != null) {
    url += `&location=${lat},${lng}&radius=${radius}`;
  }

  const data = await httpsGet(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places Autocomplete error: ${data.status}`);
  }

  return (data.predictions || []).map((p) => ({
    placeId      : p.place_id,
    description  : p.description,
    mainText     : p.structured_formatting?.main_text     || p.description,
    secondaryText: p.structured_formatting?.secondary_text || '',
  }));
}

// Place Details

/**
 * Resolve a Google Place ID to coordinates + address.
 * Cached 24 h — place locations don't change.
 *
 * @returns {{ lat, lng, formattedAddress, name, city, state, pincode, placeId }}
 */
async function getPlaceDetails(placeId) {
  requireKey();
  const cacheKey = `gmaps:place:${placeId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url =
    `${BASE}/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=geometry,formatted_address,name,address_components` +
    `&key=${KEY}&language=en`;

  const data = await httpsGet(url);

  if (data.status !== 'OK' || !data.result) {
    throw new Error(`Place Details error: ${data.status}`);
  }

  const r     = data.result;
  const parts = r.address_components || [];

  const get = (...types) => {
    for (const t of types) {
      const c = parts.find((p) => p.types.includes(t));
      if (c) return c.long_name;
    }
    return null;
  };

  const payload = {
    placeId,
    name            : r.name,
    lat             : r.geometry.location.lat,
    lng             : r.geometry.location.lng,
    formattedAddress: r.formatted_address,
    city            : get('locality', 'administrative_area_level_3'),
    state           : get('administrative_area_level_1'),
    pincode         : get('postal_code'),
  };

  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 86400).catch(() => {});
  return payload;
}

// Static Map URL

/**
 * Build a Google Static Maps URL (no API call needed — URL is the resource).
 * Useful for notification thumbnails and email/SMS previews.
 *
 * @param {{ lat, lng }}  center
 * @param {object}        [opts]
 * @param {number}        [opts.zoom=16]
 * @param {number}        [opts.width=400]
 * @param {number}        [opts.height=300]
 * @param {'roadmap'|'satellite'|'terrain'|'hybrid'} [opts.maptype='roadmap']
 * @returns {string}  URL you can embed in <img> src
 */
function buildStaticMapUrl(center, { zoom = 16, width = 400, height = 300, maptype = 'roadmap' } = {}) {
  requireKey();
  const { lat, lng } = center;
  const marker = `color:red%7Clabel:P%7C${lat},${lng}`;
  return (
    `${BASE}/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&maptype=${maptype}` +
    `&markers=${marker}` +
    `&style=feature:all%7Celement:all%7Csaturation:-20` +
    `&key=${KEY}`
  );
}

module.exports = {
  reverseGeocode,
  geocodeAddress,
  getDistanceMatrix,
  getDirections,
  snapToRoads,
  placesAutocomplete,
  getPlaceDetails,
  buildStaticMapUrl,
  decodePolyline,
};
