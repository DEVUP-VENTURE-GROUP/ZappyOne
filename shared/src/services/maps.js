import { useJsApiLoader } from '@react-google-maps/api';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
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
