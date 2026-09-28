/**
 * Pet Services pricing configuration and provider capability.
 *
 * Every number the pricing engine reads lives in `PetPricingRule`. There is
 * no fee, multiplier or surcharge constant anywhere in the pet module's code
 * (§28, §62). The seed ships researched starting values; an operator retunes
 * them from admin and the next quote is different.
 *
 * WHY SIZE IS A MULTIPLIER AND NOT A FEE. Market research across Indian
 * groomers and boarding operators is consistent: a large dog costs 20–30%
 * more than a small one and a giant 30–50% more, PROPORTIONALLY — it is not a
 * flat ₹200 surcharge. Modelling it as a flat fee would undercharge premium
 * services and overcharge cheap ones, which is exactly backwards.
 */

const mongoose = require('mongoose');
const { SPECIES, PET_SIZES } = require('../../service/pet-passport.model');
const { SERVICE_MODES } = require('./catalog.model');
const { pointField, stripEmptyPoints } = require('../../../core/geo/point');

/* Pricing rules (§28, §47) */

const pricingRuleSchema = new mongoose.Schema(
  {
    /**
     * Scope, most specific wins. A rule naming a variant beats one naming
     * only its category, which beats the category-wide default. This is what
     * lets "full grooming" carry its own price while every other grooming
     * service inherits sensible defaults.
     */
    categoryCode: { type: String, required: true, lowercase: true, index: true },
    variantCode: { type: String, default: null, lowercase: true, index: true },
    species: { type: String, enum: [...SPECIES, null], default: null, index: true },
    cityCode: { type: String, default: null, lowercase: true, index: true },

    /* The base number */
    basePaise: { type: Number, default: 0, min: 0 },
    /** For per-minute services: the rate the duration is multiplied by. */
    perMinutePaise: { type: Number, default: 0, min: 0 },
    perNightPaise: { type: Number, default: 0, min: 0 },
    perDayPaise: { type: Number, default: 0, min: 0 },
    perVisitPaise: { type: Number, default: 0, min: 0 },
    perKmPaise: { type: Number, default: 0, min: 0 },
    /** Distance included before per-km billing starts. */
    includedKm: { type: Number, default: 0, min: 0 },

    /* Size multipliers (§29 research) */
    sizeMultipliers: {
      small: { type: Number, default: 1, min: 0.1 },
      medium: { type: Number, default: 1.15, min: 0.1 },
      large: { type: Number, default: 1.3, min: 0.1 },
      extra_large: { type: Number, default: 1.5, min: 0.1 },
    },

    /**
     * Long and double coats take longer. Read from the breed catalog's
     * `groomingComplexity`, bounded here so a bad catalog row cannot produce
     * an absurd price.
     */
    applyBreedComplexity: { type: Boolean, default: false },
    maxBreedComplexity: { type: Number, default: 2, min: 1 },

    /* Additional pets on one booking (§33) */
    additionalPetPct: { type: Number, default: 70, min: 0, max: 200 },

    /* Time and travel */
    waitingFreeMinutes: { type: Number, default: 15, min: 0 },
    waitingPerMinutePaise: { type: Number, default: 0, min: 0 },
    /** Charged per block once the estimated duration is exceeded. */
    overtimeBlockMinutes: { type: Number, default: 15, min: 1 },
    overtimeBlockPaise: { type: Number, default: 0, min: 0 },
    pickupPaise: { type: Number, default: 0, min: 0 },
    returnPaise: { type: Number, default: 0, min: 0 },
    specialHandlingPaise: { type: Number, default: 0, min: 0 },

    /* Demand pricing. Off by default; surge on pet care is a choice. */
    peakMultiplier: { type: Number, default: 1, min: 1, max: 3 },
    holidayMultiplier: { type: Number, default: 1, min: 1, max: 3 },

    /* Multi-night discounts (§29 research: 10-15% weekly, 20-30% monthly) */
    weeklyDiscountPct: { type: Number, default: 0, min: 0, max: 100 },
    weeklyThresholdNights: { type: Number, default: 7, min: 1 },
    monthlyDiscountPct: { type: Number, default: 0, min: 0, max: 100 },
    monthlyThresholdNights: { type: Number, default: 30, min: 1 },

    /* Platform economics */
    commissionPct: { type: Number, default: 15, min: 0, max: 100 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    taxPct: { type: Number, default: 0, min: 0, max: 100 },

    /**
     * Guardrails on what a provider may charge (§29). A provider price
     * outside this band is refused rather than quietly published — the band
     * is what stops a marketplace becoming unpredictable for customers.
     */
    minPaise: { type: Number, default: 0, min: 0 },
    maxPaise: { type: Number, default: 0, min: 0 },

    /** Documentation, so an operator knows what a number was based on. */
    referenceNote: { type: String, default: '' },
    isReferenceSeed: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

pricingRuleSchema.index(
  { categoryCode: 1, variantCode: 1, species: 1, cityCode: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

/** How specific a rule is — higher wins during resolution. */
pricingRuleSchema.methods.specificity = function specificity() {
  return (this.variantCode ? 4 : 0) + (this.species ? 2 : 0) + (this.cityCode ? 1 : 0);
};

/* Provider capability (§26, §64) */

/**
 * What a provider is actually able and approved to do.
 *
 * §26 is explicit: never assume a provider can perform a service. A groomer
 * who handles small dogs is not automatically a groomer who can handle an
 * aggressive Rottweiler, and a boarding provider has a real, finite number of
 * beds. Both facts live here and both are checked before a booking is
 * allowed to exist.
 */
const providerCapabilitySchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },

    providerType: {
      type: String,
      enum: [
        'pet_caregiver', 'pet_sitter', 'dog_walker', 'pet_groomer',
        'boarding_provider', 'daycare_provider', 'pet_transport',
        'pet_care_agency', 'vet_assistant', 'licensed_vet', 'vet_clinic',
      ],
      required: true,
      index: true,
    },

    /* What they can take on */
    species: { type: [String], enum: SPECIES, default: [] },
    sizes: { type: [String], enum: PET_SIZES, default: [] },
    categoryCodes: { type: [String], default: [], index: true },
    variantCodes: { type: [String], default: [] },
    modes: { type: [String], enum: SERVICE_MODES, default: [] },

    /**
     * Explicit opt-in for animals most providers should not take. A provider
     * who has not ticked this never sees a job flagged high bite risk.
     */
    handlesAggressive: { type: Boolean, default: false },
    handlesSpecialNeeds: { type: Boolean, default: false },
    /** Required before a compatibility row with requiresProviderOptIn passes. */
    optInVariantCodes: { type: [String], default: [] },

    /* Capacity — beds are physical and finite (§64) */
    boardingCapacity: { type: Number, default: 0, min: 0 },
    daycareCapacity: { type: Number, default: 0, min: 0 },

    /* Where */
    serviceAreaCodes: { type: [String], default: [] },
    baseLocation: pointField({}),
    serviceRadiusKm: { type: Number, default: 8, min: 0 },

    /* Verification (§25) */
    verificationStatus: {
      type: String,
      enum: ['pending', 'document_review', 'verified', 'rejected', 'suspended'],
      default: 'pending',
      index: true,
    },
    qualifications: { type: [String], default: [] },
    equipment: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0, min: 0 },

    /** Clearly-marked demo rows, so they can never be mistaken for real ones. */
    isDemo: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

stripEmptyPoints(providerCapabilitySchema, ['baseLocation']);
providerCapabilitySchema.index({ baseLocation: '2dsphere' });
providerCapabilitySchema.index({ verificationStatus: 1, isActive: 1, categoryCodes: 1 });

/** Neither, or both, is a bug — a capability belongs to exactly one provider. */
providerCapabilitySchema.pre('validate', function oneOwner(next) {
  if (!this.workerId && !this.shopId) {
    return next(new Error('A capability needs a workerId or a shopId'));
  }
  if (this.workerId && this.shopId) {
    return next(new Error('A capability belongs to one provider, not two'));
  }
  next();
});

/* Cancellation policy (§37) */

const cancellationPolicySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    categoryCodes: { type: [String], default: [] },

    /**
     * Tiers, read in order. The first whose window contains "hours until the
     * booking starts" applies. Boarding is stricter than a walk because a
     * held bed is a night the provider cannot sell to anyone else.
     */
    tiers: {
      type: [{
        minHoursBefore: { type: Number, required: true },
        refundPct: { type: Number, required: true, min: 0, max: 100 },
        providerCompensationPct: { type: Number, default: 0, min: 0, max: 100 },
        label: { type: String, default: '' },
        _id: false,
      }],
      default: [],
    },

    noShowRefundPct: { type: Number, default: 0, min: 0, max: 100 },
    /** A provider cancelling never costs the customer anything. */
    providerCancelRefundPct: { type: Number, default: 100, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const PetPricingRule = mongoose.model('PetPricingRule', pricingRuleSchema);
const PetProviderCapability = mongoose.model('PetProviderCapability', providerCapabilitySchema);
const PetCancellationPolicy = mongoose.model('PetCancellationPolicy', cancellationPolicySchema);

module.exports = { PetPricingRule, PetProviderCapability, PetCancellationPolicy };
