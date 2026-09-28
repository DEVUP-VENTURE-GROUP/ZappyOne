import { useJsApiLoader } from '@react-google-maps/api';

export const GOOGLE_MAPS_KEY  = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
export const GOOGLE_LIBRARIES = ['places', 'geometry', 'routes'];

/**
 * Load Google Maps JavaScript API once per app lifecycle.
 * Call this hook in any component that needs window.google.maps.
 * Multiple calls share the same script tag — no duplicate loading.
 */
export function useGoogleMaps() {
  return useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: GOOGLE_LIBRARIES,
  });
}

/**
 * Build a Google Static Maps image URL.
 * No API call — just constructs the URL to use as <img src>.
 *
 * @param {{ lat: number, lng: number }} center
 * @param {{ zoom?, width?, height?, maptype?, markers? }} opts
 * @returns {string}
 */
export function buildStaticMapUrl(
  { lat, lng },
  {
    zoom    = 16,
    width   = 400,
    height  = 300,
    maptype = 'roadmap',
    markers = [],
  } = {},
) {
  if (!GOOGLE_MAPS_KEY) return '';
  const defaultMarker = `color:red%7Clabel:P%7C${lat},${lng}`;
  const allMarkers = markers.length
    ? markers.map((m) => `color:${m.color || 'red'}%7Clabel:${m.label || ''}%7C${m.lat},${m.lng}`).join('&markers=')
    : defaultMarker;

  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&maptype=${maptype}` +
    `&markers=${allMarkers}` +
    `&key=${GOOGLE_MAPS_KEY}`
  );
}

/**
 * Generate a Street View static image URL for a location.
 * Useful for showing users a preview of the service address.
 *
 * @param {{ lat: number, lng: number }} location
 * @param {{ width?, height?, fov?, heading?, pitch? }} opts
 * @returns {string}
 */
export function buildStreetViewUrl(
  { lat, lng },
  { width = 400, height = 300, fov = 90, heading = 0, pitch = 0 } = {},
) {
  if (!GOOGLE_MAPS_KEY) return '';
  return (
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=${width}x${height}` +
    `&location=${lat},${lng}` +
    `&fov=${fov}` +
    `&heading=${heading}` +
    `&pitch=${pitch}` +
    `&key=${GOOGLE_MAPS_KEY}`
  );
}

/**
 * Client-side decode of Google's encoded polyline.
 * Use this when you have a polyline from the server and need [[lng, lat]] for Mapbox.
 *
 * @param {string} encoded  Google encoded polyline string
 * @returns {[number, number][]}  [[lng, lat], ...]  (Mapbox-ready)
 */
export function decodePolylineToLngLat(encoded) {
  if (!encoded) return [];
  const coords = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e5, lat / 1e5]); // [lng, lat] for Mapbox
  }
  return coords;
}
