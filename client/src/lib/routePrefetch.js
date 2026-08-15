// Warms lazy route chunks BEFORE the user navigates, so tapping a tab feels
// instant instead of showing the full-screen <PageLoader/> spinner while the
// JS chunk downloads.
//
// These import() calls resolve to the SAME chunks used by App.jsx's lazy(),
// because the bundler dedupes by module specifier — so calling them here just
// fills the browser's module cache early. Subsequent lazy() resolves are sync.

const loaders = {
  '/':         () => import('../pages/HomePage'),
  '/services': () => import('../pages/ServicesPage'),
  '/orders':   () => import('../pages/OrdersListPage'),
  '/track':    () => import('../pages/TrackPage'),
  '/profile':  () => import('../pages/ProfilePage'),
  // Category catalog is the #1 destination from the Home tiles, so it's worth
  // warming alongside the tabs. The service detail chunk is only prefetched on
  // demand (prefetchRoute) — it's one level deeper in the funnel.
  '/services/:category': () => import('../pages/CategoryCatalogPage'),
  '/service/:code':      () => import('../pages/ServiceDetailPage'),
};

// The chunks warmed by prefetchMainTabs — everything a user can reach in one tap.
const MAIN_TABS = ['/', '/services', '/orders', '/track', '/profile', '/services/:category'];

const warmed = new Set();

// Prefetch a single route's chunk (no-op if already warmed or unknown path).
export function prefetchRoute(path) {
  const load = loaders[path];
  if (!load || warmed.has(path)) return;
  warmed.add(path);
  load().catch(() => warmed.delete(path)); // allow retry if the chunk failed
}

// Warm every primary tab — call from an idle callback after first paint.
export function prefetchMainTabs() {
  MAIN_TABS.forEach(prefetchRoute);
}

// requestIdleCallback with a setTimeout fallback (Safari / older browsers).
export function onIdle(fn) {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 1200);
  }
}
