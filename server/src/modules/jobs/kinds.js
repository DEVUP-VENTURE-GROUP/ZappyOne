/**
 * Every kind of job a customer books, described once.
 *
 * Repairs, pet bookings and helping tasks have their own models and status
 * machines, but the platform asks the same questions of all of them:
 *
 *   who is it for, who holds it          → participants
 *   which service line (for verification) → line()
 *   is the provider travelling, to where  → trip
 *   is it open for providers to take      → open
 *   what do we tell people at each stage  → copy
 *
 * Live tracking (worker/active-trip), room access (sockets), verification
 * (onboarding/eligibility) and lifecycle events (jobs/job-events) all read
 * this table instead of branching on kind. A new vertical is a new entry here.
 *
 * `provider(doc)` names who holds the job; it defaults to the worker or shop.
 * Events are held by an event partner, their own supply side.
 */

const pointOf = (p) => (Array.isArray(p?.coordinates) && p.coordinates.length === 2 ? p.coordinates : null);
const to = (p, toCustomer) => (pointOf(p) ? { point: pointOf(p), toCustomer } : null);
const place = (p) => (pointOf(p) ? { lng: p.coordinates[0], lat: p.coordinates[1], address: p.address || '' } : null);

/* Repair lines are found by vertical; cached because a line's vertical never changes. */
const repairLines = new Map();
async function repairLine(vertical) {
  if (!vertical) return null;
  if (!repairLines.has(vertical)) {
    const { ServiceLine } = require('../onboarding/onboarding.model');
    const line = await ServiceLine.findOne({ repairVertical: vertical }).select('code').lean();
    if (!line) return null;
    repairLines.set(vertical, line.code);
  }
  return repairLines.get(vertical);
}

/**
 * Ops view of a job: is it live, where is it, and is it stuck?
 * `stuck(doc, minutesInStatus, now)` returns a short reason, or null.
 */
const after = (limits, fallback) => (doc, mins) => {
  const limit = limits[doc.status] ?? fallback;
  return limit != null && mins > limit ? `${doc.status.replace(/_/g, ' ').toLowerCase()} for ${Math.round(mins)} min` : null;
};

const HELPING_LINE = { shopping: 'shopping_pickup', pickup: 'shopping_pickup', return: 'returns_exchange', exchange: 'returns_exchange' };

const KINDS = {
  repair: {
    label: 'repair',
    model: () => require('../repair/models/booking.model').RepairBooking,
    link: (id) => `/repair/bookings/${id}`,
    providerLink: (id) => `/worker/repair/${id}`,
    line: (b) => repairLine(b.vertical),
    trip: {
      fields: 'status userId workerId shopId location',
      travelling: ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'],
      heading: (b) => (b.status === 'DEVICE_PICKED_UP'
        ? { point: null, toCustomer: false } // on the way to the workshop
        : to(b.location, true)),
    },
    // Repairs are offered to one provider at a time by the matching engine, never posted open.
    open: null,
    // What a finished job paid the provider — the settlement run's own split.
    earning: {
      done: ['COMPLETED'],
      at: 'completedAt',
      fields: 'priceSnapshot paymentMethod completedAt',
      share: (b) => require('../repair/services/settlement.service').splitFor(b).providerPaise,
      platform: (b) => require('../repair/services/settlement.service').splitFor(b).platformPaise,
    },
    // Repair copy lives with its richer event service (quotes, SLA); see repair/services/events.service.
    copy: null,
    ops: {
      terminal: ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'],
      fields: 'status userId workerId shopId reference vertical serviceMode location createdAt updatedAt statusHistory',
      where: (b) => place(b.location),
      title: (b) => [b.vertical, b.serviceMode].filter(Boolean).join(' · ').replace(/_/g, ' '),
      waiting: ['PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED'],
      // Workshop repairs legitimately take days; the doorstep moments are minutes.
      stuck: after({ PENDING: 15, CONFIRMED: 10, PROVIDER_ASSIGNED: 15, WORKER_ACCEPTED: 60, ON_THE_WAY: 60, ARRIVED: 90, CUSTOMER_APPROVAL_PENDING: 120 }, 3 * 24 * 60),
    },
  },

  pet: {
    label: 'pet care',
    model: () => require('../pet/models/booking.model').PetBooking,
    link: (id) => `/pet/bookings/${id}`,
    providerLink: (id) => `/worker/pet/${id}`,
    line: async (b) => b.categoryCode || null,
    trip: {
      fields: 'status userId workerId shopId serviceMode serviceLocation destination',
      travelling: ['PROVIDER_EN_ROUTE', 'SERVICE_STARTED'],
      heading: (b) => {
        if (b.status === 'PROVIDER_EN_ROUTE') return to(b.serviceLocation, true);
        // When moving the pet IS the service, the owner follows the ride.
        return b.serviceMode === 'transport' ? { point: pointOf(b.destination), toCustomer: false } : null;
      },
    },
    // A booking the customer gave to one provider: it rings for them, and goes
    // back to the pool if they don't answer in the window.
    offer: { status: 'PROVIDER_ASSIGNED', windowMin: 15, since: (b) => b.assignedAt },
    open: {
      statuses: ['BOOKED', 'PROVIDER_SEARCHING'],
      start: (b) => place(b.serviceLocation),
      listPath: '/worker/work',
      // What the alert card shows, before anyone opens the job.
      summary: (b) => ({
        title: (b.pets || []).map((p) => p.snapshot?.name).filter(Boolean).join(', ') || 'Pet care',
        service: (b.categoryCode || '').replace(/_/g, ' '),
        earningPaise: b.pricing?.providerAmountPaise || 0,
        at: b.scheduledAt || b.checkInAt || null,
      }),
    },
    earning: {
      done: ['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'CLOSED'],
      at: 'execution.completedAt',
      fields: 'pricing.providerAmountPaise paymentMethod execution.completedAt',
      share: (b) => b.pricing?.providerAmountPaise || 0,
    },
    copy: {
      customer: {
        BOOKED: ['Booking placed', 'We will let you know the moment it is confirmed.'],
        PROVIDER_ACCEPTED: ['Pet pro confirmed', 'Someone has taken your booking. You will see who in the app.'],
        PROVIDER_EN_ROUTE: ['Your pet pro is on the way', 'Follow them live in the app.'],
        PROVIDER_ARRIVED: ['Your pet pro has arrived', 'They are at your door.'],
        SERVICE_STARTED: ['Service started', 'Your pet is in good hands.'],
      },
      provider: {
        PROVIDER_ASSIGNED: ['New booking for you', 'A customer chose you. Accept or decline in the app.', 'always'],
        CANCELLED: ['Booking cancelled', 'The customer cancelled this booking.'],
      },
    },
    ops: {
      terminal: ['PAYMENT_COMPLETED', 'CLOSED', 'CANCELLED', 'REFUNDED'],
      fields: 'status userId workerId shopId reference categoryCode serviceMode serviceLocation scheduledAt checkOutAt createdAt updatedAt statusHistory',
      where: (b) => place(b.serviceLocation),
      title: (b) => (b.categoryCode || 'pet care').replace(/_/g, ' '),
      waiting: ['REQUESTED', 'PRICE_PENDING', 'BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED'],
      stuck: (b, mins, now) => {
        // A stay runs until checkout; only past checkout is it overdue.
        if (['SERVICE_STARTED', 'SERVICE_PAUSED'].includes(b.status) && b.checkOutAt) {
          return now > new Date(b.checkOutAt).getTime() + 3600000 ? 'still in care after checkout' : null;
        }
        return after({ BOOKED: 30, PROVIDER_SEARCHING: 30, PROVIDER_ASSIGNED: 20, PROVIDER_ACCEPTED: 24 * 60, PROVIDER_EN_ROUTE: 60, PROVIDER_ARRIVED: 45, SERVICE_STARTED: 8 * 60, PAYMENT_PENDING: 24 * 60 }, 24 * 60)(b, mins);
      },
    },
  },

  helping: {
    label: 'helping',
    model: () => require('../helping/models/task.model').HelpingTask,
    link: (id) => `/helping/tasks/${id}`,
    providerLink: (id) => `/worker/helping/${id}`,
    line: async (t) => HELPING_LINE[t.serviceType] || null,
    trip: {
      fields: 'status userId workerId serviceType pickupLocation destination',
      travelling: ['EN_ROUTE', 'RETURNING'],
      // Shopping and pickups start at a shop and end at the customer; returns
      // and exchanges start at the customer and end at a store.
      heading: (t) => {
        const startsAtCustomer = ['return', 'exchange'].includes(t.serviceType);
        return t.status === 'EN_ROUTE'
          ? to(t.pickupLocation, startsAtCustomer)
          : to(t.destination, !startsAtCustomer) || to(t.pickupLocation, !startsAtCustomer);
      },
    },
    open: {
      statuses: ['CONFIRMED', 'WORKER_SEARCHING'],
      start: (t) => place(t.pickupLocation),
      listPath: '/worker/work',
      summary: (t) => ({
        title: t.title || ((t.items || []).length ? `${t.items.length} item${t.items.length > 1 ? 's' : ''}` : 'Errand'),
        service: t.serviceType || 'helping',
        earningPaise: t.charge?.workerEarningPaise || 0,
        at: t.scheduledAt || null,
        frontPaise: t.itemMoney?.paymentModel === 'worker_advance' ? t.itemMoney?.budgetPaise || 0 : 0,
      }),
    },
    earning: {
      done: ['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED'],
      at: 'completedAt',
      fields: 'charge.workerEarningPaise paymentMethod completedAt',
      share: (t) => t.charge?.workerEarningPaise || 0,
    },
    copy: {
      customer: {
        WORKER_ACCEPTED: ['Helper confirmed', 'Someone has taken your task. You will see who in the app.'],
        EN_ROUTE: ['Your helper is on the way', 'Follow them live in the app.'],
        ARRIVED: ['Your helper has arrived', 'They have reached the first stop.'],
        RETURNING: ['On the way back', 'Your helper is heading to the drop-off.'],
        COMPLETED: ['Task completed', 'Everything is done. Receipts and photos are in the app.'],
      },
      provider: {
        CANCELLED: ['Task cancelled', 'The customer cancelled this task.'],
      },
    },
    ops: {
      terminal: ['COMPLETED', 'CUSTOMER_CONFIRMED', 'SETTLED', 'CANCELLED', 'FAILED', 'DRAFT'],
      fields: 'status userId workerId reference serviceType title pickupLocation createdAt updatedAt statusHistory',
      where: (t) => place(t.pickupLocation),
      title: (t) => t.title || t.serviceType,
      waiting: ['REQUESTED', 'CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED', 'WORKER_DECLINED'],
      stuck: after({ REQUESTED: 10, CONFIRMED: 10, WORKER_SEARCHING: 10, WORKER_ACCEPTED: 30, EN_ROUTE: 60, ARRIVED: 60, APPROVAL_REQUIRED: 30, RETURNING: 90 }, 6 * 60),
    },
  },
};

KINDS.event = {
  label: 'event',
  model: () => require('../events/event-booking.model'),
  link: (id) => `/events/bookings/${id}`,
  providerLink: () => '/partner',
  provider: (b) => (b.partnerId ? { kind: 'event_partner', id: b.partnerId } : null),
  // Event partners are verified through their own KYC, not service-line enrolment.
  line: async () => null,
  // The decorator's team comes on the day; there is no trip to follow live.
  trip: null,
  open: null,
  copy: {
    customer: {
      partner_assigned: ['Your team is set', 'Your decorator has assigned the team for your event.'],
      in_progress: ['Decoration has started', 'The team is setting up your event now.'],
    },
    provider: {
      cancelled: ['Booking cancelled', 'The customer cancelled this event booking.'],
    },
  },
  ops: {
    terminal: ['completed', 'cancelled'],
    fields: 'status userId partnerId eventDate address createdAt updatedAt statusHistory',
    where: () => null,
    title: (b) => `Event on ${b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-IN') : '—'}`,
    waiting: ['pending_payment'],
    // Booked days ahead, so time in a status means little; a date that has passed does.
    stuck: (b, mins, now) => {
      if (b.status === 'pending_payment') return mins > 24 * 60 ? 'unpaid for over a day' : null;
      return b.eventDate && now > new Date(b.eventDate).getTime() + 12 * 3600000 ? 'event date passed, not completed' : null;
    },
  },
};

/** Who holds a job: the kind's own rule, else its worker or shop. */
function providerOf(kind, doc) {
  const k = KINDS[kind];
  if (k?.provider) return k.provider(doc);
  if (doc.shopId) return { kind: 'shop', id: doc.shopId };
  if (doc.workerId) return { kind: 'worker', id: doc.workerId };
  return null;
}

/** Entries as a list, for lookups that don't know the kind yet. */
const ALL = Object.entries(KINDS).map(([kind, k]) => ({ kind, ...k }));

/** The service line a job belongs to — the unit a provider is verified for. */
async function lineOf(kind, job) {
  return job && KINDS[kind] ? KINDS[kind].line(job) : null;
}

/** The job with this id, whichever kind it is. */
async function findJob(id, select = 'userId workerId shopId partnerId') {
  for (const k of ALL) {
    const doc = await k.model().findById(id).select(select).lean().catch(() => null);
    if (doc) return { kind: k.kind, doc };
  }
  return null;
}

module.exports = { KINDS, ALL, lineOf, findJob, providerOf, HELPING_LINE, pointOf };
