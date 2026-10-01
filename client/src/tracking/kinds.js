import { tripOf } from '@shared/hooks/useLiveTrip';

/**
 * How each kind of job becomes the one shape the tracking page renders.
 *
 *   job = {
 *     kind, id, reference, service, subtitle, subtitleLabel, noun,
 *     status        one of the shared stages (searching … completed / cancelled / failed)
 *     statusLabel   the kind's own words for where it is
 *     rawStatus, terminal,
 *     provider      { name, phone, rating, jobs } once someone holds it
 *     place         { lat, lng, address }
 *     scheduledAt, createdAt,
 *     history       [{ stage, at }] first time each stage was reached
 *     price         { lines: [[label, paise]], totalPaise, method, paid, isEstimate, note }
 *     proofs        [url]
 *     trip          the live trip to follow (shared rules, useLiveTrip.tripOf), or null
 *   }
 *
 * The server's job registry (server/src/modules/jobs/kinds.js) decides what a
 * kind IS; this file only decides how it reads on screen. A new kind is one
 * entry here plus its page passing its own extras.
 */

const pointOf = (p) => (p?.coordinates?.length === 2 ? { lng: p.coordinates[0], lat: p.coordinates[1], address: p.address || '' } : { address: p?.address || '' });
const human = (s = '') => s.replace(/_/g, ' ').toLowerCase();
const method = (m) => ({ cash: 'Cash', online: 'Online', wallet: 'Wallet', upi: 'UPI', card: 'Card' }[m] || null);

function historyOf(raw, stageOf) {
  const seen = new Map();
  for (const h of raw.statusHistory || raw.timeline || []) {
    const stage = stageOf(h.status);
    const at = h.at || h.timestamp;
    if (stage && at && !seen.has(stage)) seen.set(stage, at);
  }
  return [...seen].map(([stage, at]) => ({ stage, at }));
}

/** Map a kind's raw statuses onto the shared stages. */
const stages = (table) => (status) => {
  for (const [stage, list] of Object.entries(table)) if (list.includes(status)) return stage;
  return null;
};

const repairStage = stages({
  searching: ['PENDING', 'CONFIRMED'],
  assigned: ['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED'],
  on_the_way: ['ON_THE_WAY', 'PICKUP_SCHEDULED'],
  arrived: ['ARRIVED'],
  in_progress: ['DIAGNOSING', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'APPROVED', 'DEVICE_PICKED_UP', 'AT_WORKSHOP',
    'REPAIR_IN_PROGRESS', 'QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN', 'DISPUTED'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED', 'EXPIRED', 'REFUNDED'],
  failed: ['FAILED'],
});

const petStage = stages({
  searching: ['REQUESTED', 'PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'BOOKED', 'PROVIDER_SEARCHING'],
  assigned: ['PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED'],
  on_the_way: ['PROVIDER_EN_ROUTE'],
  arrived: ['PROVIDER_ARRIVED', 'PET_HANDOVER'],
  in_progress: ['SERVICE_STARTED', 'SERVICE_PAUSED', 'DISPUTED'],
  completed: ['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CLOSED'],
  cancelled: ['CANCELLED', 'REFUNDED'],
});

const helpingStage = stages({
  searching: ['DRAFT', 'REQUESTED', 'PAYMENT_PENDING', 'CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED', 'WORKER_DECLINED'],
  assigned: ['WORKER_ACCEPTED'],
  on_the_way: ['EN_ROUTE'],
  arrived: ['ARRIVED'],
  in_progress: ['TASK_STARTED', 'IN_PROGRESS', 'APPROVAL_REQUIRED', 'ITEM_UNAVAILABLE', 'RETURNING', 'AT_DROPOFF',
    'HANDED_OVER', 'MERCHANT_REJECTED', 'EXCHANGE_UNAVAILABLE', 'DISPUTED'],
  completed: ['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED'],
  cancelled: ['CANCELLED'],
  failed: ['FAILED'],
});

const orderStage = (s) => (s === 'created' ? 'searching' : s);

const TERMINAL = ['completed', 'cancelled', 'failed'];
const finish = (job) => ({ ...job, terminal: TERMINAL.includes(job.status) });

export const KINDS = {
  repair: {
    noun: 'technician',
    stageOf: repairStage,
    /** data = GET /repair/bookings/:id → { booking, provider, quotes, canCancel } */
    toJob: (data, { statusLabel } = {}) => {
      const b = data.booking;
      const s = b.priceSnapshot || {};
      return finish({
        kind: 'repair', id: b._id, reference: b.reference, noun: 'technician',
        service: `${human(b.vertical)} repair`,
        subtitle: [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' '), subtitleLabel: 'Device',
        status: repairStage(b.status) || 'in_progress', statusLabel, rawStatus: b.status,
        provider: data.provider ? { name: data.provider.name, phone: data.provider.phone, rating: data.provider.rating, jobs: data.provider.completedJobs } : null,
        place: pointOf(b.location),
        scheduledAt: b.scheduledAt, createdAt: b.createdAt,
        history: historyOf(b, repairStage),
        price: {
          lines: [
            ['Parts', s.partPaise], ['Labour', s.labourPaise], ['Consumables', s.consumablesPaise], ['Travel', s.travelPaise],
            ['Pickup & return', (s.pickupPaise || 0) + (s.returnPaise || 0)], ['Inspection', s.diagnosisFeePaise],
            ['Platform fee', s.platformFeePaise], ['Taxes', s.taxPaise],
          ],
          totalPaise: s.totalPaise ?? null, method: method(b.paymentMethod), paid: b.paymentStatus === 'paid',
          isEstimate: !!s.isEstimate,
          note: s.isEstimate ? 'This is an estimate. The final price is confirmed by a quote you approve.' : (s.warrantyDays > 0 ? `${s.warrantyDays}-day warranty` : ''),
        },
        proofs: b.completionPhotos || [],
        trip: tripOf('repair', b),
      });
    },
  },

  pet: {
    noun: 'pet pro',
    stageOf: petStage,
    /** data = GET /pet/bookings/:id → { booking, provider, canCancel } */
    toJob: (data, { statusLabel } = {}) => {
      const b = data.booking;
      const p = b.pricing || {};
      return finish({
        kind: 'pet', id: b._id, reference: b.reference, noun: 'pet pro',
        service: human(b.categoryCode || 'pet care'),
        subtitle: (b.pets || []).map((x) => x.snapshot?.name).filter(Boolean).join(', '), subtitleLabel: 'Pets',
        status: petStage(b.status) || 'in_progress', statusLabel, rawStatus: b.status,
        provider: data.provider ? { name: data.provider.name, phone: data.provider.phone, rating: data.provider.rating, jobs: data.provider.completedJobs } : null,
        place: pointOf(b.serviceLocation),
        scheduledAt: b.scheduledAt || b.checkInAt, createdAt: b.createdAt,
        history: historyOf(b, petStage),
        price: {
          lines: [['Services', p.servicesPaise], ['Add-ons', p.addonsPaise], ['Travel', p.travelPaise], ['Platform fee', p.platformFeePaise], ['Taxes', p.taxPaise]],
          totalPaise: p.totalPaise ?? null, method: method(b.paymentMethod), paid: b.paymentStatus === 'paid',
          note: p.stayDiscountPaise > 0 ? `Includes a stay discount of ₹${Math.round(p.stayDiscountPaise / 100)}` : '',
        },
        proofs: (b.proofs || []).map((x) => x.url).filter(Boolean),
        trip: tripOf('pet', b),
      });
    },
  },

  helping: {
    noun: 'helper',
    stageOf: helpingStage,
    /** data = GET /helping/tasks/:id → { task, provider, authorisation, due, canCancel } */
    toJob: (data, { statusLabel } = {}) => {
      const t = data.task;
      const c = t.charge || {};
      const items = (t.items || []).length;
      return finish({
        kind: 'helping', id: t._id, reference: t.reference, noun: 'helper',
        service: t.title || human(t.serviceType || 'helping'),
        subtitle: items ? `${items} item${items > 1 ? 's' : ''}` : human(t.serviceType), subtitleLabel: 'Task',
        status: helpingStage(t.status) || 'in_progress', statusLabel, rawStatus: t.status,
        provider: data.provider ? { name: data.provider.name, phone: data.provider.phone, rating: data.provider.rating, jobs: data.provider.completedJobs } : null,
        place: pointOf(t.pickupLocation),
        scheduledAt: t.scheduledAt, createdAt: t.createdAt,
        history: historyOf(t, helpingStage),
        // The service fee only; item money is the customer's own and shown on its own card.
        price: {
          lines: [['Service', c.baseFeePaise], ['Distance', c.distanceFeePaise], ['Waiting', c.waitingFeePaise], ['Extra stops', c.multiStopFeePaise], ['Platform fee', c.platformFeePaise], ['Taxes', c.taxPaise]],
          totalPaise: data.authorisation?.serviceChargePaise ?? c.serviceChargePaise ?? null,
          method: method(t.paymentMethod), paid: t.paymentStatus === 'paid',
          note: data.authorisation?.note || '',
        },
        proofs: (t.proofs || []).map((x) => x.url).filter(Boolean),
        trip: tripOf('helping', t),
      });
    },
  },

  order: {
    noun: 'technician',
    stageOf: orderStage,
    /** data = GET /orders/:id → { order } (first-version orders; pricing in rupees) */
    toJob: (data, { statusLabel } = {}) => {
      const o = data.order;
      const p = o.pricing || {};
      const paise = (r) => (r != null ? Math.round(r * 100) : 0);
      return finish({
        kind: 'order', id: o._id, reference: `#${String(o._id).slice(-6).toUpperCase()}`, noun: 'technician',
        service: human(o.service || 'service'),
        subtitle: [o.deviceBrand, o.deviceModel].filter(Boolean).join(' '), subtitleLabel: 'Device',
        status: orderStage(o.status), statusLabel, rawStatus: o.status,
        provider: o.workerId ? { name: o.workerName, rating: o.workerRating, jobs: o.workerJobs } : null,
        place: pointOf(o.pickupLocation),
        scheduledAt: o.scheduledAt, createdAt: o.createdAt,
        history: [],
        price: {
          lines: [['Service fee', paise(p.baseFee)], ['Distance', paise(p.distanceFee)], ['Platform & taxes', paise(p.platformFee)]],
          totalPaise: p.total != null ? paise(p.total) : null,
          method: method(o.payment?.method) || 'UPI', paid: o.status === 'completed',
        },
        proofs: o.completionPhotos || [],
        trip: null, // orders track through their own socket slice
      });
    },
  },
};
