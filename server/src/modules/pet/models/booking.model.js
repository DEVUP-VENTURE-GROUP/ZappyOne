/**
 * A Pet Services booking — one job, one or more animals, one provider.
 *
 * THREE THINGS THIS MODEL EXISTS TO GET RIGHT:
 *
 *   1. THE SNAPSHOT IS IMMUTABLE (§35). What the pet was, what the service
 *      cost, which add-ons were bought and who the provider was are frozen at
 *      confirmation. An admin raising the price of grooming next month must
 *      not silently rewrite what a customer already agreed to, and a pet that
 *      later changes size must not change what a finished job cost.
 *
 *   2. MULTI-PET IS PER-PET (§33). Two dogs and a cat on one booking is three
 *      priced lines, not one price times three — they may be different sizes
 *      getting different services with different add-ons. Storing a single
 *      figure would make that impossible to refund or dispute correctly.
 *
 *   3. A HELD BED IS A REAL BED (§64, §65). Boarding overlaps are checked
 *      against a finite capacity, atomically, before a booking can exist.
 *      Two customers confirming the last kennel at the same instant is the
 *      failure that loses a customer permanently.
 */

const mongoose = require('mongoose');
const { pointField, stripEmptyPoints } = require('../../../utils/geo-point');
const { SPECIES, PET_SIZES } = require('../../service/pet-passport.model');
const { SERVICE_MODES } = require('./catalog.model');

/* State machine (§34) */

const BOOKING_STATUSES = [
  'REQUESTED',
  'PRICE_PENDING',
  'AWAITING_CUSTOMER_APPROVAL',
  'BOOKED',
  'PROVIDER_SEARCHING',
  'PROVIDER_ASSIGNED',
  'PROVIDER_ACCEPTED',
  'PROVIDER_EN_ROUTE',
  'PROVIDER_ARRIVED',
  'PET_HANDOVER',
  'SERVICE_STARTED',
  'SERVICE_PAUSED',
  'SERVICE_COMPLETED',
  'CUSTOMER_CONFIRMATION',
  'PAYMENT_PENDING',
  'PAYMENT_COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'REFUNDED',
  'CLOSED',
];

/**
 * Legal moves. Not every service uses every state — a walk never reaches
 * PET_HANDOVER twice, a home-care visit has no handover at all — so the map
 * is permissive about SKIPPING states and strict about going backwards or
 * jumping to a terminal state.
 */
const TRANSITIONS = {
  REQUESTED: ['PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'BOOKED', 'PROVIDER_SEARCHING', 'CANCELLED'],
  PRICE_PENDING: ['AWAITING_CUSTOMER_APPROVAL', 'BOOKED', 'CANCELLED'],
  AWAITING_CUSTOMER_APPROVAL: ['BOOKED', 'CANCELLED'],
  BOOKED: ['PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'CANCELLED'],
  PROVIDER_SEARCHING: ['PROVIDER_ASSIGNED', 'CANCELLED'],
  PROVIDER_ASSIGNED: ['PROVIDER_ACCEPTED', 'PROVIDER_SEARCHING', 'CANCELLED'],
  PROVIDER_ACCEPTED: ['PROVIDER_EN_ROUTE', 'PET_HANDOVER', 'SERVICE_STARTED', 'PROVIDER_SEARCHING', 'CANCELLED'],
  PROVIDER_EN_ROUTE: ['PROVIDER_ARRIVED', 'CANCELLED'],
  PROVIDER_ARRIVED: ['PET_HANDOVER', 'SERVICE_STARTED', 'CANCELLED'],
  PET_HANDOVER: ['SERVICE_STARTED', 'CANCELLED'],
  SERVICE_STARTED: ['SERVICE_PAUSED', 'SERVICE_COMPLETED', 'DISPUTED'],
  SERVICE_PAUSED: ['SERVICE_STARTED', 'SERVICE_COMPLETED', 'DISPUTED'],
  SERVICE_COMPLETED: ['CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'DISPUTED'],
  CUSTOMER_CONFIRMATION: ['PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'DISPUTED'],
  PAYMENT_PENDING: ['PAYMENT_COMPLETED', 'DISPUTED', 'CANCELLED'],
  PAYMENT_COMPLETED: ['CLOSED', 'DISPUTED', 'REFUNDED'],
  DISPUTED: ['REFUNDED', 'CLOSED', 'PAYMENT_COMPLETED'],
  REFUNDED: ['CLOSED'],
  CANCELLED: ['REFUNDED', 'CLOSED'],
  CLOSED: [],
};

/** Before the provider has set off, cancelling is cheap. After, it is not. */
const CANCELLABLE_FROM = [
  'REQUESTED', 'PRICE_PENDING', 'AWAITING_CUSTOMER_APPROVAL', 'BOOKED',
  'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED',
  'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'PET_HANDOVER', 'PAYMENT_PENDING',
];

/** Statuses that occupy a boarding bed, for the capacity check. */
const OCCUPYING_STATUSES = [
  'BOOKED', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE',
  'PROVIDER_ARRIVED', 'PET_HANDOVER', 'SERVICE_STARTED', 'SERVICE_PAUSED',
];

/* Per-pet lines (§33, §35) */

const bookingPetSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'PetPassport', required: true },

    /**
     * Frozen copy of the pet as it was. A pet later recorded as "large" must
     * not retroactively change what a groom on a medium dog cost, and a
     * provider reading an old booking should see what they were actually told.
     */
    snapshot: {
      name: String,
      species: { type: String, enum: SPECIES },
      breedCode: String,
      breed: String,
      size: { type: String, enum: PET_SIZES },
      weight: Number,
      temperament: String,
      biteRisk: String,
      escapeRisk: String,
      allergies: [String],
      specialHandling: String,
      /** Exactly the brief the provider was shown, kept for disputes. */
      handlingBrief: mongoose.Schema.Types.Mixed,
    },

    /** Pets on one booking may be getting different things. */
    variantCode: { type: String, required: true, lowercase: true },
    durationMinutes: { type: Number, default: null },
    addonCodes: { type: [String], default: [] },

    /** This pet's own money — the booking total is the sum of these. */
    basePaise: { type: Number, default: 0, min: 0 },
    sizeAdjustmentPaise: { type: Number, default: 0 },
    breedAdjustmentPaise: { type: Number, default: 0 },
    addonsPaise: { type: Number, default: 0, min: 0 },
    /** Discount for being the second or third animal on one visit. */
    additionalPetDiscountPaise: { type: Number, default: 0, min: 0 },
    linePaise: { type: Number, default: 0, min: 0 },

    /** Per-pet outcome, since one pet can be refused while others proceed. */
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'refused', 'cancelled'],
      default: 'pending',
    },
    refusalReason: { type: String, default: '' },
    providerNotes: { type: String, default: '' },
  },
  { _id: true },
);

/* Money (§60) */

const pricingSnapshotSchema = new mongoose.Schema(
  {
    /** Sum of the per-pet lines, before travel/fees. */
    servicesPaise: { type: Number, default: 0, min: 0 },
    addonsPaise: { type: Number, default: 0, min: 0 },
    travelPaise: { type: Number, default: 0, min: 0 },
    pickupPaise: { type: Number, default: 0, min: 0 },
    returnPaise: { type: Number, default: 0, min: 0 },
    waitingPaise: { type: Number, default: 0, min: 0 },
    overtimePaise: { type: Number, default: 0, min: 0 },
    specialHandlingPaise: { type: Number, default: 0, min: 0 },
    /** Multi-night boarding discount, or a package discount. */
    stayDiscountPaise: { type: Number, default: 0, min: 0 },
    couponPaise: { type: Number, default: 0, min: 0 },
    discountPaise: { type: Number, default: 0, min: 0 },

    subtotalPaise: { type: Number, default: 0, min: 0 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },

    commissionPaise: { type: Number, default: 0, min: 0 },
    providerAmountPaise: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'INR' },
    distanceKm: { type: Number, default: null },
    nights: { type: Number, default: null },
    /** Which rule produced this, so a number can always be explained. */
    pricingRuleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    appliedMultipliers: mongoose.Schema.Types.Mixed,
    snapshotAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/* Execution & proof (§38, §39) */

const proofSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: [
        'before', 'after', 'handover_out', 'handover_in', 'arrival',
        'checklist', 'daily_update', 'incident', 'report', 'other',
      ],
      required: true,
    },
    key: { type: String, required: true },
    note: { type: String, default: '' },
    petId: { type: mongoose.Schema.Types.ObjectId, default: null },
    capturedAt: { type: Date, default: Date.now },
    location: pointField({}),
  },
  { _id: false },
);

const executionSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    checkInLocation: pointField({}),
    checkOutLocation: pointField({}),

    /** Completed checklist items, by code. */
    checklist: {
      type: [{
        code: { type: String, required: true },
        label: { type: String, default: '' },
        done: { type: Boolean, default: false },
        note: { type: String, default: '' },
        _id: false,
      }],
      default: [],
    },

    /* Walk / activity tracking (§15) */
    distanceKm: { type: Number, default: null },
    actualMinutes: { type: Number, default: null },
    waitingMinutes: { type: Number, default: 0 },

    providerNotes: { type: String, default: '' },
    /**
     * An observation, never a diagnosis (§21, §22). A provider may record
     * that an animal is limping; they may not record that it has a fracture.
     */
    observations: { type: String, default: '' },
    incidentReported: { type: Boolean, default: false },
    incidentDetail: { type: String, default: '' },
  },
  { _id: false },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    byRole: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

/* The booking */

const petBookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    /** Frozen provider identity, so a renamed shop does not rewrite history. */
    providerSnapshot: {
      name: String,
      providerType: String,
      phone: String,
      rating: Number,
    },

    categoryCode: { type: String, required: true, lowercase: true, index: true },
    serviceMode: { type: String, enum: SERVICE_MODES, required: true },
    pets: { type: [bookingPetSchema], default: [] },

    status: { type: String, enum: BOOKING_STATUSES, default: 'REQUESTED', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },

    /* When */
    scheduledAt: { type: Date, default: null, index: true },
    /** Boarding and daycare occupy a range, not an instant. */
    checkInAt: { type: Date, default: null, index: true },
    checkOutAt: { type: Date, default: null, index: true },
    nights: { type: Number, default: null },

    /* Where */
    serviceLocation: pointField({ address: String }),
    destination: pointField({ address: String }),
    serviceAreaCode: { type: String, default: null, lowercase: true },

    pricing: { type: pricingSnapshotSchema, required: true },
    packageCode: { type: String, default: null, lowercase: true },
    /** Set when this booking consumed a session from a bought package. */
    packageSubscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null },

    execution: { type: executionSchema, default: () => ({}) },
    proofs: { type: [proofSchema], default: [] },

    /** Generated occurrences point back at the schedule that made them. */
    recurringId: { type: mongoose.Schema.Types.ObjectId, ref: 'PetRecurringBooking', default: null, index: true },
    occurrenceIndex: { type: Number, default: null },

    customerInstructions: { type: String, default: '', maxlength: 2000 },
    handoverOtp: { type: String, default: '' },
    handoverVerifiedAt: { type: Date, default: null },

    // Cash by default: online is chosen explicitly, and only while the gateway is live.
    paymentMethod: { type: String, enum: ['cash', 'online', 'wallet'], default: 'cash' },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending',
      index: true,
    },
    paymentId: { type: String, default: null },
    refundPaise: { type: Number, default: 0, min: 0 },

    cancellationPolicyCode: { type: String, default: null },
    cancelledBy: { type: String, enum: ['customer', 'provider', 'admin', null], default: null },
    cancellationReason: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    penaltyPaise: { type: Number, default: 0, min: 0 },
    providerCompensationPaise: { type: Number, default: 0, min: 0 },

    idempotencyKey: { type: String, default: null, index: true, sparse: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

stripEmptyPoints(petBookingSchema, ['serviceLocation', 'destination']);

petBookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
petBookingSchema.index({ workerId: 1, status: 1, scheduledAt: 1 });
petBookingSchema.index({ shopId: 1, status: 1, checkInAt: 1, checkOutAt: 1 });
petBookingSchema.index({ categoryCode: 1, status: 1, scheduledAt: 1 });
petBookingSchema.index({ serviceLocation: '2dsphere' });
petBookingSchema.index({ 'pets.petId': 1, status: 1 });

petBookingSchema.methods.canTransition = function canTransition(next) {
  return (TRANSITIONS[this.status] || []).includes(next);
};

petBookingSchema.methods.transitionTo = function transitionTo(next, meta = {}) {
  if (!this.canTransition(next)) {
    const err = new Error(`Cannot move a booking from ${this.status} to ${next}`);
    err.status = 409;
    err.code = 'ILLEGAL_TRANSITION';
    throw err;
  }
  this.status = next;
  this.statusHistory.push({
    status: next, at: new Date(), by: meta.by || null, byRole: meta.byRole || '', note: meta.note || '',
  });
  if (next === 'SERVICE_STARTED' && !this.execution.startedAt) this.execution.startedAt = new Date();
  if (next === 'SERVICE_COMPLETED' && !this.execution.completedAt) this.execution.completedAt = new Date();
  if (next === 'CANCELLED' && !this.cancelledAt) this.cancelledAt = new Date();
  return this;
};

/** Beds occupied by this booking — a two-dog stay uses two of them. */
petBookingSchema.methods.bedCount = function bedCount() {
  return (this.pets || []).filter((p) => p.status !== 'cancelled').length;
};

const PetBooking = mongoose.model('PetBooking', petBookingSchema);

module.exports = {
  PetBooking,
  BOOKING_STATUSES,
  TRANSITIONS,
  CANCELLABLE_FROM,
  OCCUPYING_STATUSES,
};
