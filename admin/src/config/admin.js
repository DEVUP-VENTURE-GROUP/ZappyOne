// The portal owns its whole origin, so its screens live at the root
// (/login, /dashboard). The API is still mounted under the secret slug —
// that part comes from the shared client config.
export { ADMIN_SLUG, adminApiPath } from '@client/config/admin';

export const adminPath = (sub = '') => sub || '/';
