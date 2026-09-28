/**
 * The single source of truth for "what has been booked", across every engine
 * this platform runs.
 *
 * WHY THIS FILE EXISTS. The old admin panel reads only `Order` — the legacy
 * engine. Three real, live engines were built on top of it this cycle
 * (RepairBooking for 5 verticals, HelpingTask, PetBooking), each with its own
 * collection and its own shape, and NOTHING in admin was ever told they exist.
 * The result on the actual dev database: 3 legacy orders show up, 7 real
 * repair bookings do not. Every dashboard, every revenue figure, every
 * "N bookings today" is currently undercounting reality, and it gets worse
 * with every real customer.
 *
 * THE FIX IS ONE NORMALISER, NOT EIGHT PATCHES. Every admin-portal controller
 * that needs "all bookings" — overview, orders list, intervention, BI,
 * heatmap, retention — reads THIS, not the four collections directly. A fifth
 * vertical, or a sixth engine, needs one block added here and every dashboard
 * is correct again automatically.
 *
 * THE UNIFIED SHAPE, and why each field is there:
 *
 *   source          — which engine this came from; never hidden, because a
 *                      support agent resolving a dispute needs to know which
 *                      collection actually holds the record to act on it.
 *   totalPaise / commissionPaise / providerEarningPaise
 *                  — always paise, always comparable. Order carries a
 *                     side-by-side rupee `total` for legacy screens; every
 *                     other engine is paise-only, so paise is the common
 *                     currency here, not the exception.
 *   statusBucket    — a five-value ('active'|'completed'|'cancelled'|
 *                     'disputed'|'other') bucket every engine's very different
 *                     state machine maps onto, so cross-engine filtering and
 *                     counting does not need to know all ~45 raw status
 *                     strings across four state machines.
 *   itemMoneyPaise  — Helping Services' pass-through item cost. Carried
 *                     SEPARATELY and never folded into totalPaise or any
 *                     revenue sum — it is the customer's own money moving
 *                     through a helper's hands, not platform revenue, and
 *                     mixing it in would inflate GMV with money that was
 *                     never ours (see helping/models/task.model.js).
 *
 * WHAT THIS FILE DOES NOT DO: decide what counts as "revenue" for a P&L, or
 * how a dashboard buckets time. It hands back clean rows; aggregation
 * decisions belong to the controller that has that context.
 */

const mongoose = require('mongoose');
// Order is the platform's one default-exported model — every newer engine
// exports a named object instead, which is why this line looks different
// from the three below it.
const Order = require('../order/order.model');
const { RepairBooking } = require('../repair/models/booking.model');
const { HelpingTask } = require('../helping/models/task.model');
const { PetBooking } = require('../pet/models/booking.model');

const SOURCES = ['order', 'repair', 'helping', 'pet'];

/** Every raw status string across four state machines, bucketed once. */
const STATUS_BUCKET = {
  // Legacy Order
  created: 'active', searching: 'active', assigned: 'active', on_the_way: 'active',
  arrived: 'active', in_progress: 'active',
  completed: 'completed',
  cancelled: 'cancelled', failed: 'cancelled',

  // RepairBooking
  PENDING: 'active', CONFIRMED: 'active', PROVIDER_ASSIGNED: 'active', WORKER_ACCEPTED: 'active',
  ON_THE_WAY: 'active', ARRIVED: 'active', DIAGNOSING: 'active', QUOTE_PENDING: 'active',
  CUSTOMER_APPROVAL_PENDING: 'active', APPROVED: 'active', PICKUP_SCHEDULED: 'active',
  DEVICE_PICKED_UP: 'active', AT_WORKSHOP: 'active', REPAIR_IN_PROGRESS: 'active',
  QA_PENDING: 'active', READY_FOR_RETURN: 'active', OUT_FOR_RETURN: 'active',
  COMPLETED: 'completed', CANCELLED: 'cancelled', DISPUTED: 'disputed',

  // HelpingTask (shares several names with PetBooking; identical bucket either way)
  DRAFT: 'other', REQUESTED: 'active', PAYMENT_PENDING: 'active', BOOKED: 'active',
  WORKER_SEARCHING: 'active', WORKER_ASSIGNED: 'active', WORKER_ACCEPTED: 'active',
  EN_ROUTE: 'active', WORKER_EN_ROUTE: 'active', WORKER_ARRIVED: 'active',
  TASK_STARTED: 'active', IN_PROGRESS: 'active', APPROVAL_REQUIRED: 'active',
  RETURNING: 'active', AT_DROPOFF: 'active', HANDED_OVER: 'active',
  ITEM_UNAVAILABLE: 'other', MERCHANT_REJECTED: 'other', EXCHANGE_UNAVAILABLE: 'other',
  WORKER_DECLINED: 'other', FAILED: 'cancelled', REFUNDED: 'cancelled',
  PAYMENT_COMPLETED: 'completed', CUSTOMER_CONFIRMED: 'completed', SETTLED: 'completed',
  CLOSED: 'completed',

  // PetBooking-specific
  PRICE_PENDING: 'active', AWAITING_CUSTOMER_APPROVAL: 'active', PROVIDER_SEARCHING: 'active',
  PROVIDER_ACCEPTED: 'active', PROVIDER_EN_ROUTE: 'active', PROVIDER_ARRIVED: 'active',
  PET_HANDOVER: 'active', SERVICE_STARTED: 'active', SERVICE_PAUSED: 'active',
  SERVICE_COMPLETED: 'completed', CUSTOMER_CONFIRMATION: 'active',
};

function bucketFor(status) {
  return STATUS_BUCKET[status] || 'other';
}

/** Human labels for what was actually booked, per source. */
const VERTICAL_LABEL = {
  mobile: 'Mobile Repair', laptop: 'Laptop Repair', two_wheeler: '2-Wheeler Repair',
  four_wheeler: '4-Wheeler Repair', water_tank_care: 'Water & Tank Care',
};
const HELPING_LABEL = {
  shopping: 'Shopping & Pickup', pickup: 'Pickup', return: 'Returns & Exchange', exchange: 'Exchange',
};
const PET_LABEL = {
  pet_grooming: 'Pet Grooming', pet_boarding: 'Pet Boarding & Daycare', pet_walk: 'Pet Walk & Activity',
  pet_home_care: 'Pet Home Care', pet_transport: 'Pet Pickup & Assistance',
  pet_vet_assist: 'Vet & Appointment Assistance', pet_check: 'Pet Check & Home Visit',
};

function normaliseOrder(o) {
  return {
    _id: o._id, source: 'order', reference: `ORD-${String(o._id).slice(-6).toUpperCase()}`,
    userId: o.userId, workerId: o.workerId || null, shopId: null,
    vertical: o.service || 'legacy', serviceName: o.service || 'Legacy service',
    status: o.status, statusBucket: bucketFor(o.status),
    totalPaise: o.pricing?.totalPaise ?? Math.round((o.pricing?.total || 0) * 100),
    subtotalPaise: Math.round((o.pricing?.subtotal || o.pricing?.total || 0) * 100),
    commissionPaise: o.earnings?.platformPaise ?? null,
    providerEarningPaise: o.earnings?.workerPaise ?? null,
    itemMoneyPaise: 0,
    paymentMethod: o.payment?.method || null, paymentStatus: o.payment?.status || null,
    createdAt: o.createdAt, completedAt: o.completedAt || null, scheduledAt: o.scheduledAt || null,
  };
}

function normaliseRepair(b) {
  return {
    _id: b._id, source: 'repair', reference: b.reference,
    userId: b.userId, workerId: b.workerId || null, shopId: b.shopId || null,
    vertical: b.vertical, serviceName: VERTICAL_LABEL[b.vertical] || b.vertical,
    status: b.status, statusBucket: bucketFor(b.status),
    totalPaise: b.priceSnapshot?.totalPaise || 0,
    subtotalPaise: b.priceSnapshot?.subtotalPaise || 0,
    commissionPaise: b.priceSnapshot?.commissionPaise ?? null,
    providerEarningPaise: b.priceSnapshot
      ? (b.priceSnapshot.totalPaise || 0) - (b.priceSnapshot.taxPaise || 0)
        - (b.priceSnapshot.platformFeePaise || 0) - (b.priceSnapshot.commissionPaise || 0)
      : null,
    itemMoneyPaise: 0,
    paymentMethod: b.paymentMethod || null, paymentStatus: b.paymentStatus || null,
    createdAt: b.createdAt, completedAt: b.completedAt || null, scheduledAt: b.scheduledAt || null,
  };
}

function normaliseHelping(t) {
  return {
    _id: t._id, source: 'helping', reference: t.reference,
    userId: t.userId, workerId: t.workerId || null, shopId: null,
    vertical: t.serviceType, serviceName: HELPING_LABEL[t.serviceType] || t.serviceType,
    status: t.status, statusBucket: bucketFor(t.status),
    // Service charge only — item money is the customer's own, never revenue.
    totalPaise: t.charge?.serviceChargePaise || 0,
    subtotalPaise: t.charge?.serviceChargePaise || 0,
    commissionPaise: t.charge?.commissionPaise ?? null,
    providerEarningPaise: t.charge?.workerEarningPaise ?? null,
    itemMoneyPaise: t.itemMoney?.actualPaise || 0,
    paymentMethod: t.paymentMethod || null, paymentStatus: bucketFor(t.status) === 'completed' ? 'paid' : null,
    createdAt: t.createdAt, completedAt: t.execution?.completedAt || null, scheduledAt: t.scheduledAt || null,
  };
}

function normalisePet(b) {
  return {
    _id: b._id, source: 'pet', reference: b.reference,
    userId: b.userId, workerId: b.workerId || null, shopId: b.shopId || null,
    vertical: b.categoryCode, serviceName: PET_LABEL[b.categoryCode] || b.categoryCode,
    status: b.status, statusBucket: bucketFor(b.status),
    totalPaise: b.pricing?.totalPaise || 0,
    subtotalPaise: b.pricing?.subtotalPaise || 0,
    commissionPaise: b.pricing?.commissionPaise ?? null,
    providerEarningPaise: b.pricing?.providerAmountPaise ?? null,
    itemMoneyPaise: 0,
    paymentMethod: b.paymentMethod || null, paymentStatus: b.paymentStatus || null,
    createdAt: b.createdAt, completedAt: b.execution?.completedAt || null, scheduledAt: b.scheduledAt || null,
  };
}

const NORMALISERS = { order: normaliseOrder, repair: normaliseRepair, helping: normaliseHelping, pet: normalisePet };
const MODELS = { order: Order, repair: RepairBooking, helping: HelpingTask, pet: PetBooking };

/**
 * Every date/status/vertical filter a caller might reasonably want, kept in
 * one place so "filter by date range" cannot drift between controllers.
 */
function applyCommonFilters(query, { from, to, statusBucket } = {}, dateField = 'createdAt') {
  if (from || to) {
    query[dateField] = {};
    if (from) query[dateField].$gte = new Date(from);
    if (to) query[dateField].$lte = new Date(to);
  }
  return query;
}

/**
 * Pull, normalise and merge bookings from every engine, newest first.
 *
 * Pagination happens AFTER the merge, on the normalised array — the four
 * source collections are each capped at a generous per-source limit first
 * (`perSourceLimit`) so this never full-scans a large collection just to
 * throw most of it away. For an admin list screen sorted by recency, capping
 * each source and re-sorting the union is the same result a single unified
 * collection would give, at a fraction of the cost of a live `$unionWith`
 * aggregation across four differently-indexed collections.
 */
/** Raw statuses belonging to a bucket — so the bucket filter runs in the database, before any cap. */
const statusesIn = (bucket) => Object.keys(STATUS_BUCKET).filter((s) => STATUS_BUCKET[s] === bucket);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function listBookings({
  sources = SOURCES, from, to, statusBucket, userId, userIds, workerId, shopId, reference,
  page = 1, limit = 25, perSourceLimit = 500,
} = {}) {
  const wanted = sources.filter((s) => SOURCES.includes(s));

  const results = await Promise.all(wanted.map(async (source) => {
    const Model = MODELS[source];
    const filter = applyCommonFilters({}, { from, to }, 'createdAt');
    if (statusBucket) filter.status = { $in: statusesIn(statusBucket) };
    if (userId) filter.userId = new mongoose.Types.ObjectId(userId);
    if (userIds) filter.userId = { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) };
    if (workerId) filter.workerId = new mongoose.Types.ObjectId(workerId);
    if (shopId && source !== 'order' && source !== 'helping') filter.shopId = new mongoose.Types.ObjectId(shopId);
    if (reference) {
      // Orders have no reference field; their shown reference is the id's tail.
      if (source === 'order') {
        if (!/^[0-9a-f]{24}$/i.test(reference)) return [];
        filter._id = new mongoose.Types.ObjectId(reference);
      } else {
        filter.reference = new RegExp(`^${escapeRe(reference)}`, 'i');
      }
    }

    const rows = await Model.find(filter).sort({ createdAt: -1 }).limit(perSourceLimit).lean();
    return rows.map(NORMALISERS[source]);
  }));

  const merged = results.flat();
  merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = merged.length;
  const start = (page - 1) * limit;
  return { rows: merged.slice(start, start + limit), total, page: Number(page), limit };
}

/**
 * One booking, wherever it lives — for detail screens and ops actions that
 * need the FULL native document, not the normalised summary row.
 */
async function findBookingBySource(source, id) {
  const Model = MODELS[source];
  if (!Model) return null;
  return Model.findById(id).lean();
}

/**
 * Aggregate totals across every engine for a window — the number Overview,
 * Analytics and BusinessIntelligence all actually want, computed once.
 *
 * Commission and GMV are summed only from COMPLETED bookings — an active or
 * cancelled booking has not earned anything yet, and counting it would
 * overstate revenue on any day with bookings still in flight.
 */
async function aggregateTotals({ from, to } = {}) {
  const { rows } = await listBookings({ from, to, limit: Number.MAX_SAFE_INTEGER, perSourceLimit: 100000 });

  const completed = rows.filter((r) => r.statusBucket === 'completed');
  const bySource = {};
  for (const s of SOURCES) {
    const own = rows.filter((r) => r.source === s);
    const ownCompleted = own.filter((r) => r.statusBucket === 'completed');
    bySource[s] = {
      total: own.length,
      completed: ownCompleted.length,
      cancelled: own.filter((r) => r.statusBucket === 'cancelled').length,
      gmvPaise: ownCompleted.reduce((sum, r) => sum + (r.totalPaise || 0), 0),
      commissionPaise: ownCompleted.reduce((sum, r) => sum + (r.commissionPaise || 0), 0),
    };
  }

  return {
    totalBookings: rows.length,
    completedBookings: completed.length,
    cancelledBookings: rows.filter((r) => r.statusBucket === 'cancelled').length,
    activeBookings: rows.filter((r) => r.statusBucket === 'active').length,
    gmvPaise: completed.reduce((sum, r) => sum + (r.totalPaise || 0), 0),
    commissionPaise: completed.reduce((sum, r) => sum + (r.commissionPaise || 0), 0),
    bySource,
  };
}

module.exports = {
  SOURCES, VERTICAL_LABEL, HELPING_LABEL, PET_LABEL, NORMALISERS,
  bucketFor, listBookings, findBookingBySource, aggregateTotals,
};
