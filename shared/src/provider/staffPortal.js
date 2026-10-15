/**
 * The Rakshak website is for ZappyOne's own staff only (server workforce/):
 * partner-only pages (provider/partnerPages) are hidden there. ServicePro
 * keeps all of them.
 */
import { PARTNER_ONLY, staffMenu as menuFor } from './partnerPages';

export const STAFF_PORTAL = import.meta.env?.VITE_CLIENT_SURFACE === 'rakshak';
export { PARTNER_ONLY };
export const staffMenu = (items, staff = STAFF_PORTAL) => menuFor(items, staff);
