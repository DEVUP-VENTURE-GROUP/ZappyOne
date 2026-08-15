import { useCallback, useSyncExternalStore } from 'react';

/**
 * Wishlist / favourites for catalog services.
 *
 * Stored locally on the device rather than server-side: there's no favourites
 * endpoint in the API, and adding one would mean touching the backend. Because
 * several components (grid cards, the detail page header, the category header
 * count) show the same state at once, it lives in a tiny external store rather
 * than per-component state — every subscriber updates in the same tick.
 */

const KEY = 'zappy.catalog.favorites';

let state = read();
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(next) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode / quota */ }
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = () => state;
// SSR/prerender safety — the store is a plain array, so a stable empty one works.
const EMPTY = [];
const getServerSnapshot = () => EMPTY;

export default function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isFavorite = useCallback((code) => favorites.includes(code), [favorites]);

  const toggle = useCallback((code) => {
    if (!code) return false;
    const has = state.includes(code);
    write(has ? state.filter((c) => c !== code) : [...state, code]);
    return !has; // the new state, so callers can toast "Saved"/"Removed"
  }, []);

  return { favorites, isFavorite, toggle, count: favorites.length };
}
