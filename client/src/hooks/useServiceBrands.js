import { useEffect, useState } from 'react';

/**
 * Brands and device/vehicle models for the catalog.
 *
 * Both come straight from the existing public endpoints —
 * `GET /api/catalog/services/brands?category=…` and
 * `GET /api/catalog/services/models?brandCode=…` — which are backed by the
 * admin-managed Brand and DeviceModel collections. Nothing is hardcoded here:
 * if an admin adds a brand it shows up, and if a category has no brands the
 * picker doesn't render at all.
 *
 * Responses are cached per key for the session because the picker mounts on
 * every service detail page, and the brand list for "car" is identical on all
 * thirteen of them.
 */

const cache = new Map();      // key → array
const inflight = new Map();   // key → promise

function load(key, path) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);

  const baseUrl = import.meta.env.VITE_API_URL || '';
  const promise = fetch(`${baseUrl}${path}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => {
      const list = data.brands || data.models || [];
      cache.set(key, list);
      return list;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

function useRemoteList(key, path) {
  const [items, setItems] = useState(() => cache.get(key) || []);
  const [loading, setLoading] = useState(() => Boolean(key) && !cache.has(key));

  useEffect(() => {
    if (!key) { setItems([]); setLoading(false); return undefined; }
    if (cache.has(key)) { setItems(cache.get(key)); setLoading(false); return undefined; }

    let cancelled = false;
    setLoading(true);
    load(key, path)
      .then((list) => { if (!cancelled) setItems(list); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, path]);

  return { items, loading };
}

/** Brands for a brand-category ('mobile' | 'laptop' | 'car' | 'bike'). */
export function useBrands(brandCategory) {
  const { items, loading } = useRemoteList(
    brandCategory ? `brands:${brandCategory}` : null,
    `/api/catalog/services/brands?category=${encodeURIComponent(brandCategory || '')}`,
  );
  return { brands: items, loading };
}

/** Models for a brand code. Empty when the brand has none seeded. */
export function useModels(brandCode) {
  const { items, loading } = useRemoteList(
    brandCode ? `models:${brandCode}` : null,
    `/api/catalog/services/models?brandCode=${encodeURIComponent(brandCode || '')}`,
  );
  return { models: items, loading };
}
