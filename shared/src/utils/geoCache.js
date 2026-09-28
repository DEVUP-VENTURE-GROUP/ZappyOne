import { metresBetween } from './distance';

const KEY = 'zappy:loc';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How far the position may drift before the stored address stops describing it.
 *
 * Generous enough to absorb ordinary GPS jitter and a refined fix on the same
 * street, tight enough that crossing a neighbourhood drops the old label.
 */
const ADDRESS_VALID_WITHIN_M = 150;

/**
 * The last known position, kept across page loads.
 *
 * Thirty minutes is deliberate: long enough that a refresh, a tab restore, or
 * walking between two screens never re-prompts for GPS, short enough that a
 * customer who has actually travelled is not offered yesterday's street.
 *
 * The address is stored alongside the coordinates because a pin with no label
 * cannot be shown to anyone — every screen that restores a position needs
 * something readable to put next to it.
 */

export function saveGeoLocation({ lat, lng, accuracy, address }) {
  try {
    const prev = readRaw();

    /**
     * A raw GPS sample carries no address, and `useGeolocation` saves one on
     * every watch tick — so the previous label was inherited forever.
     *
     * That was the bug: the coordinates tracked the customer perfectly while
     * the NAME stayed wherever they had last been geocoded. Someone who
     * travelled from Vikarabad to Hyderabad kept seeing "Vikarabad" beside a
     * pin correctly placed in Hyderabad, and every screen reading the cache
     * repeated it.
     *
     * So the old label is inherited only while it still plausibly describes
     * the position. Past that, better to show nothing and let the screen
     * re-resolve than to state a place the customer is not in.
     */
    const moved = prev && metresBetween({ lat: prev.lat, lng: prev.lng }, { lat, lng });
    const inheritable = prev?.address && (moved == null || moved <= ADDRESS_VALID_WITHIN_M);

    localStorage.setItem(KEY, JSON.stringify({
      lat,
      lng,
      accuracy,
      address: address ?? (inheritable ? prev.address : ''),
      t: Date.now(),
    }));
  } catch { /* private mode, quota, blocked storage — never break the page */ }
}

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function loadGeoLocation() {
  const d = readRaw();
  if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') return null;
  if (Date.now() - d.t > MAX_AGE_MS) return null;
  return {
    lat: d.lat,
    lng: d.lng,
    accuracy: d.accuracy ?? null,
    address: d.address || '',
  };
}
