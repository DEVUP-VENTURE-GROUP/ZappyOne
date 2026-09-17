import { useMemo } from 'react';
import { useListOrdersQuery, useMyRepairBookingsQuery } from '../services/api';
import { serviceNameKey } from '../i18n/translations';

/**
 * Everything the customer has booked — orders AND repairs — as one list.
 *
 * Orders and repair bookings live in separate collections with separate status
 * vocabularies, and every screen that wanted "what has this customer got on"
 * quietly answered it with orders alone. The same bug therefore shipped three
 * times over: the Track tab said "No active order" while a technician was en
 * route, the home screen showed no live card, and the Activity page said "No
 * upcoming bookings" to someone with a repair in progress.
 *
 * Patching each screen a fourth time would just move the bug. This is the one
 * place that knows both shapes, so a screen asks for jobs and gets jobs.
 *
 * Repairs are classified by their TERMINAL states rather than their active
 * ones: the repair machine has twenty-odd statuses, and one added later should
 * default to "still happening" rather than silently vanishing from a customer's
 * list.
 */

const ORDER_ACTIVE = new Set([
  'created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress',
]);

const REPAIR_CLOSED = new Set([
  'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED',
]);

/**
 * One terminal vocabulary both kinds answer to.
 *
 * An order ends `completed`; a repair ends `COMPLETED`, `REJECTED`, `EXPIRED`
 * or four other things. Every screen that wanted to filter history — or just
 * tint a pill green — had to know both lists, so the history filter silently
 * dropped repairs. Translating once here means a filter asks for `outcome`
 * and gets an answer for either kind.
 */
const ORDER_OUTCOME = { completed: 'completed', cancelled: 'cancelled', failed: 'failed' };

const REPAIR_OUTCOME = {
  COMPLETED: 'completed',
  // A repair the customer never got reads as cancelled, however it got there.
  CANCELLED: 'cancelled', REJECTED: 'cancelled', EXPIRED: 'cancelled', REFUNDED: 'cancelled',
  FAILED: 'failed',
};

/**
 * Plain-language stage, so a list can show one line per job.
 *
 * Both maps live here because three screens were each keeping their own copy,
 * and the copies had already drifted — Home said "Finding a worker" where
 * Activity said "Searching", and Track kept a set of labels it never rendered.
 * One map means fixing a word fixes it everywhere.
 */
const ORDER_STAGE = {
  created: 'Order placed',
  searching: 'Finding a worker',
  assigned: 'Worker assigned',
  on_the_way: 'On the way',
  arrived: 'Worker has arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Could not be completed',
};

const REPAIR_STAGE = {
  PENDING: 'Getting your booking ready',
  CONFIRMED: 'Finding you a technician',
  PROVIDER_ASSIGNED: 'Technician assigned',
  WORKER_ACCEPTED: 'Technician accepted',
  ON_THE_WAY: 'Technician on the way',
  ARRIVED: 'Technician has arrived',
  DIAGNOSING: 'Checking what is wrong',
  QUOTE_PENDING: 'Preparing your quote',
  CUSTOMER_APPROVAL_PENDING: 'Your approval needed',
  APPROVED: 'Approved — work starting',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  DEVICE_PICKED_UP: 'Device collected',
  AT_WORKSHOP: 'At the workshop',
  REPAIR_IN_PROGRESS: 'Being repaired',
  QA_PENDING: 'Final quality checks',
  READY_FOR_RETURN: 'Ready to return',
  OUT_FOR_RETURN: 'On the way back to you',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Declined',
  EXPIRED: 'Expired',
  FAILED: 'Could not be completed',
  REFUNDED: 'Refunded',
};

/** One shape both kinds answer to, so a list never branches on `kind`. */
function fromOrder(o) {
  return {
    kind: 'order',
    id: o._id,
    reference: o.orderNumber || o._id,
    title: (o.service || 'Booking').replace(/_/g, ' '),
    stage: ORDER_STAGE[o.status] || o.status?.replace(/_/g, ' ') || '',
    /**
     * Translation keys travel WITH the job.
     *
     * Otherwise every screen has to know that orders translate under `status.`
     * and repairs under `repairStatus.` — which is the branch that kept getting
     * written three times and getting one kind wrong each time.
     */
    statusKey: `status.${o.status}`,
    titleKey: serviceNameKey((o.service || 'Booking').replace(/_/g, ' ')),
    status: o.status,
    active: ORDER_ACTIVE.has(o.status),
    needsYou: false,
    outcome: ORDER_OUTCOME[o.status] || null,
    // Paise everywhere, rupees only where it is printed.
    totalPaise: o.pricing?.totalPaise
      ?? (o.pricing?.total != null ? Math.round(o.pricing.total * 100) : null),
    rating: o.userRating ?? null,
    address: o.pickupLocation?.address || '',
    coordinates: o.pickupLocation?.coordinates || null,
    /** What the icon matcher reads to pick a character. */
    iconCode: o.service || '',
    rebookHref: o.service ? `/book/${o.service}` : null,
    // Only orders have an invoice endpoint; a repair settles on its own page.
    canInvoice: true,
    createdAt: o.createdAt,
    href: `/orders/${o._id}`,
    raw: o,
  };
}

function fromRepair(b) {
  return {
    kind: 'repair',
    id: b._id,
    reference: b.reference,
    title: [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Device repair',
    stage: REPAIR_STAGE[b.status] || b.status,
    statusKey: `repairStatus.${b.status}`,
    // No entry exists for a device name today; `t` falls back to the name
    // itself, and a translated one can be added later without a code change.
    titleKey: serviceNameKey(
      [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Device repair',
    ),
    status: b.status,
    active: !REPAIR_CLOSED.has(b.status),
    // The one state that should pull a customer back into the app.
    needsYou: b.status === 'CUSTOMER_APPROVAL_PENDING',
    outcome: REPAIR_OUTCOME[b.status] || null,
    totalPaise: b.priceSnapshot?.totalPaise ?? null,
    rating: b.rating ?? null,
    address: b.location?.address || '',
    coordinates: b.location?.coordinates || null,
    /**
     * The vertical decides the picture and the repair sharpens it, so a repair
     * row gets the same character art as the order rows rather than a generic
     * spanner. Nothing here names a vertical — a new one seeds in (§91).
     */
    iconCode: [b.vertical, b.repairCode].filter(Boolean).join(' '),
    // Mirrors how the repair routes are actually shaped in App.jsx.
    rebookHref: b.vertical ? (b.vertical === 'mobile' ? '/repair' : `/repair/${b.vertical}`) : null,
    canInvoice: false,
    createdAt: b.createdAt,
    href: `/repair/bookings/${b._id}`,
    raw: b,
  };
}

export function useMyJobs({ page = 1, skip = false } = {}) {
  const orders = useListOrdersQuery(page, { skip });
  const repairs = useMyRepairBookingsQuery(page, { skip });

  const jobs = useMemo(() => {
    const merged = [
      ...(orders.data?.orders || []).map(fromOrder),
      ...(repairs.data?.bookings || []).map(fromRepair),
    ];
    // Newest first, whichever collection it came from.
    return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders.data, repairs.data]);

  const active = useMemo(() => jobs.filter((j) => j.active), [jobs]);

  return {
    jobs,
    active,
    past: useMemo(() => jobs.filter((j) => !j.active), [jobs]),
    /** The one to surface when there is room for exactly one. */
    current: active.find((j) => j.needsYou) || active[0] || null,
    isLoading: orders.isLoading || repairs.isLoading,
    isFetching: orders.isFetching || repairs.isFetching,
    isError: orders.isError && repairs.isError,
    // Awaited by pull-to-refresh, so hand back both.
    refetch: () => Promise.all([orders.refetch(), repairs.refetch()]),
    /** Kept so callers can still page the order list. */
    orderPages: orders.data?.pages ?? 1,
  };
}

export { REPAIR_STAGE, ORDER_STAGE, REPAIR_CLOSED, ORDER_ACTIVE, REPAIR_OUTCOME };
