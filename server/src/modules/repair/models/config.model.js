const mongoose = require('mongoose');
const { SERVICE_MODES } = require('../service-modes');
const { stripEmptyPoints } = require('../../../utils/geo-point');

/**
 * Centralised, admin-editable configuration for the repair vertical (§42) plus
 * QA checklists (§27) and provider service areas (§17).
 *
 * RepairConfig is a single active document per vertical rather than a bag of
 * key/value rows, because these values are read together on nearly every
 * pricing and ranking call — one cached document beats twenty lookups. Every
 * field here was previously a magic number somewhere in code; changing any of
 * them must not require a deployment.
 *
 * `version` + `isActive` give the same never-overwrite treatment prices get:
 * editing config supersedes the old document instead of mutating it, so an
 * audit can answer "what were the thresholds when this price was approved?"
 */

const rankingWeightsSchema = new mongoose.Schema(
  {
    price: { type: Number, default: 1 },
    partQuality: { type: Number, default: 1 },
    warranty: { type: Number, default: 1 },
    eta: { type: Number, default: 1 },
    distance: { type: Number, default: 1 },
    rating: { type: Number, default: 1 },
    completionRate: { type: Number, default: 1 },
    cancellationRate: { type: Number, default: 1 },
    responseTime: { type: Number, default: 1 },
    skillLevel: { type: Number, default: 1 },
    inventory: { type: Number, default: 1 },
  },
  { _id: false },
);

const repairConfigSchema = new mongoose.Schema(
  {
    // Indexed by the unique partial index below, not here — declaring both
    // makes Mongoose warn about a duplicate index at boot.
    vertical: { type: String, required: true, lowercase: true },

    /* Provider price deviation bands (§12) */
    // Percent deviation from the reference recommended price.
    greenMaxDeviationPct: { type: Number, default: 15 },
    yellowMaxDeviationPct: { type: Number, default: 35 },
    autoApproveGreen: { type: Boolean, default: true },
    blockRed: { type: Boolean, default: true },

    /* Platform economics */
    /**
     * The two sides of ZappyOne's take, and they are charged to different people.
     *
     *   commissionPct     — taken FROM THE PROVIDER, out of what they earn.
     *   platformFeePaise  — added ON TOP for the CUSTOMER, on their bill.
     *
     * Both are read from this document at quote time and frozen into the
     * booking's snapshot, so changing either never rewrites a job already sold.
     * Neither number appears anywhere in code — an operator changes the deal
     * from admin, with no deployment.
     */
    commissionPct: { type: Number, default: 10, min: 0, max: 100 },
    platformFeePaise: { type: Number, default: 0, min: 0 },
    /**
     * Zero until an operator sets the real rate in admin. A wrong tax rate is
     * worse than none: it is collected from customers and owed to the state,
     * and the two verticals had drifted to 2.5% and 18% for the same service.
     */
    taxPct: { type: Number, default: 0, min: 0, max: 100 },
    /**
     * Inspection economics.
     *
     * The inspection fee is charged by ZappyOne, not the provider — it pays for
     * a technician's time when a customer only wants a diagnosis, and it is what
     * stops "free look" bookings from being a cost sink.
     *
     * `inspectionFeeCreditedOnRepair` decides whether that fee comes off the
     * repair bill if the customer then goes ahead. Crediting it is the fairer
     * default: the customer is not charged twice for the same visit, and it
     * removes the reason to hesitate before booking an inspection.
     */
    diagnosisFeePaise: { type: Number, default: 0, min: 0 },
    inspectionFeeCreditedOnRepair: { type: Boolean, default: true },

    /**
     * Whether customers may pay online at all.
     *
     * Off until the payment gateway is live, so the booking screen offers
     * cash only instead of a button that fails. Flipping it on is an admin
     * toggle, not a deploy.
     */
    /**
     * Whether customers may pay online for this vertical.
     *
     * Defaults to FALSE and means exactly what it says: with no payment gateway
     * configured, an online booking is money the platform has promised to
     * collect and has no way to take. The flag is enforced when a booking is
     * created, and the app is told about it so it never offers a method that
     * cannot complete — an option that fails at the last step is worse than one
     * that was never shown.
     *
     * Turning this on requires live gateway keys. Nothing else is needed: cash
     * remains available either way, because most repair work settles that way
     * regardless.
     */
    onlinePaymentsEnabled: { type: Boolean, default: false },

    /**
     * How long each stage of a repair may take.
     *
     * A repair here is an exclusive assignment, not an auction — the job is
     * given to one provider, so they get a working person's window to answer
     * rather than a ride-hail ping. The stages are sized so a routine doorstep
     * job lands comfortably inside three quarters of an hour end to end.
     *
     * These are OPERATIONAL targets, not a promise shown to customers. A
     * customer is told what is happening and when their technician is coming;
     * they are never given a countdown to hold us to, because a queue of one
     * difficult repair should not turn into a broken guarantee.
     *
     * Minutes, admin-editable per vertical.
     */
    sla: {
      /** From assignment to the provider pressing Accept. */
      acceptMinutes: { type: Number, default: 10 },
      /** From accepting to being on the way (doorstep) or starting (workshop). */
      startMinutes: { type: Number, default: 10 },
      /** From starting work to the repair being finished and QA passed. */
      readyMinutes: { type: Number, default: 10 },
      /** From ready to the device being back with the customer. */
      handoverMinutes: { type: Number, default: 10 },
      /** What the whole job should fit inside, for reporting only. */
      totalTargetMinutes: { type: Number, default: 45 },
    },

    /**
     * Collection and return, priced by DISTANCE.
     *
     * A flat fee is the wrong shape for this: a pickup from two streets away
     * and one from thirty kilometres away cost the technician wildly different
     * amounts of time and fuel, and charging both ₹99 either robs the near
     * customer or the far technician. Every ride-hailing service in the country
     * prices a base plus a per-kilometre rate for exactly this reason.
     *
     * `pickupFreeKm` is the radius inside which collection is simply part of
     * the service — worth having, because "free pickup nearby" sells, and the
     * few rupees are not worth an argument with a customer a kilometre away.
     *
     * The legacy flat fields remain as a FALLBACK so an existing config keeps
     * working until someone sets the new ones.
     */
    pickupBaseFeePaise: { type: Number, default: 3000, min: 0 },   // ₹30 to turn up
    pickupPerKmPaise: { type: Number, default: 800, min: 0 },      // ₹8 a km
    pickupFreeKm: { type: Number, default: 2, min: 0 },
    /** Nobody should be surprised by a pickup fee. 0 = uncapped. */
    pickupMaxFeePaise: { type: Number, default: 25000, min: 0 },

    /** Legacy flat fees — used only when the per-km rate is not configured. */
    pickupFeePaise: { type: Number, default: 0, min: 0 },
    returnFeePaise: { type: Number, default: 0, min: 0 },
    minBookingPaise: { type: Number, default: 0, min: 0 },
    maxBookingPaise: { type: Number, default: 0, min: 0 },

    /* Matching and serviceability */
    serviceRadiusKm: { type: Number, default: 10, min: 0 },
    maxProvidersShown: { type: Number, default: 10, min: 1 },
    rankingWeights: { type: rankingWeightsSchema, default: () => ({}) },

    /* Expiry and policy windows */
    quoteExpiryHours: { type: Number, default: 48, min: 1 },
    bookingExpiryMinutes: { type: Number, default: 30, min: 1 },
    warrantyDefaultDays: { type: Number, default: 90, min: 0 },
    cancellationWindowMinutes: { type: Number, default: 15, min: 0 },

    /* Presentation */
    popularBrandLimit: { type: Number, default: 8, min: 1 },
    popularModelLimit: { type: Number, default: 12, min: 1 },

    version: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    supersededAt: { type: Date, default: null },
    updatedById: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

repairConfigSchema.index(
  { vertical: 1 },
  { unique: true, partialFilterExpression: { supersededAt: null } },
);

const qaChecklistItemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    /** Skip automatically when the device cannot power on. */
    requiresPowerOn: { type: Boolean, default: true },
  },
  { _id: false },
);

const qaChecklistSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    vertical: { type: String, required: true, lowercase: true, index: true },

    /** Empty = applies to every repair in the vertical. */
    repairCodes: { type: [String], default: [] },
    modelCodes: { type: [String], default: [] },

    stage: { type: String, enum: ['before', 'after', 'both'], default: 'both' },
    items: { type: [qaChecklistItemSchema], default: [] },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

qaChecklistSchema.index({ vertical: 1, repairCodes: 1, isActive: 1 });
// Unique per vertical, so each vertical can have its own "standard" checklist.
qaChecklistSchema.index({ vertical: 1, code: 1 }, { unique: true });

const serviceAreaSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    cityCode: { type: String, required: true, lowercase: true, index: true },
    areaNames: { type: [String], default: [] },
    pincodes: { type: [String], default: [], index: true },

    /** Geo circle. Providers usually think in radius, not polygons. */
    center: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },
    radiusKm: { type: Number, default: 10, min: 0 },

    /** Which fulfilment modes this provider offers in this area. */
    serviceModes: {
      type: [String],
      enum: SERVICE_MODES,
      default: ['doorstep'],
    },

    /** Workshop address, required when workshop/pickup modes are offered. */
    workshopAddress: { type: String, default: '' },
    workshopLocation: {
      type: { type: String, enum: ['Point'], default: undefined },
      coordinates: { type: [Number], default: undefined },
    },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Both points are optional; neither may reach the index half-written.
stripEmptyPoints(serviceAreaSchema, ['center', 'workshopLocation']);

serviceAreaSchema.index({ center: '2dsphere' });
serviceAreaSchema.index({ cityCode: 1, isActive: 1 });

const RepairConfig = mongoose.model('RepairConfig', repairConfigSchema);
const QAChecklist = mongoose.model('QAChecklist', qaChecklistSchema);
const ProviderServiceArea = mongoose.model('ProviderServiceArea', serviceAreaSchema);

module.exports = { RepairConfig, QAChecklist, ProviderServiceArea };
