/**
 * How each booking state reads to a partner, and the one thing they do next.
 * The transitions mirror the server (event-partner-api updateBookingStatus):
 * confirmed -> partner_assigned -> in_progress (host's start code) -> completed
 * (needs a photo of the finished setup).
 */
export const STATUS = {
  pending_payment:  { label: 'Awaiting payment', tone: 'bg-sunken text-ink-700' },
  confirmed:        { label: 'New request', tone: 'bg-amber-50 text-amber-800' },
  partner_assigned: { label: 'Accepted', tone: 'bg-zappy-50 text-zappy-700' },
  in_progress:      { label: 'Setting up', tone: 'bg-zappy-50 text-zappy-700' },
  completed:        { label: 'Completed', tone: 'bg-green-50 text-green-700' },
  cancelled:        { label: 'Cancelled', tone: 'bg-red-50 text-red-700' },
  disputed:         { label: 'Under review', tone: 'bg-red-50 text-red-700' },
};

export const NEXT_STEP = {
  confirmed:        { to: 'partner_assigned', label: 'Accept booking' },
  partner_assigned: { to: 'in_progress', label: 'Start setup', needsCode: true },
  in_progress:      { to: 'completed', label: 'Mark completed', needsAfterPhoto: true },
};

export const FILTERS = [
  { key: 'confirmed', label: 'New' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: '', label: 'All' },
];

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, tone: 'bg-sunken text-ink-700' };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}
