/**
 * Tracking vocabulary — steps, status pills and feed copy.
 * ----------------------------------------------------------------------------
 * A port of `client/src/components/tracking/redesign/_shared.js`. Every key is
 * an `order.status` value the server actually produces (`order.model.js`), so
 * nothing here invents a state the backend cannot reach.
 * ----------------------------------------------------------------------------
 */

import type { OrderStatus } from '../../types/api';

export interface TrackingStep {
  key: string;
  label: string;
  desc: string;
}

/** Service-agnostic lifecycle steps, in order. */
export const STEPS: TrackingStep[] = [
  { key: 'searching', label: 'Finding your technician', desc: 'Matching you with the best nearby pro' },
  { key: 'assigned', label: 'Technician assigned', desc: 'A pro has accepted your request' },
  { key: 'on_the_way', label: 'On the way to you', desc: 'Your technician is heading over' },
  { key: 'arrived', label: 'Arrived at your location', desc: 'Your technician has reached you' },
  { key: 'in_progress', label: 'Service in progress', desc: 'Your service is being completed' },
  { key: 'completed', label: 'Service completed', desc: 'All done — thanks for using Zappy' },
];

export interface StatusPill {
  label: string;
  /** Whether the pill shows a pulsing "live" dot. */
  live: boolean;
}

export const STATUS_PILL: Record<string, StatusPill> = {
  created: { label: 'Finding worker', live: true },
  searching: { label: 'Finding worker', live: true },
  assigned: { label: 'Worker assigned', live: true },
  on_the_way: { label: 'On the way', live: true },
  arrived: { label: 'Arrived', live: true },
  in_progress: { label: 'In service', live: true },
  completed: { label: 'Completed', live: false },
  cancelled: { label: 'Cancelled', live: false },
  failed: { label: 'No workers', live: false },
};

export function statusPill(status?: string | null): StatusPill {
  return STATUS_PILL[status ?? ''] ?? STATUS_PILL.searching;
}

/**
 * Which lifecycle step a status sits on. `created` folds into the first step,
 * as it does on the web — the customer does not distinguish "created" from
 * "searching", and the server moves between them on its own.
 */
export function activeStepIndex(status?: string | null): number {
  if (!status) return 0;
  if (status === 'created') return 0;
  const i = STEPS.findIndex((s) => s.key === status);
  return i >= 0 ? i : 0;
}

/** Grounded activity-feed copy per status. Null when a status earns no entry. */
export function feedCopy(statusKey: string, firstName?: string): string | null {
  switch (statusKey) {
    case 'created':
      return 'Order placed — searching for a technician';
    case 'searching':
      return 'Searching nearby technicians…';
    case 'assigned':
      return `${firstName || 'A technician'} accepted your request`;
    case 'on_the_way':
      return `${firstName || 'Your technician'} started heading to you`;
    case 'arrived':
      return `${firstName || 'Your technician'} arrived at your location`;
    case 'in_progress':
      return 'Service started';
    case 'completed':
      return 'Service completed';
    case 'cancelled':
      return 'Order cancelled';
    case 'failed':
      return 'No technicians available right now';
    default:
      return null;
  }
}

/** `Order #ABC123` — the last six characters, as the website shows it. */
export function shortId(id?: string | null): string {
  return id ? String(id).slice(-6).toUpperCase() : '';
}

export function firstNameOf(name?: string | null): string {
  return name ? String(name).trim().split(/\s+/)[0] : '';
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Statuses that end the order — no map, no live updates. */
export const TERMINAL_STATUSES: OrderStatus[] = ['completed', 'cancelled', 'failed'];

export function isTerminal(status?: string | null): boolean {
  return TERMINAL_STATUSES.includes((status ?? '') as OrderStatus);
}
