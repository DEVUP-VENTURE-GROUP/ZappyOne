/**
 * Status vocabulary for tickets and disputes.
 * ----------------------------------------------------------------------------
 * Both models carry their own status enum, and both are rendered with the same
 * badge language the website uses on SupportPage / DisputesPage:
 *
 *   open          blue     — logged, not yet picked up
 *   in_progress   blue     — an agent is on it
 *   under_review  amber    — dispute equivalent of in_progress
 *   waiting_user  amber    — WE are the blocker; the list calls this out
 *   resolved      green
 *   closed        neutral
 *
 * Tones come from `ChipTone` so the badges are the existing `Chip`, not a new
 * component. The website renders `in_progress` in violet; there is no violet in
 * the Zappy token set, and inventing one would put a colour on screen that
 * appears nowhere else in the product, so it shares the blue "being worked on"
 * family instead.
 *
 * `under_review` — NOT `in_review`. The server enum
 * (dispute.model.js) is the authority. The website's DisputesPage keys its map
 * on `in_review`, which never matches, so a dispute under review silently
 * renders there as "Open".
 * ----------------------------------------------------------------------------
 */

import type { ChipTone } from '../ui';
import type { DisputeStatus, SupportPriority, SupportStatus } from '../../types/api';

export interface StatusMeta {
  label: string;
  tone: ChipTone;
}

const TICKET_STATUS: Record<SupportStatus, StatusMeta> = {
  open: { label: 'Open', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'blue' },
  waiting_user: { label: 'Awaiting you', tone: 'accent' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

const DISPUTE_STATUS: Record<DisputeStatus, StatusMeta> = {
  open: { label: 'Open', tone: 'blue' },
  under_review: { label: 'Under review', tone: 'accent' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export function ticketStatusMeta(status: SupportStatus): StatusMeta {
  return TICKET_STATUS[status] ?? TICKET_STATUS.open;
}

export function disputeStatusMeta(status: DisputeStatus): StatusMeta {
  return DISPUTE_STATUS[status] ?? DISPUTE_STATUS.open;
}

/** A thread is read-only once the far side has finished with it. */
export function isThreadClosed(status: SupportStatus | DisputeStatus): boolean {
  return status === 'resolved' || status === 'closed';
}

/**
 * First-response SLA in hours, mirroring the website's PRIORITY_SLA table.
 * The server stores an absolute `slaDeadline`; this is only used to explain
 * what a priority MEANS while the ticket is still being written, when no
 * deadline exists yet.
 */
export const PRIORITY_SLA_HOURS: Record<SupportPriority, number> = {
  urgent: 1,
  high: 2,
  normal: 4,
  low: 24,
};

/** `service_not_done` → `Service not done`. */
export function humanizeCategory(value?: string): string {
  if (!value) return '';
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Short reference shown in a thread header — the website uses the last 8. */
export function shortRef(id: string): string {
  return `#${id.slice(-8)}`;
}

/**
 * Whether "Report an issue" should be offered for an order.
 *
 * Mirrors the two conditions in `dispute.service.open()` that this screen can
 * actually evaluate:
 *   - the order finished (completed / cancelled / failed)
 *   - within the last 7 days
 *
 * The other three — you are a party to the order, no dispute is already open,
 * and the 3-per-30-days cap — are NOT checked here. Two of them need data this
 * screen does not hold, and racing the server on the third would only produce a
 * different wrong answer. The server rejects those with a clear message and the
 * sheet shows it, so the cost of offering the button optimistically is one
 * honest error instead of a hidden action.
 */
export function canRaiseDispute(order: {
  status?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
}): boolean {
  if (!order?.status) return false;
  if (!['completed', 'cancelled', 'failed'].includes(order.status)) return false;

  const finishedAt = order.completedAt ?? order.cancelledAt ?? order.createdAt;
  if (!finishedAt) return false;
  const ms = new Date(finishedAt).getTime();
  if (Number.isNaN(ms)) return false;

  return (Date.now() - ms) / 86_400_000 <= DISPUTE_WINDOW_DAYS;
}

/** Mirrors the 7-day check in `dispute.service.open()`. */
export const DISPUTE_WINDOW_DAYS = 7;
