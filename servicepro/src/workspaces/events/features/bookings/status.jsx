/**
 * How each booking state looks to a partner. The labels, next steps and filters
 * are shared with the ServicePro app (shared/events/partnerBookings).
 */
import { PARTNER_STATUS_LABEL, NEXT_STEP, FILTERS } from '@shared/events/partnerBookings';

export { NEXT_STEP, FILTERS };

const TONE = {
  pending_payment:  'bg-sunken text-ink-700',
  confirmed:        'bg-amber-50 text-amber-800',
  partner_assigned: 'bg-zappy-50 text-zappy-700',
  in_progress:      'bg-zappy-50 text-zappy-700',
  completed:        'bg-green-50 text-green-700',
  cancelled:        'bg-red-50 text-red-700',
  disputed:         'bg-red-50 text-red-700',
};

export const STATUS = Object.fromEntries(Object.entries(PARTNER_STATUS_LABEL).map(([k, label]) => [k, { label, tone: TONE[k] }]));

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, tone: 'bg-sunken text-ink-700' };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}
