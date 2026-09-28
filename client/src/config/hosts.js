
/**
 * Multi-tenant hosts — one SPA, three front doors (Zomato/Zepto model).
 *
 *   zappyone.com          consumer app (services + events storefront). CLEAN:
 *                         no worker/partner login surfaced in the UI.
 *   rakshak.zappyone.com  worker app
 *   events.zappyone.com   event-partner portal (decorator businesses)
 *
 * All three are the same Vercel deployment (vercel.json rewrites everything to
 * index.html), so the host decides which app the visitor gets.
 *
 * NOTE: every host listed here must ALSO be in server/src/config/origins.js, or
 * its API + socket calls are blocked by CORS.
 */

export const APEX = 'zappyone.com';
export const WORKER_HOST = `rakshak.${APEX}`;
export const EVENTS_HOST = `events.${APEX}`;

export const WORKER_URL = `https://${WORKER_HOST}`;
export const EVENTS_URL = `https://${EVENTS_HOST}`;
export const CONSUMER_URL = `https://www.${APEX}`;

/** 'worker' | 'events' | 'consumer' — which app this hostname serves. */
export function getTenant(hostname) {
  const host = String(hostname || '').toLowerCase().split(':')[0]; // strip :port
  if (host === WORKER_HOST || host.startsWith('rakshak.')) return 'worker';
  if (host === EVENTS_HOST || host.startsWith('events.')) return 'events';
  return 'consumer';
}

// Legal/help pages must stay reachable on EVERY host — app stores and payment
// providers require them, and bouncing them to a login is a compliance problem.
const PUBLIC_PREFIXES = ['/faq', '/policy'];
const isPublic = (p) => PUBLIC_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Where this visitor belongs on this host. Returns a path to redirect to, or
 * null to render the requested route as-is.
 *
 * Rules:
 *  - Public legal pages render everywhere.
 *  - Each subdomain admits exactly ONE role. Anyone else is sent to the host
 *    that actually serves them (an absolute URL for a cross-host move), never
 *    left staring at the consumer homepage on the worker domain.
 */
export function getSubdomainRedirect(hostname, pathname, token, role) {
  const tenant = getTenant(hostname);
  if (tenant === 'consumer') return null;          // consumer app routes itself
  if (isPublic(pathname)) return null;

  if (tenant === 'worker') {
    if (!token) return pathname === '/worker/login' ? null : '/worker/login';
    if (role === 'worker') return pathname.startsWith('/worker') ? null : '/worker';
    // Signed in as someone this host doesn't serve → send them to their own app.
    if (role === 'event_partner') return EVENTS_URL;
    return CONSUMER_URL;                            // customer
  }

  if (tenant === 'events') {
    if (!token) return pathname === '/partner/login' ? null : '/partner/login';
    if (role === 'event_partner') return pathname.startsWith('/partner') ? null : '/partner';
    if (role === 'worker') return WORKER_URL;
    return CONSUMER_URL;                            // customer books events on the consumer app
  }

  return null;
}

/** True when the redirect target is another host (needs a full page load). */
export const isExternalRedirect = (dest) => typeof dest === 'string' && /^https?:\/\//.test(dest);
