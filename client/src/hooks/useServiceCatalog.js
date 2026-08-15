import { useCallback, useEffect, useState } from 'react';

/**
 * Shared loader for the public service catalog (`GET /api/catalog/services`).
 *
 * The catalog drives the category grid, every category page, the detail page
 * and its related-services rail — mounting them back-to-back used to mean one
 * network round-trip each. This module keeps a single in-memory copy plus an
 * in-flight promise, so navigating Home → Car Services → a service detail hits
 * the network once. The API already sets `Cache-Control: max-age=60`; this is
 * the client-side half of that.
 *
 * Deliberately not RTK Query: this endpoint is public/unauthenticated and is
 * fetched by pages that render before the auth-scoped api slice is warm.
 */

const CACHE = { services: null, fetchedAt: 0, inflight: null };
const TTL_MS = 5 * 60 * 1000;
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn();
}

async function loadCatalog(force = false) {
  const fresh = CACHE.services && Date.now() - CACHE.fetchedAt < TTL_MS;
  if (!force && fresh) return CACHE.services;
  if (CACHE.inflight) return CACHE.inflight;

  const baseUrl = import.meta.env.VITE_API_URL || '';
  CACHE.inflight = fetch(`${baseUrl}/api/catalog/services`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      CACHE.services = Array.isArray(data.services) ? data.services : [];
      CACHE.fetchedAt = Date.now();
      notify();
      return CACHE.services;
    })
    .finally(() => { CACHE.inflight = null; });

  return CACHE.inflight;
}

/** Warm the catalog ahead of navigation (e.g. on route prefetch / idle). */
export function prefetchServiceCatalog() {
  loadCatalog().catch(() => {});
}

export default function useServiceCatalog() {
  const [services, setServices] = useState(() => CACHE.services || []);
  const [loading, setLoading] = useState(() => !CACHE.services);
  const [error, setError] = useState(null);

  const run = useCallback((force) => {
    let cancelled = false;
    setLoading(!CACHE.services);
    setError(null);
    loadCatalog(force)
      .then((list) => { if (!cancelled) { setServices(list); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => run(false), [run]);

  // Keep every mounted consumer in step when another one refetches.
  useEffect(() => {
    const sync = () => setServices(CACHE.services || []);
    subscribers.add(sync);
    return () => subscribers.delete(sync);
  }, []);

  const refetch = useCallback(() => run(true), [run]);

  return { services, loading, error, refetch };
}
