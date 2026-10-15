/**
 * Pages for partners paid per job (shops, agencies and their teams on
 * ServicePro), not for ZappyOne's own salaried staff on Rakshak (server
 * workforce/): earnings, goals, bank, withdraw, hours (and auto-accept),
 * appeals. Platform-free; the website and the apps both filter by it.
 */
export const PARTNER_ONLY = new Set(['/worker/earnings', '/worker/goals', '/worker/bank', '/worker/withdraw', '/worker/hours', '/worker/appeals']);

/**
 * A menu as staff see it: the money pages give way to their shifts.
 * @template {{ to: string }} T
 * @param {T[]} items
 * @param {boolean} staff
 * @returns {T[]}
 */
export function staffMenu(items, staff) {
  if (!staff) return items;
  return items
    .map((i) => (i.to === '/worker/earnings' ? { ...i, key: 'shifts', label: 'Shifts', to: '/worker/shifts' } : i))
    .filter((i) => !PARTNER_ONLY.has(i.to));
}
