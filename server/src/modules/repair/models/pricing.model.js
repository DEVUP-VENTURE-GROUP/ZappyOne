const mongoose = require('mongoose');

/**
 * Pricing: Zappy reference bands + provider prices + immutable version history.
 *
 * Three deliberate design decisions here, each fixing something the old
 * single-price ServiceVariant could not express:
 *
 * 1. A reference price is a BAND (min / recommended / max), not a number.
 *    A single figure gives admin nothing to judge a provider's quote against,
 *    which is what the whole approval workflow in §12 depends on.
 *
 * 2. Prices are VERSIONED and never overwritten (§69). Editing a price writes a
 *    new version and supersedes the old one; bookings keep the version they were
 *    quoted on, so raising a price tomorrow cannot silently rewrite yesterday's
 *    order. `version` + `supersededAt` are how that history is kept.
 *
 * 3. Location and service mode are dimensions of the price, not afterthoughts.
 *    A doorstep repair in one city and a workshop repair in another are
 *    different economics, and the resolution hierarchy in §54 needs both to be
 *    real, queryable fields rather than something bolted on later.
 *
 * All money is stored in paise (integers). Nothing here does floating-point
 * arithmetic on currency.
 */

const APPROVAL_BANDS = ['green', 'yellow', 'red'];
const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'auto_approved'];

/* Zappy reference pricing */

const referencePricingSchema = new mongoose.Schema(
  {
    vertical: { type: String, required: true, lowercase: true, index: true },
    repairCode: { type: String, required: true, lowercase: true, index: true },

    /**
     * Scope. Progressively more specific rows win during resolution; a row with
     * an empty modelCode is the brand-level fallback, and an empty brandCode too
     * is the repair-level fallback. This is what makes the hierarchy in §54
     * expressible as data instead of as branching code.
     */
    brandCode: { type: String, default: null, lowercase: true, index: true },
    modelCode: { type: String, default: null, lowercase: true, index: true },
    qualityCode: { type: String, default: null, lowercase: true, index: true },
    serviceMode: { type: String, default: null, index: true },

    /** Null = applies nationally. Set = city/area-specific override. */
    cityCode: { type: String, default: null, lowercase: true, index: true },

    minPaise: { type: Number, required: true, min: 0 },
    recommendedPaise: { type: Number, required: true, min: 0 },
    maxPaise: { type: Number, required: true, min: 0 },

    /** Indicative split — used to pre-fill a provider's first submission. */
    partCostPaise: { type: Number, default: 0, min: 0 },
    labourPaise: { type: Number, default: 0, min: 0 },

    warrantyDays: { type: Number, default: 0, min: 0 },

    version: { type: Number, default: 1, min: 1 },
    supersededAt: { type: Date, default: null, index: true },
    supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: 'ZappyReferencePricing', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, default: '' },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Only one live row per exact scope; superseded rows stay queryable for history.
referencePricingSchema.index(
  { repairCode: 1, brandCode: 1, modelCode: 1, qualityCode: 1, serviceMode: 1, cityCode: 1 },
  { unique: true, partialFilterExpression: { supersededAt: null } },
);
referencePricingSchema.index({ repairCode: 1, modelCode: 1, supersededAt: 1 });

referencePricingSchema.pre('validate', function validateBand(next) {
  if (this.minPaise > this.recommendedPaise || this.recommendedPaise > this.maxPaise) {
    return next(new Error('Reference band must satisfy min <= recommended <= max'));
  }
  next();
});

/* Provider pricing */

const providerPricingSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    vertical: { type: String, required: true, lowercase: true, index: true },
    repairCode: { type: String, required: true, lowercase: true, index: true },
    brandCode: { type: String, default: null, lowercase: true, index: true },
    modelCode: { type: String, default: null, lowercase: true, index: true },
    qualityCode: { type: String, default: null, lowercase: true, index: true },
    serviceMode: { type: String, default: null, index: true },
    cityCode: { type: String, default: null, lowercase: true, index: true },

    /** Provider's declared cost breakdown, all optional except the total. */
    partCostPaise: { type: Number, default: 0, min: 0 },
    labourPaise: { type: Number, default: 0, min: 0 },
    consumablesPaise: { type: Number, default: 0, min: 0 },
    travelPaise: { type: Number, default: 0, min: 0 },
    pickupPaise: { type: Number, default: 0, min: 0 },
    returnPaise: { type: Number, default: 0, min: 0 },

    /** What the customer would pay this provider, before platform fees/tax. */
    totalPaise: { type: Number, required: true, min: 0 },

    warrantyDays: { type: Number, default: 0, min: 0 },
    estimatedDurationMin: { type: Number, default: null },

    /**
     * Deviation from the reference band, computed on submission and frozen with
     * the version. Stored rather than derived so that admin review and later
     * audits see the number the decision was actually made on, even if the
     * reference band moves afterwards.
     */
    referencePricingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ZappyReferencePricing', default: null },
    referenceRecommendedPaise: { type: Number, default: null },
    deviationPct: { type: Number, default: null },
    band: { type: String, enum: APPROVAL_BANDS, default: null, index: true },

    approvalStatus: { type: String, enum: APPROVAL_STATUSES, default: 'draft', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },

    version: { type: Number, default: 1, min: 1 },
    supersededAt: { type: Date, default: null, index: true },
    supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderPricing', default: null },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// The brand is part of a price's scope: a shop's Samsung baseline and its
// Apple baseline for the same job are two prices, not one (see migration 002).
providerPricingSchema.index(
  { shopId: 1, repairCode: 1, brandCode: 1, modelCode: 1, qualityCode: 1, serviceMode: 1, cityCode: 1 },
  { unique: true, partialFilterExpression: { supersededAt: null, shopId: { $type: 'objectId' } } },
);
providerPricingSchema.index(
  { workerId: 1, repairCode: 1, brandCode: 1, modelCode: 1, qualityCode: 1, serviceMode: 1, cityCode: 1 },
  { unique: true, partialFilterExpression: { supersededAt: null, workerId: { $type: 'objectId' } } },
);
providerPricingSchema.index({ repairCode: 1, approvalStatus: 1, supersededAt: 1 });

/** Only approved, current prices may be shown to a customer or booked against. */
providerPricingSchema.methods.isBookable = function isBookable() {
  return (
    this.isActive &&
    !this.supersededAt &&
    (this.approvalStatus === 'approved' || this.approvalStatus === 'auto_approved')
  );
};

const ZappyReferencePricing = mongoose.model('ZappyReferencePricing', referencePricingSchema);
const ProviderPricing = mongoose.model('ProviderPricing', providerPricingSchema);

module.exports = { ZappyReferencePricing, ProviderPricing, APPROVAL_BANDS, APPROVAL_STATUSES };
