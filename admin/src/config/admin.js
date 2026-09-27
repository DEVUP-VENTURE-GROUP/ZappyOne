// Every admin screen lives under the secret slug — /<slug>/login,
// /<slug>/dashboard. Any other path on this origin is a plain 404, so the
// portal never advertises where its login is. The API sits under the same slug.
export { ADMIN_SLUG, adminApiPath } from '@client/config/admin';
import { ADMIN_SLUG } from '@client/config/admin';

export const adminPath = (sub = '') => `/${ADMIN_SLUG}${sub}`;
