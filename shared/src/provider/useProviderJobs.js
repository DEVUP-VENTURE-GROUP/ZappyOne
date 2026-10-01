import { useMemo } from 'react';
import {
  useRepairProviderJobsQuery,
  useAssignedPetBookingsQuery, useAvailablePetBookingsQuery, useAcceptPetBookingMutation,
  useAssignedHelpingTasksQuery, useAvailableHelpingTasksQuery, useAcceptHelpingTaskMutation,
} from '../services/api';

/**
 * Every job a provider holds or could take — repairs, pet care, helping — as
 * one list, the provider's side of the customer's useMyJobs.
 *
 * Each kind keeps its own endpoints (and its own rules on the server); this is
 * the one place that knows their shapes, so a screen asks for "my work" and
 * "open work near me" and never branches on kind. Adding a kind means adding
 * one entry to SOURCES below.
 *
 *   kinds  which kinds this app works (a shop team has no helping tasks)
 */

const nameOf = (s) => (s || '').replace(/_/g, ' ');

/* What a provider sees for each status: a label, and whether it needs them now. */
const STAGE = {
  repair: {
    PROVIDER_ASSIGNED: ['Accept or decline', true], WORKER_ACCEPTED: ['Accepted'], ON_THE_WAY: ['On the way'],
    ARRIVED: ['At the customer'], DIAGNOSING: ['Diagnosing'], QUOTE_PENDING: ['Quote sent'],
    CUSTOMER_APPROVAL_PENDING: ['Waiting on customer'], APPROVED: ['Approved, start work', true],
    PICKUP_SCHEDULED: ['Pickup scheduled'], DEVICE_PICKED_UP: ['Device collected'], AT_WORKSHOP: ['At the workshop'],
    REPAIR_IN_PROGRESS: ['Being repaired'], QA_PENDING: ['Quality check'], READY_FOR_RETURN: ['Ready to return', true],
    OUT_FOR_RETURN: ['Out for return'],
  },
  pet: {
    PROVIDER_ASSIGNED: ['Accept or decline', true], PROVIDER_ACCEPTED: ['Accepted'], PROVIDER_EN_ROUTE: ['On the way'],
    PROVIDER_ARRIVED: ['Arrived'], PET_HANDOVER: ['Handover'], SERVICE_STARTED: ['In progress'], SERVICE_PAUSED: ['Paused'],
    SERVICE_COMPLETED: ['Done'], CUSTOMER_CONFIRMATION: ['Done'], PAYMENT_PENDING: ['Collect payment', true],
  },
  helping: {
    WORKER_ASSIGNED: ['Assigned'], WORKER_ACCEPTED: ['Accepted'], EN_ROUTE: ['On the way'], ARRIVED: ['Arrived'],
    TASK_STARTED: ['Started'], IN_PROGRESS: ['In progress'], APPROVAL_REQUIRED: ['Waiting on customer'],
    ITEM_UNAVAILABLE: ['Item unavailable', true], RETURNING: ['Returning'], AT_DROPOFF: ['At drop-off'],
    HANDED_OVER: ['Handed over'], COMPLETED: ['Collect payment', true],
  },
};

function stage(kind, status) {
  const [label, attention = false] = STAGE[kind]?.[status] || [nameOf(status)];
  return { status: label, attention };
}

/* How each kind's rows become one shape. */
const SOURCES = {
  repair: {
    mine: (d) => (d?.bookings || []).map((b) => ({
      kind: 'repair', id: b._id, to: `/worker/repair/${b._id}`,
      title: [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Repair',
      subtitle: b.location?.address || nameOf(b.vertical),
      at: b.scheduledAt || b.createdAt, ...stage('repair', b.status),
      workerId: b.workerId || null, valuePaise: b.priceSnapshot?.totalPaise || 0,
      cashDue: b.paymentMethod === 'cash' && b.paymentStatus !== 'paid',
      late: !!b.stageDeadlineAt && new Date(b.stageDeadlineAt) < new Date(),
    })),
  },
  pet: {
    mine: (d) => (d?.bookings || []).map((b) => ({
      kind: 'pet', id: b._id, to: `/worker/pet/${b._id}`,
      title: (b.pets || []).map((p) => p.snapshot?.name).filter(Boolean).join(', ') || b.reference,
      subtitle: nameOf(b.categoryCode), at: b.scheduledAt || b.checkInAt || b.createdAt, ...stage('pet', b.status),
      workerId: b.workerId || null, valuePaise: b.pricing?.totalPaise || b.pricing?.providerAmountPaise || 0,
      cashDue: b.paymentMethod === 'cash' && b.paymentStatus !== 'paid',
    })),
    open: (d) => (d?.bookings || []).map((b) => ({
      kind: 'pet', id: b._id, service: nameOf(b.categoryCode),
      title: (b.pets || []).map((p) => [p.snapshot?.name, p.snapshot?.species].filter(Boolean).join(', ')).join(' · ') || 'Pet care',
      where: b.serviceLocation?.address || '', km: b.km ?? null,
      earningPaise: b.pricing?.providerAmountPaise || 0, at: b.scheduledAt || b.checkInAt || null,
    })),
  },
  helping: {
    mine: (d) => (d?.tasks || []).map((t) => ({
      kind: 'helping', id: t._id, to: `/worker/helping/${t._id}`,
      title: t.title || t.reference, subtitle: t.pickupLocation?.address || '',
      at: t.scheduledAt || t.createdAt, ...stage('helping', t.status),
    })),
    open: (d) => (d?.tasks || []).map((t) => ({
      kind: 'helping', id: t._id, service: nameOf(t.serviceType),
      title: t.title || (t.itemCount ? `${t.itemCount} item${t.itemCount > 1 ? 's' : ''}` : 'Errand'),
      where: t.pickupAddress || '', to: t.destinationAddress || '', km: t.distanceKm ?? null,
      earningPaise: t.earningPaise || 0, at: t.scheduledAt || null,
      // Money the helper may have to front, shown before they commit.
      frontPaise: t.advanceRequired ? t.itemBudgetPaise : 0,
    })),
  },
};

export function useProviderJobs({ kinds = ['repair', 'pet', 'helping'] } = {}) {
  const has = (k) => kinds.includes(k);
  const poll = { pollingInterval: 30000 };

  const repair = useRepairProviderJobsQuery({ active: 'true' }, { ...poll, skip: !has('repair') });
  const petMine = useAssignedPetBookingsQuery(undefined, { ...poll, skip: !has('pet') });
  const petOpen = useAvailablePetBookingsQuery(undefined, { ...poll, skip: !has('pet') });
  const helpMine = useAssignedHelpingTasksQuery(undefined, { ...poll, skip: !has('helping') });
  const helpOpen = useAvailableHelpingTasksQuery(undefined, { ...poll, skip: !has('helping') });
  const [acceptPet, { isLoading: takingPet }] = useAcceptPetBookingMutation();
  const [acceptHelping, { isLoading: takingHelp }] = useAcceptHelpingTaskMutation();

  const mine = useMemo(() => [
    ...(has('repair') ? SOURCES.repair.mine(repair.data) : []),
    ...(has('pet') ? SOURCES.pet.mine(petMine.data) : []),
    ...(has('helping') ? SOURCES.helping.mine(helpMine.data) : []),
  ]
    // What needs them first, then soonest.
    .sort((a, b) => Number(b.attention) - Number(a.attention) || new Date(a.at || 0) - new Date(b.at || 0)),
  [repair.data, petMine.data, helpMine.data, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => [
    ...(has('pet') ? SOURCES.pet.open(petOpen.data) : []),
    ...(has('helping') ? SOURCES.helping.open(helpOpen.data) : []),
  ].sort((a, b) => (a.km ?? 99) - (b.km ?? 99)),
  [petOpen.data, helpOpen.data, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // A service the provider isn't verified for yet shows nothing open; say which.
  const notApproved = [
    has('pet') && petOpen.data?.notApproved && 'pet',
    has('helping') && helpOpen.data?.notApproved && 'helping',
  ].filter(Boolean);

  const sources = [repair, petMine, petOpen, helpMine, helpOpen];
  return {
    mine,
    open,
    notApproved,
    isLoading: sources.some((q) => q.isLoading),
    taking: takingPet || takingHelp,
    /** Take an open job; resolves to where its page is. */
    take: async (job) => {
      if (job.kind === 'pet') { await acceptPet(job.id).unwrap(); return `/worker/pet/${job.id}`; }
      if (job.kind === 'helping') { await acceptHelping(job.id).unwrap(); return `/worker/helping/${job.id}`; }
      throw new Error(`Cannot take a ${job.kind} job from the board`);
    },
    refetch: () => Promise.all(sources.filter((q) => !q.isUninitialized).map((q) => q.refetch())),
  };
}
