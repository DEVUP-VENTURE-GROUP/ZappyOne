// Reads VITE_ZI_SLUG from client/.env — no hardcoded fallback.
// To change the slug: update VITE_ZI_SLUG in client/.env and ZI_SLUG in server/.env, then restart.
export const ZI_SLUG = import.meta.env.VITE_ZI_SLUG;

if (!ZI_SLUG) {
  throw new Error('[ZI] VITE_ZI_SLUG is not set in client/.env');
}

/** Frontend path: ziPath('/login') → '/{slug}/login' */
export const ziPath = (sub = '') => `/${ZI_SLUG}${sub}`;

/** API path: ziApiPath('/auth/login') → '/api/zi/{slug}/auth/login' */
export const ziApiPath = (sub = '') => `/api/zi/${ZI_SLUG}${sub}`;
