import { useEffect, useState } from 'react';
import { applyCategoriesFromApi, getGroups } from '../lib/serviceCatalogGroups';

/**
 * Loads the admin-managed category taxonomy (`GET /api/catalog/categories`) and
 * swaps it into the runtime grouping store, so the customer catalog, worker skill
 * pickers and booking flow all reflect admin category changes with no code change.
 * Module-cached like useServiceCatalog; safe to call from many components.
 */
const CACHE = { categories: null, fetchedAt: 0, inflight: null };
const TTL_MS = 5 * 60 * 1000;

export function loadCategories(force = false) {
  const fresh = CACHE.categories && Date.now() - CACHE.fetchedAt < TTL_MS;
  if (fresh && !force) return Promise.resolve(CACHE.categories);
  if (CACHE.inflight) return CACHE.inflight;

  const baseUrl = import.meta.env.VITE_API_URL || '';
  CACHE.inflight = fetch(`${baseUrl}/api/catalog/categories`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const cats = d?.categories || [];
      if (cats.length) {
        CACHE.categories = cats;
        CACHE.fetchedAt = Date.now();
        applyCategoriesFromApi(cats); // swap the runtime taxonomy + notify subscribers
      }
      CACHE.inflight = null;
      return cats;
    })
    .catch(() => { CACHE.inflight = null; return null; });
  return CACHE.inflight;
}

export default function useCategories() {
  const [categories, setCategories] = useState(CACHE.categories || []);
  useEffect(() => {
    let alive = true;
    loadCategories().then((c) => { if (alive && Array.isArray(c)) setCategories(c); });
    return () => { alive = false; };
  }, []);
  return { categories, groups: getGroups() };
}
