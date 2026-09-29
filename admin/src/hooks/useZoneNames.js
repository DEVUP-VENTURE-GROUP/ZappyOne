import { useState, useEffect } from 'react';

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const _geocodeCache = {};

async function reverseGeocodeBrowser(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (_geocodeCache[key]) return _geocodeCache[key];
  if (!GMAPS_KEY) return key;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=sublocality%7Clocality&key=${GMAPS_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results[0]) {
      const comps = data.results[0].address_components;
      const pick  = (...types) => types.map(t => comps.find(c => c.types.includes(t))?.long_name).find(Boolean);
      const sub   = pick('sublocality_level_1', 'sublocality', 'neighborhood');
      const city  = pick('locality', 'administrative_area_level_2');
      const label = [sub, city].filter(Boolean).join(', ')
        || data.results[0].formatted_address.split(',').slice(0, 2).join(', ').trim();
      _geocodeCache[key] = label;
      return label;
    }
  } catch (_) {}
  _geocodeCache[key] = key;
  return key;
}

/**
 * Given an array of { lat, lng, name? } zones, resolves each to a human-readable
 * area label. Uses server-provided name first, falls back to Google Geocoding.
 * Returns a map of "lat,lng" → label string.
 */
export default function useZoneNames(zones) {
  const [names, setNames] = useState({});
  useEffect(() => {
    if (!zones?.length) return;
    const unresolved = zones.filter(z => !names[`${z.lat},${z.lng}`]);
    if (!unresolved.length) return;
    Promise.all(
      unresolved.map(async z => {
        const serverName = z.name && !/^\d/.test(z.name) ? z.name : null;
        const resolved   = serverName || await reverseGeocodeBrowser(z.lat, z.lng);
        return [`${z.lat},${z.lng}`, resolved];
      })
    ).then(entries => setNames(prev => ({ ...prev, ...Object.fromEntries(entries) })));
  }, [zones]); // eslint-disable-line
  return names;
}
