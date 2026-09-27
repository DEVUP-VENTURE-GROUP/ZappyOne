// Single source of truth for the admin slug on the frontend.
// Must match ADMIN_LOGIN_SLUG in server/.env.
export const ADMIN_SLUG = import.meta.env.VITE_ADMIN_SLUG || 'admin';

/** Build an absolute admin frontend path, e.g. adminPath('/login') → '/zappy-admin-login-x7k9m2/login' */
export const adminPath = (sub = '') => `/${ADMIN_SLUG}${sub}`;

/** Build an admin API path relative to /api, e.g. adminApiPath('/metrics') → '/zappy-admin-login-x7k9m2/metrics' */
export const adminApiPath = (sub = '') => `/${ADMIN_SLUG}${sub}`;

/** The admin portal is a separate app (admin/) on its own origin. */
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL
  || (import.meta.env.PROD ? 'https://admin.zappyone.com' : 'http://localhost:5174');
