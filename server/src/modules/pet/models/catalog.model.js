/**
 * Pet Services catalog — categories, variants, breeds, add-ons, packages and
 * the compatibility rules between them.
 *
 * ALL OF IT IS DATA. §62 is absolute: no price, no availability rule, no
 * species compatibility and no add-on lives in code. Admin edits a row and
 * the next request behaves differently, with no deploy. That is why, for
 * example, "cats may not be walked outdoors" is a `ServiceCompatibility` row
 * with `allowed: false` rather than an `if (species === 'cat')` somewhere —
 * the day a provider is genuinely qualified to do it, that becomes a
 * configuration change.
 *
 * WHY A SEPARATE CATALOG FROM THE REPAIR ENGINE. A repair is a fault on a
 * device. A pet service is a duration of care for a living animal, priced by
 * its size, gated by the provider's capability to handle that species and
 * temperament, and sometimes constrained by a physical bed count. None of
 * that maps onto brand/model/problem/repair. Everything AROUND it — provider,
 * wallet, notifications, media, tracking, reviews — is reused untouched.
 */

const mongoose = require('mongoose');
const { SPECIES, PET_SIZES } = require('../../service/pet-passport.model');
const { pointField, stripEmptyPoints } = require('../../../utils/geo-point');

/** The seven customer-facing categories (§2). Fixed at launch by product. */
const CATEGORY_CODES = [
  'pet_grooming',
  'pet_boarding',
  'pet_walk',
  'pet_home_care',
  'pet_transport',
  'pet_vet_assist',
  'pet_check',
];

/**
 * How a service physically happens (§23). A variant declares which of these
 * it supports, and the booking flow offers only those.
 */
const SERVICE_MODES = [
  'doorstep',           // provider comes to the customer
  'home_visit',         // provider visits while the owner is away
  'provider_location',  // customer brings the pet to the provider
  'pickup_and_return',  // provider collects, services, returns
  'transport',          // movement is the service
  'boarding',           // pet stays overnight at the provider
  'daycare',            // pet stays for part of a day
];

/** How a variant's price is arrived at — the pricing engine branches on this. */
const PRICING_UNITS = [
  'flat',        // one price for the job (a full groom)
  'per_night',   // boarding
  'per_day',     // daycare
  'per_visit',   // home care, pet check
  'per_minute',  // walks, priced by duration
  'per_km',      // transport
  'quote',       // must be quoted by a human
];

/* Breeds (§5, §6) */

const breedSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    species: { type: String, enum: SPECIES, required: true, index: true },

    /**
     * The size this breed USUALLY is — a default to pre-fill, never a
     * decision. The pet's own `size` always wins (see pet-passport).
     */
    typicalSize: { type: String, enum: PET_SIZES, default: 'medium' },

    /**
     * Long coats take materially longer to groom and are priced up. This is
     * the honest reason a Shih Tzu groom costs more than a Beagle's, and it
     * belongs in data rather than in a groomer's head.
     */
    coatType: {
      type: String,
      enum: ['short', 'medium', 'long', 'double', 'curly', 'hairless', 'unknown'],
      default: 'unknown',
    },
    /** Extra handling multiplier applied by the pricing engine, if any. */
    groomingComplexity: { type: Number, default: 1, min: 0.5, max: 3 },

    isPopular: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

breedSchema.index({ species: 1, isActive: 1, displayOrder: 1 });

/* Categories and variants (§2, §9–§21) */

const categorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    imageKey: { type: String, default: '' },

    /** Copy the customer must see before booking — safety and scope limits. */
    disclaimer: { type: String, default: '' },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

const variantSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    categoryCode: { type: String, required: true, lowercase: true, index: true },
    description: { type: String, default: '' },

    /** Which species this variant is offered for at all. */
    species: { type: [String], enum: SPECIES, default: SPECIES },

    allowedModes: { type: [String], enum: SERVICE_MODES, default: ['doorstep'] },
    pricingUnit: { type: String, enum: PRICING_UNITS, default: 'flat' },

    /** For duration-priced services: the block being sold. */
    durationMinutes: { type: Number, default: null },
    /** Typical time on site, used for provider scheduling and overtime. */
    estimatedMinutes: { type: Number, default: 60 },

    /**
     * Requires a qualification the platform verifies. A variant marked this
     * way is never offered to a provider who has not been approved for it —
     * §20's line between logistics and veterinary work is enforced here.
     */
    requiresQualification: { type: String, default: null },

    /** Proof the provider must capture before the job can close (§39). */
    requiredProofKinds: { type: [String], default: [] },
    /** Checklist codes that gate completion. */
    checklistCodes: { type: [String], default: [] },

    isPopular: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

variantSchema.index({ categoryCode: 1, isActive: 1, displayOrder: 1 });

/* Compatibility (§51) */

/**
 * Whether a species may receive a service at all.
 *
 * The row that matters most: cat + outdoor walking is seeded `allowed: false`
 * with a reason the customer is actually shown. Walking a cat on a lead is
 * not a smaller version of walking a dog — it is a genuine escape and injury
 * risk that most cats are never trained for. Making it a row rather than a
 * hardcoded rule means an operator can enable it for a qualified provider
 * without a release, which is the point of §62.
 */
const compatibilitySchema = new mongoose.Schema(
  {
    species: { type: String, enum: SPECIES, required: true, index: true },
    categoryCode: { type: String, required: true, lowercase: true, index: true },
    /** Null = the rule covers the whole category. */
    variantCode: { type: String, default: null, lowercase: true, index: true },

    allowed: { type: Boolean, default: true },
    /** Allowed only where a provider is explicitly approved for it. */
    requiresProviderOptIn: { type: Boolean, default: false },
    /** Shown to the customer when `allowed` is false. Never a bare refusal. */
    reason: { type: String, default: '' },

    /** Size limits, where a service genuinely cannot take every animal. */
    allowedSizes: { type: [String], enum: PET_SIZES, default: PET_SIZES },
  },
  { timestamps: true },
);

compatibilitySchema.index(
  { species: 1, categoryCode: 1, variantCode: 1 },
  { unique: true },
);

/* Add-ons (§30) */

const addonSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },

    /** Which categories may offer it; empty means any. */
    categoryCodes: { type: [String], default: [] },
    /** Narrower still, where an add-on only makes sense on one variant. */
    variantCodes: { type: [String], default: [] },
    species: { type: [String], enum: SPECIES, default: SPECIES },

    pricePaise: { type: Number, default: 0, min: 0 },
    /** Scales with pet size, like the service itself, when true. */
    scalesWithSize: { type: Boolean, default: false },
    /** Minutes this adds, so scheduling and overtime stay honest. */
    addsMinutes: { type: Number, default: 0 },

    /** Charged once per booking, or once per pet on a multi-pet booking. */
    perPet: { type: Boolean, default: true },

    requiresProviderCapability: { type: String, default: null },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

/* Packages (§31) */

const packageSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },

    /** What the package contains: n sessions of a given variant. */
    includedSessions: {
      type: [{
        variantCode: { type: String, required: true, lowercase: true },
        sessions: { type: Number, required: true, min: 1 },
        _id: false,
      }],
      default: [],
    },

    species: { type: [String], enum: SPECIES, default: SPECIES },
    validityDays: { type: Number, default: 30, min: 1 },

    /**
     * Either a fixed package price, or a discount off the sum of its parts.
     * Never both — two sources for one number is how a package ends up
     * costing something nobody intended.
     */
    pricePaise: { type: Number, default: null },
    discountPct: { type: Number, default: null, min: 0, max: 100 },

    cancellationPolicyCode: { type: String, default: null },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

packageSchema.pre('validate', function onlyOnePriceSource(next) {
  if (this.pricePaise != null && this.discountPct != null) {
    return next(new Error('A package sets either a fixed price or a discount, not both'));
  }
  if (this.pricePaise == null && this.discountPct == null) {
    return next(new Error('A package needs either a fixed price or a discount'));
  }
  next();
});

/* Service areas (§48) */

const serviceAreaSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, index: true },
    name: { type: String, required: true },
    cityCode: { type: String, default: 'hyderabad', lowercase: true, index: true },
    centre: pointField({}),
    radiusKm: { type: Number, default: 5, min: 0.5 },
    /** Travel surcharge for an area the platform serves but does not favour. */
    travelSurchargePaise: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

stripEmptyPoints(serviceAreaSchema, ['centre']);
serviceAreaSchema.index({ centre: '2dsphere' });

const Breed = mongoose.model('PetBreed', breedSchema);
const PetServiceCategory = mongoose.model('PetServiceCategory', categorySchema);
const PetServiceVariant = mongoose.model('PetServiceVariant', variantSchema);
const PetServiceCompatibility = mongoose.model('PetServiceCompatibility', compatibilitySchema);
const PetServiceAddon = mongoose.model('PetServiceAddon', addonSchema);
const PetServicePackage = mongoose.model('PetServicePackage', packageSchema);
const PetServiceArea = mongoose.model('PetServiceArea', serviceAreaSchema);

module.exports = {
  Breed,
  PetServiceCategory,
  PetServiceVariant,
  PetServiceCompatibility,
  PetServiceAddon,
  PetServicePackage,
  PetServiceArea,
  CATEGORY_CODES,
  SERVICE_MODES,
  PRICING_UNITS,
};
