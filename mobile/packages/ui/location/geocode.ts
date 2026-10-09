/**
 * Address search and reverse lookup.
 * ----------------------------------------------------------------------------
 * WHY NOT GOOGLE PLACES
 * `app.json` carries PLACEHOLDER Maps keys — `YOUR_GOOGLE_MAPS_IOS_KEY` and
 * `YOUR_GOOGLE_MAPS_ANDROID_KEY` — and shipping a real one in the client would
 * be the wrong fix regardless.
 *
 * THE SERVER DOES PROXY ONE, AND IT DOES NOT WORK YET. An earlier version of
 * this note claimed no server route existed. That was wrong:
 * `server/src/modules/maps/maps.routes.js` exposes authenticated
 * `/api/maps/autocomplete`, `/geocode`, `/reverse-geocode`, `/route`, `/eta`,
 * `/place` and `/static`. Every one of them was exercised against the dev
 * backend and every one returns HTTP 500 `REQUEST_DENIED`, because no Maps key
 * is provisioned server-side. Routing search through them today would replace
 * working address search with a guaranteed failure.
 *
 * So the platform geocoder stays for now. When a key is provisioned server-side
 * these routes become the better source — they give real Places-quality
 * typeahead and keep the key off the device — and this module is the single
 * place that has to change.
 *
 * WHAT THIS DOES INSTEAD
 * `expo-location` exposes the PLATFORM geocoder — CLGeocoder on iOS, Android's
 * Geocoder — which needs no key. `geocodeAsync` turns a query into coordinates
 * and can return several candidates; each is reverse-geocoded to build a
 * readable two-line label. The result is real address search with a result
 * list, debounced as the user types. It is not a per-keystroke suggestion
 * service, and it is deliberately not presented as one.
 *
 * RATE LIMITS ARE REAL. Both platform geocoders throttle aggressively and will
 * start throwing under rapid calls, so every path here is debounced, capped at
 * `MAX_RESULTS`, and cancels in-flight work when the query changes.
 * ----------------------------------------------------------------------------
 */

import * as Location from 'expo-location';

/** Platform geocoders throttle hard; more than a handful of results is abuse. */
const MAX_RESULTS = 5;

export interface GeoResult {
  /** Stable enough for a list key — coordinates are unique per candidate. */
  id: string;
  lat: number;
  lng: number;
  /** Short name, e.g. "Road No 12". */
  title: string;
  /** Fuller line, e.g. "Banjara Hills, Hyderabad, Telangana". */
  subtitle: string;
  /** `title` + `subtitle`, the value stored on the booking. */
  full: string;
}

export type SearchOutcome =
  | { kind: 'results'; results: GeoResult[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

/** Builds display lines from a platform reverse-geocode result. */
function toLabel(place: Location.LocationGeocodedAddress | undefined, fallback: string) {
  if (!place) return { title: fallback, subtitle: '' };

  const title =
    [place.name, place.street].filter(Boolean).find((v) => v && v.trim()) ?? fallback;

  // `name` is often the street number + street, which would repeat in the
  // subtitle. Filter any part already contained in the title.
  const subtitle = [place.district, place.city, place.subregion, place.region, place.postalCode]
    .filter((part): part is string => Boolean(part) && !title.includes(part as string))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(', ');

  return { title, subtitle };
}

export function joinAddress(title: string, subtitle: string): string {
  return [title, subtitle].filter(Boolean).join(', ');
}

/**
 * Look up a typed query. Resolves to a discriminated outcome rather than
 * throwing, so the caller can render "no results" and "search failed"
 * differently — they mean different things to a customer.
 */
export async function searchAddress(query: string): Promise<SearchOutcome> {
  const text = query.trim();
  if (text.length < 3) return { kind: 'empty' };

  let candidates: Location.LocationGeocodedLocation[];
  try {
    candidates = await Location.geocodeAsync(text);
  } catch {
    return {
      kind: 'error',
      message: 'Address search is unavailable right now. Drop the pin on the map instead.',
    };
  }

  if (!candidates || candidates.length === 0) return { kind: 'empty' };

  const top = candidates.slice(0, MAX_RESULTS);

  // Reverse-geocode each candidate for a label. One failure must not lose the
  // whole result set, so each settles independently and falls back to the query.
  const results = await Promise.all(
    top.map(async (c): Promise<GeoResult> => {
      let place: Location.LocationGeocodedAddress | undefined;
      try {
        [place] = await Location.reverseGeocodeAsync({
          latitude: c.latitude,
          longitude: c.longitude,
        });
      } catch {
        /* fall back to the raw query below */
      }
      const { title, subtitle } = toLabel(place, text);
      return {
        id: `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`,
        lat: c.latitude,
        lng: c.longitude,
        title,
        subtitle,
        full: joinAddress(title, subtitle),
      };
    }),
  );

  // Distinct coordinates can still reverse-geocode to the same street.
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    if (seen.has(r.full)) return false;
    seen.add(r.full);
    return true;
  });

  return unique.length > 0 ? { kind: 'results', results: unique } : { kind: 'empty' };
}

/**
 * Coordinates → a readable address, for the pin the user just moved.
 * Returns null rather than throwing; the caller keeps showing coordinates.
 */
export async function describeCoordinates(
  lat: number,
  lng: number,
): Promise<{ title: string; subtitle: string; full: string } | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!place) return null;
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const { title, subtitle } = toLabel(place, fallback);
    return { title, subtitle, full: joinAddress(title, subtitle) };
  } catch {
    return null;
  }
}
