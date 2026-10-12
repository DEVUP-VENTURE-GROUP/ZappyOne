/**
 * Google address lookups through the Maps JavaScript API that useGoogleMaps
 * loads, never the REST endpoints: the browser key is locked to our websites,
 * and Google's REST geocoding refuses website-locked keys. Search uses the new
 * Places API (AutocompleteSuggestion); the legacy service is used only where
 * the new one is missing. Every function resolves to null on any failure, so
 * callers fall back to Mapbox.
 */

const maps = () => (typeof window !== 'undefined' ? window.google?.maps : undefined);

/** Is the Google script loaded and usable? */
export const googleReady = () => !!maps()?.Geocoder;

/** google.maps.Geocoder request → the first result, or null. */
export function geocodeGoogle(request) {
  const g = maps();
  if (!g?.Geocoder) return Promise.resolve(null);
  return new g.Geocoder()
    .geocode({ language: 'en', region: 'in', ...request })
    .then((r) => r?.results?.[0] || null)
    .catch(() => null);
}

/** A geocoder result's point as { lat, lng }. */
export const pointOf = (result) => {
  const loc = result?.geometry?.location;
  return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
};

/**
 * Address suggestions for what was typed, near `near` ({ lat, lng }) when
 * given, in India. Shaped for the location picker; null when Google gave
 * nothing, so the picker asks Mapbox.
 */
export async function placeSuggestions(input, near) {
  const g = maps();
  if (!g?.places) return null;
  const bias = near ? { center: near, radius: 50000 } : undefined;
  try {
    if (g.places.AutocompleteSuggestion) {
      const { suggestions } = await g.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input, includedRegionCodes: ['in'], language: 'en', ...(bias ? { locationBias: bias } : {}),
      });
      const rows = (suggestions || []).map((s) => s.placePrediction).filter(Boolean).map((p) => ({
        id: p.placeId, _isGoogle: true, _placeId: p.placeId,
        text: p.mainText?.text || p.text?.text, place_name: p.text?.text, secondaryText: p.secondaryText?.text || '',
      }));
      return rows.length ? rows : null;
    }
    // Legacy service, for a key or script that does not have the new API yet.
    return await new Promise((resolve) => {
      new g.places.AutocompleteService().getPlacePredictions(
        { input, componentRestrictions: { country: 'in' }, ...(bias ? { locationBias: new g.Circle(bias) } : {}) },
        (predictions, status) => resolve(status === 'OK' && predictions?.length ? predictions.map((p) => ({
          id: p.place_id, _isGoogle: true, _placeId: p.place_id,
          text: p.structured_formatting?.main_text || p.description, place_name: p.description,
          secondaryText: p.structured_formatting?.secondary_text || '',
        })) : null),
      );
    });
  } catch {
    return null;
  }
}
