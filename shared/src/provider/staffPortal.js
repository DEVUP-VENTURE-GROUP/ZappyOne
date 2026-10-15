/**
 * The Rakshak portal is for ZappyOne's own staff only (server workforce/):
 * salaried, so no per-job money screens (earnings, goals, bank, withdraw),
 * no hours or auto-accept (their shifts decide when they work) and no
 * appeals. Partners (shops, agencies and their teams) use ServicePro, which
 * keeps all of it. The website reads its surface; the app passes `staff`.
 */
export const STAFF_PORTAL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLIENT_SURFACE) === 'rakshak';

/** Pages for partners paid per job, not for staff. */
export const PARTNER_ONLY = new Set(['/worker/earnings', '/worker/goals', '/worker/bank', '/worker/withdraw', '/worker/hours', '/worker/appeals']);

/** A menu as the portal shows it: staff lose the partner-only pages and get their shifts. */
export function staffMenu(items, staff = STAFF_PORTAL) {
  if (!staff) return items;
  return items
    .map((i) => (i.to === '/worker/earnings' ? { ...i, key: 'shifts', label: 'Shifts', to: '/worker/shifts' } : i))
    .filter((i) => !PARTNER_ONLY.has(i.to));
}
