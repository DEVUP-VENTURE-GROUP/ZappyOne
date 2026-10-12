/**
 * Smart reverse geocoding — three-tier with Google Maps as primary.
 *
 * Tier 1 — Google geocoder via the Maps JS script (most accurate for Indian addresses:
 *           sublocality, pincode, colony names)
 * Tier 2 — Mapbox Geocoding (good Indian coverage, fast)
 * Tier 3 — Nominatim/OSM (open-source fallback, no key required)
 *
 * Returns { primary, secondary, pincode?, placeId? } where:
 *   primary   — most specific local area (colony / ward / suburb)
 *   secondary — "City, State"
 */

import { geocodeGoogle, googleReady } from '../services/googlePlaces';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Tier 1: Google Geocoding API

async function reverseGeocodeGoogle(lat, lng) {
  // Only once the Maps script is on the page (the website-locked key works through it, not REST).
  if (!googleReady()) return null;
  try {
    const result = await geocodeGoogle({ location: { lat: Number(lat), lng: Number(lng) } });
    if (!result) return null;
    const parts  = result.address_components || [];

    const get = (...types) => {
      for (const t of types) {
        const c = parts.find((p) => p.types.includes(t));
        if (c) return c.long_name;
      }
      return null;
    };

    // Indian address priority: sublocality > neighborhood > locality > city
    const primary =
      get('sublocality_level_2') ||
      get('sublocality_level_1') ||
      get('sublocality')         ||
      get('neighborhood')        ||
      get('premise')             ||
      get('locality');

    const city      = get('locality', 'administrative_area_level_3', 'administrative_area_level_2');
    const state     = get('administrative_area_level_1');
    const pincode   = get('postal_code');
    const placeId   = result.place_id;
    const secondary = [city, state].filter(Boolean).join(', ') || null;

    if (!primary) return null;
    return { primary, secondary, pincode, placeId };
  } catch {
    return null;
  }
}

// Tier 2: Mapbox

async function reverseGeocodeMapbox(lat, lng) {
  if (!MAPBOX_TOKEN) return null;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?access_token=${MAPBOX_TOKEN}&language=en` +
      `&types=address,neighborhood,locality,place&limit=1`,
    );
    if (!r.ok) return null;
    const d    = await r.json();
    const feat = d.features?.[0];
    if (!feat) return null;

    const ctx  = feat.context || [];
    const get  = (prefix) => ctx.find((c) => c.id?.startsWith(prefix))?.text ?? null;

    const neighborhood = get('neighborhood');
    const locality     = get('locality');
    const place        = get('place') || get('district');
    const region       = get('region');

    const isDistrict = (s) => s && /district|mandal|taluk/i.test(s);
    const primary =
      neighborhood ||
      (locality && !isDistrict(locality) ? locality : null) ||
      place ||
      feat.text;

    const city      = place || get('district');
    const secondary = [city, region].filter(Boolean).join(', ') || null;
    if (!primary) return null;
    return { primary, secondary };
  } catch {
    return null;
  }
}

// Tier 3: Nominatim

async function reverseGeocodeNominatim(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
      `&format=json&zoom=18&addressdetails=1&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    const a = d.address || {};

    const primary =
      a.quarter       ||
      a.neighbourhood ||
      a.suburb        ||
      a.city_district ||
      a.village       ||
      a.town          ||
      a.city          ||
      null;

    const city      = a.city || a.town || a.county;
    const state     = a.state;
    const secondary = [city, state].filter(Boolean).join(', ') || null;
    if (!primary) return null;
    return { primary, secondary };
  } catch {
    return null;
  }
}

// Public API

/**
 * Remove any part of `secondary` that duplicates `primary`, so we never render
 * "Belén District, Belén District". If nothing meaningful remains, drop it.
 */
function dedupe(result) {
  if (!result?.secondary || !result.primary) return result;
  const prim = result.primary.trim().toLowerCase();
  const parts = result.secondary
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && p.toLowerCase() !== prim);
  return { ...result, secondary: parts.join(', ') || null };
}

/*
 * One lookup per spot. Home, the header and the profile all ask for the same
 * address at once, and every screen change asked again: each was a paid Google
 * call and a wait. Answers are kept for the session per ~10 m square, and two
 * screens asking at the same moment share the one request.
 */
const answers = new Map();

export function reverseGeocode(lat, lng) {
  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (!answers.has(key)) {
    const pending = lookup(lat, lng);
    answers.set(key, pending);
    // A fallback answer is not worth keeping: try again next time.
    pending.then((r) => { if (r?.primary === 'Location found') answers.delete(key); }, () => answers.delete(key));
    if (answers.size > 50) answers.delete(answers.keys().next().value);
  }
  return answers.get(key);
}

async function lookup(lat, lng) {
  const google = await reverseGeocodeGoogle(lat, lng);
  if (google) return dedupe(google);

  const mapbox = await reverseGeocodeMapbox(lat, lng);
  if (mapbox) return dedupe(mapbox);

  const nominatim = await reverseGeocodeNominatim(lat, lng);
  if (nominatim) return dedupe(nominatim);

  return { primary: 'Location found', secondary: null };
}
