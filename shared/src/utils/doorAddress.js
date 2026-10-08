/**
 * The address a provider needs to find the door: what the customer typed for
 * the door (flat, gate, floor, landmark: LocationPicker's notes) in front of
 * the pinned street address — "Flat 302, Near Gate 2, Madhapur, Hyderabad".
 *
 * In front on purpose: before a job is accepted providers see only the area,
 * the last parts of the address (server jobs/privacy), so door details never
 * show early.
 */
export function doorAddress(loc) {
  if (!loc) return '';
  const base = String(loc.address || '').trim();
  const door = String(loc.notes || loc.door || '').trim().replace(/[·|]+/g, ',');
  if (!door || base.toLowerCase().startsWith(door.toLowerCase())) return base || door;
  return `${door}, ${base}`.slice(0, 300);
}
