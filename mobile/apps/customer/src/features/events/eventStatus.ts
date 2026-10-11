/** How an event booking's status reads to the customer, and where it sits on the timeline (the website's STEP_MAP). */
import { accent, danger, ink, success, zappy } from '@zappy/ui/theme/colors';

export const EVENT_STATUS: Record<string, { label: string; step: number; color: string }> = {
  pending_payment:  { label: 'Awaiting payment', step: 0, color: ink[500] },
  confirmed:        { label: 'Confirmed', step: 1, color: zappy[600] },
  partner_assigned: { label: 'Team assigned', step: 2, color: zappy[700] },
  in_progress:      { label: 'Setting up', step: 3, color: accent[700] },
  completed:        { label: 'Completed', step: 4, color: success[700] },
  cancelled:        { label: 'Cancelled', step: -1, color: danger[600] },
  disputed:         { label: 'Under review', step: -1, color: accent[700] },
};

export const EVENT_TIMELINE = ['Payment', 'Confirmed', 'Assigned', 'Setting up', 'Done'];

export const statusOf = (s?: string) => EVENT_STATUS[s || ''] || EVENT_STATUS.pending_payment;

export const eventDay = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '–');
