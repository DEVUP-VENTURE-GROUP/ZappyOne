const mongoose = require('mongoose');

/**
 * Governance: approval queues, customer catalog requests, warranty claims.
 *
 * ApprovalRequest is deliberately generic. Provider prices, new brands, new
 * parts, skill-level claims and abnormal pricing all need the same shape —
 * something submitted, a reviewer, a decision, a reason and an audit trail —
 * so they share one queue with a `kind` discriminator rather than five
 * near-identical tables that drift apart.
 *
 * CustomerCatalogRequest is the escape hatch from §67: a catalog will never be
 * complete, and a customer whose phone is missing must be able to ask for it
 * instead of hitting a dead end and leaving.
 */

const APPROVAL_KINDS = [
  'brand',
  'model',
  'provider',
  'worker',
  'provider_pricing',
  'part',
  'repair',
  'skill_level',
  'warranty_claim',
  'abnormal_price',
  'dispute',
];

const APPROVAL_STATES = ['pending', 'in_review', 'approved', 'rejected', 'cancelled'];

const approvalRequestSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: APPROVAL_KINDS, required: true, index: true },

    /** The record under review. Kept loose because kinds span many collections. */
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /** Denormalised summary so the queue renders without N+1 lookups. */
    title: { type: String, required: true },
    summary: { type: String, default: '' },

    /** Snapshot of what is being proposed, for before/after diffing in the UI. */
    proposed: { type: mongoose.Schema.Types.Mixed, default: null },
    current: { type: mongoose.Schema.Types.Mixed, default: null },

    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },

    requestedByRole: { type: String, enum: ['customer', 'worker', 'shop', 'admin', 'system'], required: true },
    requestedById: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    status: { type: String, enum: APPROVAL_STATES, default: 'pending', index: true },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    decisionReason: { type: String, default: '' },
  },
  { timestamps: true },
);

approvalRequestSchema.index({ kind: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ status: 1, priority: -1, createdAt: 1 });

const catalogRequestSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['brand', 'model', 'problem'], required: true, index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /** Free text — this is a customer describing something we do not stock yet. */
    brandName: { type: String, default: '' },
    modelName: { type: String, default: '' },
    variantName: { type: String, default: '' },
    problemText: { type: String, default: '' },
    notes: { type: String, default: '' },
    imageUrls: { type: [String], default: [] },

    status: { type: String, enum: ['pending', 'approved', 'rejected', 'duplicate'], default: 'pending', index: true },

    /** Set when admin turns the request into a real catalog row. */
    resultEntityType: { type: String, default: '' },
    resultEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },

    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },

    /** How many customers asked for the same thing — drives prioritisation. */
    requestCount: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

catalogRequestSchema.index({ kind: 1, status: 1, requestCount: -1 });

const warrantyClaimSchema = new mongoose.Schema(
  {
    warrantyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warranty', default: null, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    repairCode: { type: String, required: true, lowercase: true },
    partId: { type: mongoose.Schema.Types.ObjectId, ref: 'Part', default: null },

    issueDescription: { type: String, required: true },
    photos: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['submitted', 'under_review', 'approved', 'rejected', 'resolved', 'expired'],
      default: 'submitted',
      index: true,
    },

    /** Set when the claim is honoured by re-opening work under the warranty. */
    revisitBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', default: null },

    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

warrantyClaimSchema.index({ userId: 1, status: 1, createdAt: -1 });
warrantyClaimSchema.index({ status: 1, createdAt: -1 });

const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
const CustomerCatalogRequest = mongoose.model('CustomerCatalogRequest', catalogRequestSchema);
const RepairWarrantyClaim = mongoose.model('RepairWarrantyClaim', warrantyClaimSchema);


/* ─── Provider-proposed catalog additions ──────────────────────────────── */

/**
 * "I do a job you don't list."
 *
 * A provider knows their trade better than our catalog does — the first person
 * to tell us about a repair we are missing is usually the one who does it every
 * day. But a provider cannot write into the catalog directly: a repair carries
 * pricing, skill and QA rules, and anything customers can book has to be
 * something we can stand behind.
 *
 * `cityCode` matters. A repair one shop in Hyderabad offers is not evidence
 * that the same job exists nationally, so an approved request is scoped to the
 * locality it came from until it proves itself elsewhere.
 */
const providerCatalogRequestSchema = new mongoose.Schema(
  {
    vertical: { type: String, required: true, lowercase: true, index: true },
    providerKind: { type: String, enum: ['shop', 'individual'], required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    /** Which customer-facing heading it belongs under. */
    categoryCode: { type: String, default: '', lowercase: true },
    proposedName: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 1000 },
    /** Where this provider actually works — the locality it would be offered in. */
    cityCode: { type: String, default: '', lowercase: true, index: true },

    /** How many providers asked for the same thing — demand, not noise. */
    requestCount: { type: Number, default: 1 },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    resultRepairCode: { type: String, default: null },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

providerCatalogRequestSchema.index({ status: 1, requestCount: -1, createdAt: -1 });

module.exports = {
  ProviderCatalogRequest: mongoose.model('ProviderCatalogRequest', providerCatalogRequestSchema),
  ApprovalRequest,
  CustomerCatalogRequest,
  RepairWarrantyClaim,
  APPROVAL_KINDS,
  APPROVAL_STATES,
};
