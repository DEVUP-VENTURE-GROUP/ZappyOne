import { useMemo } from 'react';
import {
  useListOrdersQuery, useMyRepairBookingsQuery, useMyPetBookingsQuery, useMyHelpingTasksQuery,
} from '@shared/services/api';
import { serviceNameKey } from '@shared/i18n/translations';

/**
 * Everything the customer has booked — orders, repairs, pet bookings and
 * helping tasks — as one list.
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

/* Pet care: the owner is done once the service is; payment has its own card. */
const PET_OUTCOME = {
  SERVICE_COMPLETED: 'completed', CUSTOMER_CONFIRMATION: 'completed', PAYMENT_PENDING: 'completed',
  PAYMENT_COMPLETED: 'completed', CLOSED: 'completed', CANCELLED: 'cancelled', REFUNDED: 'cancelled',
};
const PET_STAGE = {
  REQUESTED: 'Requested', PRICE_PENDING: 'Getting your price', AWAITING_CUSTOMER_APPROVAL: 'Your approval needed',
  BOOKED: 'Booked', PROVIDER_SEARCHING: 'Finding a pet pro', PROVIDER_ASSIGNED: 'Pet pro assigned',
  PROVIDER_ACCEPTED: 'Pet pro confirmed', PROVIDER_EN_ROUTE: 'On the way', PROVIDER_ARRIVED: 'Arrived',
  PET_HANDOVER: 'Handing over', SERVICE_STARTED: 'In progress', SERVICE_PAUSED: 'Paused',
  SERVICE_COMPLETED: 'Completed', CUSTOMER_CONFIRMATION: 'Completed', PAYMENT_PENDING: 'Completed · payment due',
  PAYMENT_COMPLETED: 'Completed', CLOSED: 'Completed', CANCELLED: 'Cancelled', REFUNDED: 'Refunded', DISPUTED: 'Under review',
};

function fromPet(b) {
  const title = (b.categoryCode || 'pet care').replace(/_/g, ' ');
  return {
    kind: 'pet',
    id: b._id,
    reference: b.reference,
    title,
    stage: PET_STAGE[b.status] || b.status,
    statusKey: `petStatus.${b.status}`,
    titleKey: serviceNameKey(title),
    status: b.status,
    active: !PET_OUTCOME[b.status],
    needsYou: b.status === 'AWAITING_CUSTOMER_APPROVAL',
    outcome: PET_OUTCOME[b.status] || null,
    totalPaise: b.pricing?.totalPaise ?? null,
    rating: b.rating ?? null,
    address: b.serviceLocation?.address || '',
    coordinates: b.serviceLocation?.coordinates || null,
    iconCode: `pet ${b.categoryCode || ''}`,
    rebookHref: b.categoryCode ? `/pet/book/${b.categoryCode}` : '/pet',
    canInvoice: false,
    createdAt: b.createdAt,
    href: `/pet/bookings/${b._id}`,
    raw: b,
  };
}

/* Helping: DISPUTED stays open until it's resolved. */
const HELPING_OUTCOME = {
  COMPLETED: 'completed', CUSTOMER_CONFIRMED: 'completed', SETTLED: 'completed',
  CANCELLED: 'cancelled', FAILED: 'failed',
};
const HELPING_STAGE = {
  REQUESTED: 'Requested', PAYMENT_PENDING: 'Payment pending', CONFIRMED: 'Confirmed',
  WORKER_SEARCHING: 'Finding a helper', WORKER_ASSIGNED: 'Helper assigned', WORKER_DECLINED: 'Finding another helper',
  WORKER_ACCEPTED: 'Helper confirmed', EN_ROUTE: 'Helper on the way', ARRIVED: 'Helper arrived',
  TASK_STARTED: 'Started', IN_PROGRESS: 'In progress', APPROVAL_REQUIRED: 'Your approval needed',
  ITEM_UNAVAILABLE: 'Item unavailable', RETURNING: 'On the way back', AT_DROPOFF: 'At the drop-off',
  HANDED_OVER: 'Handed over', MERCHANT_REJECTED: 'Merchant did not accept it',
  EXCHANGE_UNAVAILABLE: 'Replacement unavailable', COMPLETED: 'Completed', CUSTOMER_CONFIRMED: 'Completed',
  SETTLED: 'Completed', CANCELLED: 'Cancelled', FAILED: 'Could not be completed', DISPUTED: 'Under review',
};
const HELPING_TITLE = { shopping: 'Shopping run', pickup: 'Pickup', return: 'Return', exchange: 'Exchange' };

function fromHelping(t) {
  const title = t.title || HELPING_TITLE[t.serviceType] || 'Helping task';
  const where = t.destination?.address ? t.destination : t.pickupLocation;
  return {
    kind: 'helping',
    id: t._id,
    reference: t.reference,
    title,
    stage: HELPING_STAGE[t.status] || t.status,
    statusKey: `helpingStatus.${t.status}`,
    titleKey: serviceNameKey(title),
    status: t.status,
    active: !HELPING_OUTCOME[t.status],
    needsYou: t.status === 'APPROVAL_REQUIRED',
    outcome: HELPING_OUTCOME[t.status] || null,
    totalPaise: t.charge?.serviceChargePaise ?? null, // the service fee; item money is its own figure
    rating: t.rating ?? null,
    address: where?.address || '',
    coordinates: where?.coordinates || null,
    iconCode: `helping ${t.serviceType || ''}`,
    rebookHref: ['return', 'exchange'].includes(t.serviceType) ? '/helping/returns' : '/helping/shopping',
    canInvoice: false,
    createdAt: t.createdAt,
    href: `/helping/tasks/${t._id}`,
    raw: t,
  };
}

export function useMyJobs({ page = 1, skip = false } = {}) {
  const orders = useListOrdersQuery(page, { skip });
  const repairs = useMyRepairBookingsQuery(page, { skip });
  const pets = useMyPetBookingsQuery({ page }, { skip });
  const helping = useMyHelpingTasksQuery({ page }, { skip });
  const sources = [orders, repairs, pets, helping];

  const jobs = useMemo(() => {
    const merged = [
      ...(orders.data?.orders || []).map(fromOrder),
      ...(repairs.data?.bookings || []).map(fromRepair),
      ...(pets.data?.bookings || []).map(fromPet),
      // A draft was never placed; it isn't a booking yet.
      ...(helping.data?.tasks || []).filter((t) => t.status !== 'DRAFT').map(fromHelping),
    ];
    // Newest first, whichever collection it came from.
    return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders.data, repairs.data, pets.data, helping.data]);

  const active = useMemo(() => jobs.filter((j) => j.active), [jobs]);

  return {
    jobs,
    active,
    past: useMemo(() => jobs.filter((j) => !j.active), [jobs]),
    /** The one to surface when there is room for exactly one. */
    current: active.find((j) => j.needsYou) || active[0] || null,
    isLoading: sources.some((q) => q.isLoading),
    isFetching: sources.some((q) => q.isFetching),
    isError: sources.every((q) => q.isError),
    // Awaited by pull-to-refresh, so hand back every source.
    refetch: () => Promise.all(sources.map((q) => q.refetch())),
    /** Kept so callers can still page the order list. */
    orderPages: orders.data?.pages ?? 1,
  };
}

export { REPAIR_STAGE, ORDER_STAGE, REPAIR_CLOSED, ORDER_ACTIVE, REPAIR_OUTCOME };
