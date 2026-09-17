const mongoose = require('mongoose');

/**
 * Repair quote — the priced proposal a provider makes after diagnosis.
 *
 * The rule this model exists to enforce (§31): once a customer approves a
 * quote, that quote is LOCKED. Extra work found mid-repair does not edit the
 * approved figure — it creates a new quote at `revision + 1` that the customer
 * must approve on its own. That is why `revision`, `supersedesId` and the
 * approval fields are all here rather than the price simply being mutable.
 *
 * A quote is also the only route by which a diagnosis-required booking gets a
 * real price. No repair may begin while a quote is awaiting approval.
 */

const QUOTE_STATUSES = [
  'draft',
  'sent',
  'approved',
  'rejected',
  'expired',
  'superseded',
  'clarification_requested',
];

/**
 * A single priced line. Parts carry their identity so an approved quote can be
 * reconciled against what was actually fitted.
 */
const quoteItemSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['part', 'labour', 'consumable', 'travel', 'pickup', 'return', 'diagnosis', 'other'],
      required: true,
    },
    label: { type: String, required: true, trim: true },

    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },
    partSku: { type: String, default: null },
    qualityCode: { type: String, default: null, lowercase: true },

    quantity: { type: Number, default: 1, min: 1 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 0 },

    warrantyDays: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const quoteSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    /** Findings that justify the price — shown to the customer verbatim. */
    diagnosisSummary: { type: String, required: true },
    diagnosisPhotos: { type: [String], default: [] },

    repairCode: { type: String, required: true, lowercase: true, index: true },
    qualityCode: { type: String, default: null, lowercase: true },

    items: { type: [quoteItemSchema], default: [] },

    subtotalPaise: { type: Number, required: true, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    warrantyDays: { type: Number, default: 0, min: 0 },
    estimatedCompletionAt: { type: Date, default: null },
    estimatedDurationMin: { type: Number, default: null },

    status: { type: String, enum: QUOTE_STATUSES, default: 'draft', index: true },

    /**
     * Revision chain. Revision 1 is the post-diagnosis quote; anything higher is
     * additional work discovered later, each approved independently.
     */
    revision: { type: Number, default: 1, min: 1 },

    /**
     * Raised because something else was found once the device was open.
     *
     * Worth distinguishing from the first quote: a customer reading "extra
     * work found" makes a different decision from one reading "your quote",
     * and a technician who finds a second fault is doing the right thing —
     * the alternative is quietly fixing it and arguing about the bill, or
     * quietly not fixing it.
     */
    isAdditional: { type: Boolean, default: false },

    /** What was found, in the customer catalog's own words. */
    foundProblemCodes: { type: [String], default: [] },
    foundNote: { type: String, default: '', maxlength: 1000 },
    supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairQuote', default: null },
    supersededAt: { type: Date, default: null },

    sentAt: { type: Date, default: null },
    /** Quotes go stale; expiry is configurable, the timestamp is stored. */
    expiresAt: { type: Date, default: null, index: true },

    respondedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    clarificationNote: { type: String, default: '' },

    /** Frozen once approved — nothing may edit a quote after this is set. */
    approvedAt: { type: Date, default: null },
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true },
);

quoteSchema.index({ bookingId: 1, revision: -1 });
quoteSchema.index({ status: 1, expiresAt: 1 });
quoteSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

/** An approved quote is immutable; guard every mutation path through this. */
quoteSchema.methods.isLocked = function isLocked() {
  return this.status === 'approved' || this.status === 'superseded';
};

quoteSchema.methods.isActionable = function isActionable() {
  if (this.status !== 'sent' && this.status !== 'clarification_requested') return false;
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return false;
  return true;
};

const RepairQuote = mongoose.model('RepairQuote', quoteSchema);

module.exports = { RepairQuote, QUOTE_STATUSES };
