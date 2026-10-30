// When the pros who cover an address are back, from their real hours (serviceability nextOpening); the header's big line while they are offline.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function to12h(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function backAt(next) {
  if (!next) return 'Back soon';
  if (next.daysAhead === 0) return `Back at ${to12h(next.opensAt)}`;
  if (next.daysAhead === 1) return `Back tomorrow, ${to12h(next.opensAt)}`;
  return `Back ${DAYS[next.day]}, ${to12h(next.opensAt)}`;
}
