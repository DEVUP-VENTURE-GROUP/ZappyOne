const mongoose = require('mongoose');
const { SERVICE_MODES } = require('../service-modes');

/**
 * Repair booking + its immutable price snapshot + the state machine.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 * 1. THE PRICE SNAPSHOT IS IMMUTABLE (§22). Every figure the customer agreed to
 *    is copied onto the booking at creation, along with the exact pricing
 *    version ids it came from. Admin can re-price the catalog freely afterwards
 *    and historical bookings will not move. Nothing in this module ever
 *    recomputes a snapshot in place — a price change after approval must create
 *    a NEW quote (§31), which is a different record entirely.
 *
 * 2. TRANSITIONS ARE ENFORCED SERVER-SIDE (§23). `TRANSITIONS` is the whole
 *    truth about what may follow what; `canTransition`/`applyTransition` are the
 *    only sanctioned way to move a booking. A status arriving from a client is
 *    never trusted, because a worker's phone claiming "completed" is a request,
 *    not a fact.
 */

const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROVIDER_ASSIGNED',
  'WORKER_ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'DIAGNOSING',
  'QUOTE_PENDING',
  'CUSTOMER_APPROVAL_PENDING',
  'APPROVED',
  'PICKUP_SCHEDULED',
  'DEVICE_PICKED_UP',
  'AT_WORKSHOP',
  'REPAIR_IN_PROGRESS',
  'QA_PENDING',
  'READY_FOR_RETURN',
  'OUT_FOR_RETURN',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'FAILED',
  'RETURN_REQUIRED',
  'REFUND_PENDING',
  'REFUNDED',
];

/** Terminal states — nothing may follow these. */
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED'];

/**
 * Allowed forward moves. Cancellation is handled separately (see
 * CANCELLABLE_FROM) rather than being repeated on every row.
 */
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'EXPIRED', 'FAILED'],
  CONFIRMED: ['PROVIDER_ASSIGNED', 'EXPIRED', 'FAILED'],
  PROVIDER_ASSIGNED: ['WORKER_ACCEPTED', 'REJECTED', 'EXPIRED'],
  WORKER_ACCEPTED: ['ON_THE_WAY', 'PICKUP_SCHEDULED', 'FAILED'],
  ON_THE_WAY: ['ARRIVED', 'FAILED'],
  ARRIVED: ['DIAGNOSING', 'REPAIR_IN_PROGRESS', 'FAILED'],
  DIAGNOSING: ['QUOTE_PENDING', 'REPAIR_IN_PROGRESS', 'FAILED'],
  QUOTE_PENDING: ['CUSTOMER_APPROVAL_PENDING', 'FAILED'],
  CUSTOMER_APPROVAL_PENDING: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['REPAIR_IN_PROGRESS', 'PICKUP_SCHEDULED', 'FAILED'],
  PICKUP_SCHEDULED: ['DEVICE_PICKED_UP', 'FAILED', 'CANCELLED'],
  DEVICE_PICKED_UP: ['AT_WORKSHOP', 'FAILED'],
  AT_WORKSHOP: ['DIAGNOSING', 'REPAIR_IN_PROGRESS', 'FAILED'],
  REPAIR_IN_PROGRESS: ['QA_PENDING', 'QUOTE_PENDING', 'FAILED'],
  QA_PENDING: ['READY_FOR_RETURN', 'COMPLETED', 'REPAIR_IN_PROGRESS', 'FAILED'],
  READY_FOR_RETURN: ['OUT_FOR_RETURN', 'FAILED'],
  OUT_FOR_RETURN: ['COMPLETED', 'RETURN_REQUIRED', 'FAILED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: ['REFUND_PENDING'],
  EXPIRED: [],
  FAILED: ['REFUND_PENDING'],
  RETURN_REQUIRED: ['OUT_FOR_RETURN', 'REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED', 'FAILED'],
  REFUNDED: [],
};

/** States a customer/admin cancellation may still interrupt. */
const CANCELLABLE_FROM = [
  'PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED',
  'ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'QUOTE_PENDING',
  'CUSTOMER_APPROVAL_PENDING', 'PICKUP_SCHEDULED',
];

/**
 * Frozen at booking creation. Every component is stored even when zero, so an
 * invoice can be reconstructed years later without consulting current config.
 */
const priceSnapshotSchema = new mongoose.Schema(
  {
    partPaise: { type: Number, default: 0, min: 0 },
    labourPaise: { type: Number, default: 0, min: 0 },
    consumablesPaise: { type: Number, default: 0, min: 0 },
    travelPaise: { type: Number, default: 0, min: 0 },
    pickupPaise: { type: Number, default: 0, min: 0 },
    returnPaise: { type: Number, default: 0, min: 0 },
    diagnosisFeePaise: { type: Number, default: 0, min: 0 },
    /** Inspection fee already paid, deducted from a subsequent repair bill. */
    inspectionCreditPaise: { type: Number, default: 0, min: 0 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },
    commissionPaise: { type: Number, default: 0, min: 0 },

    subtotalPaise: { type: Number, required: true, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    /** Exactly which price rows produced these numbers. */
    providerPricingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderPricing', default: null },
    providerPricingVersion: { type: Number, default: null },
    referencePricingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ZappyReferencePricing', default: null },
    referencePricingVersion: { type: Number, default: null },

    /** How the number was arrived at, for support and dispute handling. */
    resolutionPath: { type: String, default: '' },
    pricingMode: { type: String, enum: ['fixed', 'range', 'diagnosis_required'], default: 'fixed' },
    isEstimate: { type: Boolean, default: false },
    /** Kilometres between provider and customer, when that shaped the price. */
    distanceKm: { type: Number, default: null },
    rangeMinPaise: { type: Number, default: null },
    rangeMaxPaise: { type: Number, default: null },

    warrantyDays: { type: Number, default: 0, min: 0 },
    snapshotAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * An add-on bought alongside the primary repair, frozen at booking time.
 *
 * Same immutability rule as the price snapshot: a provider re-pricing
 * disinfection tomorrow must not change what this customer agreed to today.
 * The money lives here per line so a refund or a part-cancellation can name
 * exactly which piece of work it is reversing.
 */
const addOnSnapshotSchema = new mongoose.Schema(
  {
    repairCode: { type: String, required: true, lowercase: true },
    name: { type: String, default: '' },
    qualityCode: { type: String, default: null, lowercase: true },
    /** The provider's price for this line — all-inclusive, like every price. */
    totalPaise: { type: Number, required: true, min: 0 },
    /** Zappy's cut of this line, so settlement never re-derives it. */
    commissionPaise: { type: Number, default: 0, min: 0 },
    estimatedDurationMin: { type: Number, default: 0, min: 0 },
    warrantyDays: { type: Number, default: 0, min: 0 },
    /** False when no provider price existed and a reference band was used. */
    fromProvider: { type: Boolean, default: false },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    actorRole: { type: String, enum: ['customer', 'worker', 'shop', 'admin', 'system'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const repairBookingSchema = new mongoose.Schema(
  {
    /** Human-readable reference shown to customer and worker. */
    reference: { type: String, required: true, unique: true, uppercase: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /* ── What is being repaired ── */
    brandCode: { type: String, required: true, lowercase: true, index: true },
    modelCode: { type: String, required: true, lowercase: true, index: true },
    modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceModel', default: null },
    variantLabel: { type: String, default: '' },

    /**
     * Which engine or powertrain this particular vehicle has.
     *
     * Snapshotted on the booking because it changes what the technician must
     * bring. The customer answers it in the flow, and without it here the
     * answer was simply thrown away: a job on a CNG Nexon and a job on a petrol
     * Nexon arrived identical, and whoever took it found out on the driveway.
     *
     * Empty for verticals that do not distinguish powertrains.
     */
    fuelType: { type: String, default: '', lowercase: true, index: true },

    /**
     * Exact build, for verticals where the model name alone does not decide
     * which parts fit — two units of one laptop model take different panels.
     * Null for mobile, which identifies fine at model level.
     *
     * The label is SNAPSHOT text rather than a join, so renaming or archiving
     * a configuration later cannot rewrite what the customer was told.
     */
    configurationCode: { type: String, default: null, lowercase: true, index: true },
    configurationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeviceConfiguration', default: null },
    configurationLabel: { type: String, default: '' },

    problemCodes: { type: [String], default: [], index: true },
    diagnosticFlowCode: { type: String, default: null },
    diagnosticAnswers: { type: mongoose.Schema.Types.Mixed, default: null },
    diagnosisSummary: { type: String, default: '' },

    repairCode: { type: String, default: null, lowercase: true, index: true },
    qualityCode: { type: String, default: null, lowercase: true },
    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },

    /**
     * Extra services bought with the primary repair. Empty on every booking
     * that predates add-ons, and on every vertical that does not use them —
     * the totals in `priceSnapshot` already include these lines.
     */
    addOns: { type: [addOnSnapshotSchema], default: [] },

    serviceMode: {
      type: String,
      enum: SERVICE_MODES,
      required: true,
      index: true,
    },

    /* ── Who is doing it ── */
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    /** True when the provider came from Zappy's ranking rather than customer choice. */
    zappyRecommended: { type: Boolean, default: false },

    /* ── Where and when ── */
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: { type: String, required: true },
      landmark: { type: String, default: '' },
      flatNumber: { type: String, default: '' },
      cityCode: { type: String, default: null, lowercase: true, index: true },
      pincode: { type: String, default: '' },
    },
    scheduledAt: { type: Date, default: null, index: true },
    slotLabel: { type: String, default: '' },

    /* ── Money ── */
    priceSnapshot: { type: priceSnapshotSchema, required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentIntent', default: null },
    /**
     * How this repair gets paid for.
     *
     * Cash is the default because it is how most repair work in India actually
     * settles: the technician finishes, the customer pays them, and the
     * platform is owed its commission afterwards. Online reverses that — the
     * platform holds the money and pays the provider out — so the two are
     * settled in opposite directions (see settlement.service).
     */
    paymentMethod: { type: String, enum: ['cash', 'online'], default: 'cash', index: true },

    /** Who took the cash, and when. Recorded for disputes, not decoration. */
    cashCollectedAt: { type: Date, default: null },
    cashCollectedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partial_refund'],
      default: 'unpaid',
      index: true,
    },

    /**
     * Handover codes. A repair moves an expensive device between hands.
     *
     * An order has ONE moment worth proving — the worker started the job. A
     * repair has up to three, because the device physically changes custody:
     *
     *   start    — work begins at the customer's place (doorstep)
     *   handover — the customer gives the device up (pickup)
     *   return   — the device is handed back to its owner
     *
     * Without these, "collected" and "returned" are a technician tapping a
     * button, and a dispute over a device that never came back has nothing on
     * either side. `select: false` so a code is never served with the booking —
     * the customer is told it, the technician has to be given it.
     */
    otp: {
      start: { type: String, select: false },
      handover: { type: String, select: false },
      return: { type: String, select: false },
    },

    /** When each code was accepted, and by whom. Evidence, not decoration. */
    otpVerified: {
      startAt: { type: Date, default: null },
      handoverAt: { type: Date, default: null },
      returnAt: { type: Date, default: null },
    },

    /** Proof of the finished work, shown to the customer on completion. */
    completionPhotos: { type: [String], default: [] },

    /* ── After the job ── */
    rating: { type: Number, min: 1, max: 5, default: null },
    ratingComment: { type: String, default: '', maxlength: 1000 },
    /** Set once. A rating that can be rewritten is not a rating. */
    ratedAt: { type: Date, default: null },

    /** The quote currently governing the price, once diagnosis has happened. */
    activeQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairQuote', default: null },


    /* ── Timing ── */

    /**
     * When the CURRENT stage is due.
     *
     * Held on the booking rather than recomputed, so the watchdog can find late
     * jobs with an index instead of walking every open booking and doing date
     * arithmetic on each one.
     */
    stageDeadlineAt: { type: Date, default: null, index: true },

    /**
     * The clock stops while we are waiting on the customer.
     *
     * A provider who has asked a question and is waiting for an answer is not
     * late — penalising them for the customer's thinking time is how you teach
     * technicians to stop asking and start guessing.
     */
    slaPausedAt: { type: Date, default: null },
    slaPausedMs: { type: Number, default: 0 },

    /** Stages that ran over, kept for operations rather than for blame. */
    slaBreaches: {
      type: [{
        _id: false,
        stage: { type: String },
        dueAt: { type: Date },
        minutesLate: { type: Number },
        at: { type: Date, default: Date.now },
      }],
      default: [],
    },

    /* ── Lifecycle ── */
    status: { type: String, enum: BOOKING_STATUSES, default: 'PENDING', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    /**
     * Providers who passed on this job.
     *
     * Kept so dispatch does not re-offer it to the same person, and so a
     * pattern of declines is visible — a provider who passes on everything
     * is a different problem from one who is simply busy.
     */
    declines: {
      type: [{
        _id: false,
        providerKind: { type: String, enum: ['shop', 'worker'] },
        providerId: { type: mongoose.Schema.Types.ObjectId },
        reason: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      }],
      default: [],
    },

    warrantyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warranty', default: null },
    cancelReason: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null, index: true },

    /** Guards against duplicate submissions of the same booking (§46). */
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true },
);

repairBookingSchema.index({ location: '2dsphere' });
repairBookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
repairBookingSchema.index({ workerId: 1, status: 1 });
repairBookingSchema.index({ shopId: 1, status: 1 });
repairBookingSchema.index({ status: 1, createdAt: -1 });
repairBookingSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

/** Is `next` a legal move from the current status? Cancellation is special-cased. */
repairBookingSchema.methods.canTransition = function canTransition(next) {
  if (!BOOKING_STATUSES.includes(next)) return false;
  if (TERMINAL_STATUSES.includes(this.status)) return false;
  if (next === 'CANCELLED') return CANCELLABLE_FROM.includes(this.status);
  return (TRANSITIONS[this.status] || []).includes(next);
};

/**
 * The only sanctioned way to change status. Returns false rather than throwing
 * so callers can turn an illegal move into a 409 without exception plumbing.
 */
repairBookingSchema.methods.applyTransition = function applyTransition(next, { actorRole = 'system', actorId = null, reason = '', meta = null } = {}) {
  if (!this.canTransition(next)) return false;
  this.status = next;
  this.statusHistory.push({ status: next, at: new Date(), actorRole, actorId, reason, meta });
  if (next === 'COMPLETED') this.completedAt = new Date();
  if (next === 'CANCELLED') {
    this.cancelledAt = new Date();
    if (reason) this.cancelReason = reason;
  }
  return true;
};

const RepairBooking = mongoose.model('RepairBooking', repairBookingSchema);

module.exports = {
  RepairBooking,
  BOOKING_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  CANCELLABLE_FROM,
};
