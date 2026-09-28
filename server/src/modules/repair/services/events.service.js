const { redis } = require('../../../config/redis');
const logger = require('../../../core/logger');

/**
 * Booking events: notifications + real-time fan-out (§24, §43).
 *
 * Every emission here is BEST EFFORT and never throws into the caller. A failed
 * push must not roll back a completed repair — the booking is the source of
 * truth, notifications are a projection of it. Callers therefore do not await
 * failures, and each path is individually guarded.
 *
 * Copy for a new vertical: only EVENT_COPY changes. The routing (who hears
 * what, over which channel) is vertical-agnostic on purpose.
 */

/**
 * Per-status copy and audience. `audience` decides who is told, so adding a
 * status means adding one row here rather than editing three call sites.
 */
const EVENT_COPY = {
  CONFIRMED: {
    customer: { title: 'Repair booking confirmed', body: 'We are finding a technician for you.' },
  },
  PROVIDER_ASSIGNED: {
    customer: { title: 'Technician assigned', body: 'We have found a technician for your repair.' },
    provider: { title: 'New repair job', body: 'A repair has been assigned to you.' },
  },
  WORKER_ACCEPTED: {
    customer: { title: 'Technician accepted', body: 'Your technician has accepted the job.' },
  },
  ON_THE_WAY: {
    customer: { title: '🛵 Technician on the way', body: 'Your technician has started the trip.' },
  },
  ARRIVED: {
    customer: { title: 'Technician arrived', body: 'Your technician is at your location.' },
  },
  DIAGNOSING: {
    customer: { title: 'Diagnosis started', body: 'Your device is being inspected.' },
  },
  CUSTOMER_APPROVAL_PENDING: {
    customer: { title: '📋 Quote ready — your approval needed', body: 'Review the quote to let work begin.' },
  },
  APPROVED: {
    provider: { title: 'Quote approved', body: 'The customer approved your quote — you can start work.' },
  },
  PICKUP_SCHEDULED: {
    customer: { title: 'Pickup scheduled', body: 'We will collect your device shortly.' },
  },
  DEVICE_PICKED_UP: {
    customer: { title: 'Device collected', body: 'Your device is on its way to the workshop.' },
  },
  AT_WORKSHOP: {
    customer: { title: 'Device at workshop', body: 'Your device has reached the workshop.' },
  },
  REPAIR_IN_PROGRESS: {
    customer: { title: '🔧 Repair started', body: 'Work on your device is underway.' },
  },
  QA_PENDING: {
    customer: { title: 'Quality checks', body: 'Running post-repair tests on your device.' },
  },
  READY_FOR_RETURN: {
    customer: { title: 'Repair complete', body: 'Your device is repaired and ready to come back.' },
  },
  OUT_FOR_RETURN: {
    customer: { title: 'Out for delivery', body: 'Your device is on its way back to you.' },
  },
  COMPLETED: {
    customer: { title: '✅ Repair completed', body: 'Your repair is finished. Warranty details are in the app.' },
    provider: { title: 'Job completed', body: 'Nice work — this job is now closed.' },
  },
  CANCELLED: {
    customer: { title: 'Booking cancelled', body: 'Your repair booking was cancelled.' },
    provider: { title: 'Job cancelled', body: 'This repair booking was cancelled.' },
  },
  REJECTED: {
    provider: { title: 'Quote declined', body: 'The customer declined the quote.' },
  },
};

/** Push a payload into the order room so open clients update instantly. */
function emitToRoom(bookingId, event, payload) {
  redis
    .publish('order:event', JSON.stringify({ orderId: String(bookingId), event, payload }))
    .catch((err) => logger.warn({ err: err.message, bookingId, event }, '[repair] realtime publish failed'));
}

/**
 * Direct socket nudge to one provider, for things that are not room-scoped.
 *
 * Published on the `provider:repair` channel, which the socket gateway
 * subscribes to and fans out to that provider's room. Publishing on the event
 * name itself — as this used to — meant the gateway never heard it, so every
 * repair nudge to a provider was silently dropped.
 */
function emitToProvider(kind, id, event, payload) {
  if (!id) return;
  redis
    .publish('provider:repair', JSON.stringify({ kind, id: String(id), event, payload }))
    .catch((err) => logger.warn({ err: err.message, id, event }, '[repair] provider publish failed'));
}

const emitToWorker = (workerId, event, payload) => emitToProvider('worker', workerId, event, payload);
const emitToShop = (shopId, event, payload) => emitToProvider('shop', shopId, event, payload);

/** Persisted + pushed notification. Never rejects into the caller. */
async function notify({ kind, id, type, title, body, deepLink, data }) {
  if (!id) return;
  try {
    const notificationService = require('../../notification/notification.service');
    await notificationService.notify({
      recipient: { kind, id },
      type,
      title,
      body,
      deepLink,
      data: data || {},
    });
  } catch (err) {
    logger.warn({ err: err.message, kind, id, type }, '[repair] notification failed');
  }
}


/**
 * How long a provider has to take a repair before it goes to someone else.
 *
 * This is an exclusive assignment — the job is given to them, not auctioned to
 * whoever taps first — so the window is a working person's, not a ride-hail
 * ping. A technician mid-repair can finish what is in their hands, look at the
 * job, and answer. The real value comes from the vertical's SLA config; this
 * constant is only the fallback when none is set.
 */
const OFFER_WINDOW_SEC = 10 * 60;

/**
 * Ring a provider about a job waiting for them.
 *
 * A notification alone loses jobs — a technician with a phone in their pocket
 * does not see a silent banner. This carries everything the alert screen needs
 * to be decided on without opening anything else: what the device is, what is
 * wrong, what it pays, how far away, and where.
 */
function announceOffer(booking) {
  if (!booking.workerId && !booking.shopId) return;

  // The alert counts down to the same moment the watchdog acts on, so the
  // provider's screen and the server never disagree about how long is left.
  const expiresAt = booking.stageDeadlineAt
    ? new Date(booking.stageDeadlineAt).toISOString()
    : new Date(Date.now() + OFFER_WINDOW_SEC * 1000).toISOString();

  const payload = {
    bookingId: String(booking._id),
    reference: booking.reference,
    device: [booking.brandCode, booking.modelCode].filter(Boolean).join(' '),
    problemCodes: booking.problemCodes || [],
    repairCode: booking.repairCode || null,
    serviceMode: booking.serviceMode,
    totalPaise: booking.priceSnapshot?.totalPaise || 0,
    isEstimate: !!booking.priceSnapshot?.isEstimate,
    paymentMethod: booking.paymentMethod,
    address: booking.location?.address || '',
    landmark: booking.location?.landmark || '',
    coordinates: booking.location?.coordinates || null,
    scheduledAt: booking.scheduledAt || null,
    slotLabel: booking.slotLabel || '',
    expiresAt,
    // How long the whole window is, so the alert can draw a countdown that is
    // actually to scale. Without it the client has to guess, and it guessed 90
    // seconds — leaving the bar pinned full for the first eight minutes.
    windowSec: OFFER_WINDOW_SEC,
  };

  if (booking.workerId) emitToWorker(booking.workerId, 'repair.offer', payload);
  if (booking.shopId) emitToShop(booking.shopId, 'repair.offer', payload);
}

/** The job is no longer available — pull the alert off their screen. */
function announceOfferClosed(booking, reason = 'taken') {
  const payload = { bookingId: String(booking._id), reason };
  if (booking.workerId) emitToWorker(booking.workerId, 'repair.offer_closed', payload);
  if (booking.shopId) emitToShop(booking.shopId, 'repair.offer_closed', payload);
}

/**
 * Announce a status change to everyone entitled to hear it.
 *
 * Real-time goes out first because it is what a watching screen reacts to;
 * the persisted notification follows for anyone not currently looking.
 */
async function announceTransition(booking, status) {
  if (status === 'PROVIDER_ASSIGNED') announceOffer(booking);
  if (['WORKER_ACCEPTED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status)) {
    announceOfferClosed(booking, status.toLowerCase());
  }

  emitToRoom(booking._id, 'repair.status', {
    status,
    reference: booking.reference,
    at: new Date().toISOString(),
  });

  const copy = EVENT_COPY[status];
  if (!copy) return;

  const providerId = booking.workerId || booking.shopId;
  const providerKind = booking.workerId ? 'worker' : 'shop';

  if (copy.customer) {
    await notify({
      kind: 'user',
      id: booking.userId,
      type: 'system_alert',
      title: copy.customer.title,
      body: copy.customer.body,
      deepLink: `/repair/bookings/${booking._id}`,
      data: { bookingId: String(booking._id), status, reference: booking.reference },
    });
  }

  if (copy.provider && providerId) {
    await notify({
      kind: providerKind,
      id: providerId,
      type: 'system_alert',
      title: copy.provider.title,
      body: copy.provider.body,
      deepLink: `/worker/repair/${booking._id}`,
      data: { bookingId: String(booking._id), status },
    });
    emitToProvider(providerKind, providerId, 'repair.update', {
      bookingId: String(booking._id), status,
    });
  }
}

/** A quote was raised — the customer must act, so this is always pushed. */
async function announceQuote(booking, quote) {
  emitToRoom(booking._id, 'repair.quote', {
    quoteId: String(quote._id),
    revision: quote.revision,
    totalPaise: quote.totalPaise,
  });

  await notify({
    kind: 'user',
    id: booking.userId,
    type: 'system_alert',
    title: quote.revision > 1 ? '📋 Updated quote needs your approval' : '📋 Quote ready — your approval needed',
    body: `₹${Math.round(quote.totalPaise / 100).toLocaleString('en-IN')} — review and approve to let work begin.`,
    deepLink: `/repair/bookings/${booking._id}`,
    data: { bookingId: String(booking._id), quoteId: String(quote._id), revision: String(quote.revision) },
  });
}

/** Customer decided on a quote — the provider is waiting on exactly this. */
async function announceQuoteDecision(booking, quote, decision) {
  emitToRoom(booking._id, 'repair.quote_decision', {
    quoteId: String(quote._id), decision,
  });

  const providerId = booking.workerId || booking.shopId;
  if (!providerId) return;

  const copy = {
    approve: { title: '✅ Quote approved', body: 'The customer approved your quote — you can start work.' },
    reject: { title: 'Quote declined', body: 'The customer declined the quote. Do not proceed.' },
    clarify: { title: 'Customer has a question', body: quote.clarificationNote || 'They asked something about your quote.' },
  }[decision];
  if (!copy) return;

  await notify({
    kind: booking.workerId ? 'worker' : 'shop',
    id: providerId,
    type: 'system_alert',
    title: copy.title,
    body: copy.body,
    deepLink: `/worker/repair/${booking._id}`,
    data: { bookingId: String(booking._id), decision },
  });
  emitToWorker(booking.workerId, 'worker:repair_update', {
    bookingId: String(booking._id), quoteDecision: decision,
  });
}

module.exports = {
  announceTransition, announceQuote, announceQuoteDecision, announceOffer, announceOfferClosed,
  emitToRoom, emitToProvider, notify, OFFER_WINDOW_SEC, EVENT_COPY,
};
