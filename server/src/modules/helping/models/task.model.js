/**
 * A Helping Services task — a human errand, tracked and proven.
 *
 * THE ONE RULE THIS MODEL EXISTS TO ENFORCE (§7, §32, §52): the money a helper
 * spends in a shop is the CUSTOMER'S money moving through them. It is not
 * revenue, not earnings, and not commissionable. So the service charge and the
 * item money are two separate sets of fields here — `charge.*` and `items.*` —
 * and they are never summed into one figure except at the very last step, for
 * display. A schema that stored one `total` would make the mistake inevitable.
 *
 * WHY NOT REUSE RepairBooking OR Order. A repair booking is a device with a
 * fault; an order is a service at a price. This is neither: it is a list of
 * things to buy or carry, each with its own budget, availability, approval and
 * receipt. Item-level state is the whole product (§14, §46) and cannot be
 * expressed as a field on either of those. Everything AROUND the task —
 * worker, wallet, notifications, media, tracking — is reused untouched.
 *
 * WHAT IS DELIBERATELY NOT PROMISED. For returns and exchanges, ZappyOne moves
 * the parcel and proves it moved. It does not decide whether the merchant
 * accepts it (§30, §60). `refundStatus` therefore has no "completed" value
 * that a worker action can reach — only the merchant's own confirmation, from
 * outside this system, can set it.
 */

const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../../core/geo/point');
const { SERVICE_TYPES, PAYMENT_MODELS } = require('./config.model');

/* State machine (§64) */

const TASK_STATUSES = [
  'DRAFT',
  'REQUESTED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'WORKER_SEARCHING',
  'WORKER_ASSIGNED',
  'WORKER_ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'TASK_STARTED',
  'IN_PROGRESS',
  'APPROVAL_REQUIRED',
  'RETURNING',
  'AT_DROPOFF',
  'HANDED_OVER',
  'COMPLETED',
  'CUSTOMER_CONFIRMED',
  'SETTLED',
  // Exceptions
  'CANCELLED',
  'FAILED',
  'WORKER_DECLINED',
  'ITEM_UNAVAILABLE',
  'MERCHANT_REJECTED',
  'EXCHANGE_UNAVAILABLE',
  'DISPUTED',
];

/**
 * Legal moves. The server is the only thing that may advance a task — a status
 * arriving from a client is a request, never an instruction (§58).
 */
const TRANSITIONS = {
  DRAFT: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['WORKER_SEARCHING', 'CANCELLED'],
  WORKER_SEARCHING: ['WORKER_ASSIGNED', 'CANCELLED', 'FAILED'],
  WORKER_ASSIGNED: ['WORKER_ACCEPTED', 'WORKER_DECLINED', 'WORKER_SEARCHING', 'CANCELLED'],
  WORKER_DECLINED: ['WORKER_SEARCHING', 'CANCELLED', 'FAILED'],
  WORKER_ACCEPTED: ['EN_ROUTE', 'CANCELLED', 'WORKER_DECLINED'],
  EN_ROUTE: ['ARRIVED', 'CANCELLED', 'FAILED'],
  ARRIVED: ['TASK_STARTED', 'CANCELLED', 'FAILED'],
  TASK_STARTED: ['IN_PROGRESS', 'APPROVAL_REQUIRED', 'ITEM_UNAVAILABLE', 'FAILED', 'CANCELLED'],
  IN_PROGRESS: [
    'APPROVAL_REQUIRED', 'RETURNING', 'AT_DROPOFF', 'ITEM_UNAVAILABLE',
    'MERCHANT_REJECTED', 'EXCHANGE_UNAVAILABLE', 'FAILED', 'CANCELLED',
  ],
  // An approval either unblocks the work or ends it — it never skips ahead.
  APPROVAL_REQUIRED: ['IN_PROGRESS', 'ITEM_UNAVAILABLE', 'CANCELLED', 'FAILED'],
  ITEM_UNAVAILABLE: ['IN_PROGRESS', 'RETURNING', 'COMPLETED', 'CANCELLED', 'FAILED'],
  RETURNING: ['AT_DROPOFF', 'HANDED_OVER', 'FAILED'],
  AT_DROPOFF: ['HANDED_OVER', 'MERCHANT_REJECTED', 'EXCHANGE_UNAVAILABLE', 'FAILED'],
  HANDED_OVER: ['COMPLETED', 'DISPUTED'],
  MERCHANT_REJECTED: ['RETURNING', 'COMPLETED', 'DISPUTED', 'FAILED'],
  EXCHANGE_UNAVAILABLE: ['RETURNING', 'COMPLETED', 'DISPUTED', 'FAILED'],
  COMPLETED: ['CUSTOMER_CONFIRMED', 'DISPUTED', 'SETTLED'],
  CUSTOMER_CONFIRMED: ['SETTLED', 'DISPUTED'],
  DISPUTED: ['SETTLED', 'COMPLETED', 'FAILED'],
  SETTLED: [],
  CANCELLED: [],
  FAILED: [],
};

/** Cancellation gets progressively more expensive, then impossible (§49). */
const CANCELLABLE_FROM = [
  'DRAFT', 'REQUESTED', 'PAYMENT_PENDING', 'CONFIRMED', 'WORKER_SEARCHING',
  'WORKER_ASSIGNED', 'WORKER_ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TASK_STARTED',
  'IN_PROGRESS', 'APPROVAL_REQUIRED', 'ITEM_UNAVAILABLE',
];

/* Item-level tracking (§12, §14, §46) */

const ITEM_STATUSES = [
  'requested', 'found', 'not_found', 'out_of_stock',
  'alternative_proposed', 'awaiting_approval', 'approved', 'rejected',
  'purchased', 'skipped',
];

const alternativeSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    brand: { type: String, default: '' },
    variant: { type: String, default: '' },
    quantity: { type: Number, default: 1, min: 1 },
    pricePaise: { type: Number, default: 0, min: 0 },
    /** S3 key. The customer decides with their eyes, not a description. */
    photoKey: { type: String, default: '' },
    note: { type: String, default: '' },
    proposedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const shoppingItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 500 },
    quantity: { type: Number, default: 1, min: 1 },
    preferredBrand: { type: String, default: '' },
    preferredSize: { type: String, default: '' },
    preferredVariant: { type: String, default: '' },

    /**
     * The customer's ceiling for THIS item. A helper may not exceed it without
     * an approval, and the sum of these is what the budget check uses — not a
     * single pooled figure a helper could spend entirely on one thing.
     */
    maxApprovedPricePaise: { type: Number, default: 0, min: 0 },
    /** What it actually rang up as. Set only when genuinely purchased (§12). */
    actualPricePaise: { type: Number, default: null },

    referenceImageKey: { type: String, default: '' },
    referenceUrl: { type: String, default: '' },
    notes: { type: String, default: '', maxlength: 500 },

    status: { type: String, enum: ITEM_STATUSES, default: 'requested', index: true },
    alternative: { type: alternativeSchema, default: null },
    /** Set when the customer answers an alternative or an overspend. */
    customerApproved: { type: Boolean, default: null },

    /** Which receipt this line appears on. */
    receiptKey: { type: String, default: '' },
    unavailableReason: { type: String, default: '' },
  },
  { _id: true },
);

/* Approvals — immutable, one row per decision (§36) */

const APPROVAL_KINDS = [
  'alternative_item', 'price_increase', 'additional_stop',
  'additional_waiting', 'additional_task', 'other',
];

const approvalSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: APPROVAL_KINDS, required: true },
    /** Which item it concerns, when it concerns one. */
    itemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, default: '', maxlength: 500 },

    previousAmountPaise: { type: Number, default: 0, min: 0 },
    newAmountPaise: { type: Number, default: 0, min: 0 },

    status: {
      type: String, enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending', index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    /** Who answered — evidence, not decoration. */
    respondedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    evidenceKeys: { type: [String], default: [] },
  },
  { _id: true },
);

/* Proof (§13, §17, §29) */

const PROOF_KINDS = [
  'arrival', 'item', 'receipt', 'package_before', 'package_after',
  'handover', 'merchant_acknowledgement', 'courier_receipt', 'other',
];

const proofSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: PROOF_KINDS, required: true },
    /** S3 key, signed on read. */
    key: { type: String, required: true },
    note: { type: String, default: '' },
    capturedAt: { type: Date, default: Date.now },
    /** Where the helper was standing when they took it. */
    location: pointField({}),
  },
  { _id: false },
);

/* Stops (§15) */

const stopSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    address: { type: String, default: '' },
    location: pointField({}),
    /** What the helper is meant to do here. */
    purpose: {
      type: String,
      enum: ['shop', 'pickup', 'dropoff', 'merchant', 'courier'],
      default: 'shop',
    },
    arrivedAt: { type: Date, default: null },
    departedAt: { type: Date, default: null },
    completed: { type: Boolean, default: false },
  },
  { _id: true },
);

/* Return / exchange specifics (§47) */

const RETURN_METHODS = ['store_dropoff', 'courier_dropoff', 'merchant_handover', 'exchange'];

/**
 * Refund reality, not refund theatre (§30, §47).
 *
 * There is deliberately no value a helper's action can set to "confirmed".
 * Handing a parcel over means the merchant now has it — nothing more.
 */
const REFUND_STATUSES = [
  'unknown', 'not_applicable', 'pending_merchant', 'refund_confirmed', 'refund_failed',
];

const returnDetailSchema = new mongoose.Schema(
  {
    merchantName: { type: String, default: '' },
    orderId: { type: String, default: '' },
    returnId: { type: String, default: '' },
    productName: { type: String, default: '' },
    quantity: { type: Number, default: 1, min: 1 },
    returnReason: { type: String, default: '' },
    returnMethod: { type: String, enum: RETURN_METHODS, default: 'store_dropoff' },
    returnDeadline: { type: Date, default: null },
    merchantInstructions: { type: String, default: '', maxlength: 2000 },

    /** The customer confirms the merchant allows this — we never assert it (§24). */
    customerConfirmedEligibility: { type: Boolean, default: false },
    packagingConfirmed: { type: Boolean, default: false },

    /** Proof the parcel changed hands, and to whom. */
    handoverAt: { type: Date, default: null },
    trackingNumber: { type: String, default: '' },
    merchantAcknowledgement: { type: String, default: '' },

    refundStatus: { type: String, enum: REFUND_STATUSES, default: 'unknown', index: true },
    refundExternalReference: { type: String, default: '' },

    /* Exchange only (§31) */
    desiredReplacement: { type: String, default: '' },
    replacementCollected: { type: Boolean, default: false },
    replacementNote: { type: String, default: '' },
  },
  { _id: false },
);

/* Money (§7, §52) */

/** ZappyOne's charge. Item money is NOT here, on purpose. */
const chargeSchema = new mongoose.Schema(
  {
    baseFeePaise: { type: Number, default: 0, min: 0 },
    distanceFeePaise: { type: Number, default: 0, min: 0 },
    waitingFeePaise: { type: Number, default: 0, min: 0 },
    multiStopFeePaise: { type: Number, default: 0, min: 0 },
    timeExtensionPaise: { type: Number, default: 0, min: 0 },
    specialHandlingPaise: { type: Number, default: 0, min: 0 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },

    /** Sum of the fees above — the price of the SERVICE, nothing else. */
    serviceChargePaise: { type: Number, default: 0, min: 0 },
    /** Zappy's cut, taken from the service charge only (§32, §34). */
    commissionPaise: { type: Number, default: 0, min: 0 },
    /** What the helper earns: service charge minus commission. */
    workerEarningPaise: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'INR' },
    distanceKm: { type: Number, default: null },
    waitingMinutes: { type: Number, default: 0, min: 0 },
    quoteRequired: { type: Boolean, default: false },
    snapshotAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** The customer's item money. Never mixed with the above. */
const itemMoneySchema = new mongoose.Schema(
  {
    /** Ceiling the customer authorised up front. */
    budgetPaise: { type: Number, default: 0, min: 0 },
    /** What was actually spent, summed from purchased items only. */
    actualPaise: { type: Number, default: 0, min: 0 },
    paymentModel: { type: String, enum: PAYMENT_MODELS, default: 'customer_preauth' },

    /** Cash the helper fronted, and whether it has been paid back (§35). */
    workerAdvancePaise: { type: Number, default: 0, min: 0 },
    workerReimbursedPaise: { type: Number, default: 0, min: 0 },
    /** Unspent budget released back to the customer. */
    refundedPaise: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: TASK_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    byRole: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

/* The task */

const helpingTaskSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    serviceType: { type: String, enum: SERVICE_TYPES, required: true, index: true },
    /** Free text from the customer: "buy these 3 hardware items". */
    title: { type: String, default: '', maxlength: 200 },
    instructions: { type: String, default: '', maxlength: 2000 },

    status: { type: String, enum: TASK_STATUSES, default: 'DRAFT', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    /* Where */
    pickupLocation: pointField({ address: String }),
    destination: pointField({ address: String }),
    stops: { type: [stopSchema], default: [] },

    /* When */
    scheduledAt: { type: Date, default: null, index: true },
    estimatedDurationMinutes: { type: Number, default: 45 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null, index: true },

    /* What */
    items: { type: [shoppingItemSchema], default: [] },
    returnDetail: { type: returnDetailSchema, default: null },

    /* Money — two separate worlds, deliberately */
    charge: { type: chargeSchema, default: () => ({}) },
    itemMoney: { type: itemMoneySchema, default: () => ({}) },

    approvals: { type: [approvalSchema], default: [] },
    proofs: { type: [proofSchema], default: [] },

    /* Handover */
    handoverOtp: { type: String, default: '' },
    handoverVerifiedAt: { type: Date, default: null },

    paymentMethod: { type: String, enum: ['cash', 'online', 'wallet'], default: 'cash' },
    /** The service charge only — item money is the customer's own and settled separately. */
    paymentStatus: {
      type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'], default: 'pending', index: true,
    },
    paymentId: { type: String, default: null },
    idempotencyKey: { type: String, default: null, index: true, sparse: true },

    cancellationReason: { type: String, default: '' },
    cancellationFeePaise: { type: Number, default: 0, min: 0 },
    failureReason: { type: String, default: '' },

    rating: { type: Number, min: 1, max: 5, default: null },
    ratingComment: { type: String, default: '', maxlength: 1000 },
    ratedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

stripEmptyPoints(helpingTaskSchema, ['pickupLocation', 'destination']);

helpingTaskSchema.index({ userId: 1, status: 1, createdAt: -1 });
helpingTaskSchema.index({ workerId: 1, status: 1 });
helpingTaskSchema.index({ serviceType: 1, status: 1, createdAt: -1 });
helpingTaskSchema.index({ pickupLocation: '2dsphere' });

helpingTaskSchema.methods.canTransition = function canTransition(next) {
  return (TRANSITIONS[this.status] || []).includes(next);
};

helpingTaskSchema.methods.transitionTo = function transitionTo(next, meta = {}) {
  if (!this.canTransition(next)) {
    const err = new Error(`Cannot move a task from ${this.status} to ${next}`);
    err.status = 409;
    err.code = 'ILLEGAL_TRANSITION';
    throw err;
  }
  this.status = next;
  this.statusHistory.push({
    status: next, at: new Date(), by: meta.by || null, byRole: meta.byRole || '', note: meta.note || '',
  });
  if (next === 'TASK_STARTED' && !this.startedAt) this.startedAt = new Date();
  if (next === 'COMPLETED' && !this.completedAt) this.completedAt = new Date();
  return this;
};

/** True while the customer owes an answer — the helper is standing still (§36). */
helpingTaskSchema.methods.hasPendingApproval = function hasPendingApproval() {
  return (this.approvals || []).some((a) => a.status === 'pending');
};

/**
 * What was actually spent. Summed from PURCHASED items only, so an item that
 * was merely found, or approved and then not bought, contributes nothing.
 */
helpingTaskSchema.methods.computeItemSpend = function computeItemSpend() {
  return (this.items || [])
    .filter((i) => i.status === 'purchased' && i.actualPricePaise != null)
    .reduce((sum, i) => sum + i.actualPricePaise, 0);
};

const HelpingTask = mongoose.model('HelpingTask', helpingTaskSchema);

module.exports = {
  HelpingTask,
  TASK_STATUSES,
  TRANSITIONS,
  CANCELLABLE_FROM,
  ITEM_STATUSES,
  APPROVAL_KINDS,
  PROOF_KINDS,
  RETURN_METHODS,
  REFUND_STATUSES,
};
