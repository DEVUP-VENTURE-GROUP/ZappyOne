/**
 * Every Fleet portal screen lives under its own secret slug (VITE_FLEET_SLUG,
 * not the admin one): /<slug>/login, /<slug>/dashboard. Any other path is a
 * plain 404, so the portal never says what it is or where its login is.
 */
export const FLEET_SLUG = import.meta.env.VITE_FLEET_SLUG || 'fleet';
export const fleetPath = (sub = '') => `/${FLEET_SLUG}${sub}`;
