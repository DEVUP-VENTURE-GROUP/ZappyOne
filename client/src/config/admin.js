// The admin API is mounted under a secret slug. Must match ADMIN_LOGIN_SLUG in
// server/.env. The admin screens themselves live in the separate admin/ app;
// the customer app only needs this for the shared API layer.
export const ADMIN_SLUG = import.meta.env.VITE_ADMIN_SLUG || 'admin';

/** Admin API path relative to /api, e.g. adminApiPath('/metrics') → '/<slug>/metrics' */
export const adminApiPath = (sub = '') => `/${ADMIN_SLUG}${sub}`;
