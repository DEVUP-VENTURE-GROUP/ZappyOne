const mongoose = require('mongoose');

/**
 * Provider onboarding — what a service provider can sign up to do, and what we
 * must verify before they are allowed to do it.
 *
 * The shape is deliberately two levels, because that is how providers actually
 * describe themselves:
 *
 *   Domain      Electronics, Vehicles, Family Assist, Home Services
 *   Service line  Mobile Phones, Laptops, 2-Wheeler, 3-Wheeler, …
 *
 * A line may point at a repair vertical (`repairVertical: 'mobile'`), which is
 * how this connects to the engine already built: once a provider is approved
 * for that line, the existing repair provider setup — capabilities, service
 * areas, pricing, inventory — takes over unchanged.
 *
 * Three rules run through this file:
 *
 *   NOTHING IS HARDCODED. Domains, lines and the documents each one demands are
 *   rows an admin edits. Adding "Air Conditioning" is a row, not a deploy.
 *
 *   KYC IS PER SERVICE LINE, NOT PER ACCOUNT. A shop verified to repair phones
 *   has proven nothing about servicing a scooter — different documents,
 *   different premises, different liability. Approval is therefore recorded
 *   against the (provider, line) pair.
 *
 *   PROVIDERS ARE SHOPS *OR* INDIVIDUALS. The same line asks different things
 *   of each: a shop shows a storefront and GST, an individual shows Aadhaar and
 *   a selfie. Requirements are resolved per provider kind.
 */

const PROVIDER_KINDS = ['shop', 'individual'];

const ENROLMENT_STATUSES = [
  'draft',            // provider picked the line, has not submitted anything yet
  'pending_review',   // submitted, waiting on admin
  'approved',         // may take work on this line
  'rejected',         // admin declined; provider may fix and resubmit
  'suspended',        // was approved, revoked later
];

/* Domain — the top-level bucket a provider signs up under */

const serviceDomainSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    /** Lucide icon name; the client maps it to a component with a fallback. */
    icon: { type: String, default: '' },
    /** Hero image shown to customers. Blank falls back to the icon. */
    imageUrl: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

/* Service line — the actual thing the provider does */

const serviceLineSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    domainCode: { type: String, required: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },

    /**
     * The repair vertical this line hands off to, when it has one.
     *
     * Set for Mobile and Laptop, which already have a complete engine behind
     * them. Null for lines whose delivery flow is not built yet — those are
     * marked `coming_soon` and cannot be enrolled in, rather than accepting
     * providers into a queue that goes nowhere.
     */
    repairVertical: { type: String, default: null, lowercase: true },

    status: {
      type: String,
      enum: ['live', 'coming_soon'],
      default: 'coming_soon',
      index: true,
    },


    /**
     * Customer-facing presentation.
     *
     * `customerPath` is where tapping this service takes a customer. It is a
     * field rather than a lookup so a new service can point at whatever flow
     * serves it — a repair vertical today, something else tomorrow — without
     * the home page needing to know the mapping.
     */
    customerPath: { type: String, default: '' },
    tagline: { type: String, default: '' },
    /**
     * Which character artwork the home grid should use. Falls back to the
     * repair vertical, so a line wired to an existing engine looks right
     * without anyone setting this.
     */
    artKey: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    isPopular: { type: Boolean, default: false },

    /** Which kinds of provider may take this line at all. */
    providerKinds: {
      type: [String],
      enum: PROVIDER_KINDS,
      default: PROVIDER_KINDS,
    },

    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

serviceLineSchema.index({ domainCode: 1, displayOrder: 1, isActive: 1 });

/* What must be verified, per line, per provider kind */

const requirementDocumentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    /** Shown under the upload box — say what a GOOD submission looks like. */
    hint: { type: String, default: '' },
    kind: { type: String, enum: ['image', 'pdf', 'any'], default: 'image' },

    /**
     * Force a live camera capture instead of a file upload.
     *
     * '' — any file is fine (a GST certificate is a PDF someone already has).
     * 'user' — front camera: a selfie proves the person is here, now. Letting it
     *          come from the gallery makes it a photo of a photo, which is
     *          exactly what identity fraud looks like.
     * 'environment' — rear camera: a storefront or workbench photo has to be
     *          taken AT the premises, and the capture carries a location fix.
     */
    capture: { type: String, enum: ['', 'user', 'environment'], default: '' },

    required: { type: Boolean, default: true },
  },
  { _id: false },
);

const requirementFieldSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    hint: { type: String, default: '' },
    /** Optional client+server validation, e.g. a GST or PAN format. */
    pattern: { type: String, default: '' },
    required: { type: Boolean, default: true },
  },
  { _id: false },
);

/**
 * A requirement set answers: "to do THIS line, as THIS kind of provider, what
 * do you have to show us?"
 *
 * Sets resolve most-specific-first — a set naming a line beats a domain-wide
 * one — so an admin writes the common case once and overrides only where a
 * line genuinely differs.
 */
const kycRequirementSetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    domainCode: { type: String, required: true, lowercase: true, index: true },
    /** Null = applies to every line in the domain. */
    lineCode: { type: String, default: null, lowercase: true, index: true },
    providerKind: { type: String, enum: PROVIDER_KINDS, required: true, index: true },

    documents: { type: [requirementDocumentSchema], default: [] },
    fields: { type: [requirementFieldSchema], default: [] },

    /** Free-text conditions the provider must accept (insurance, tooling…). */
    declarations: { type: [String], default: [] },

    /** Minimum repair skill level, for lines wired to the repair engine. */
    minSkillLevel: { type: Number, default: null },

    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// One live set per (domain, line, kind) — two would make resolution arbitrary.
kycRequirementSetSchema.index(
  { domainCode: 1, lineCode: 1, providerKind: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } },
);

/* The provider's own enrolment in one line */

const submittedDocumentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },

    /**
     * How this file arrived, recorded at capture time.
     *
     * A reviewer's whole job on an identity document is deciding whether to
     * believe it, so 'live_camera' with a location fix is worth far more than
     * an image that could have come from anywhere — the same signal the worker
     * KYC queue already surfaces.
     */
    captureMethod: { type: String, enum: ['live_camera', 'upload'], default: 'upload' },
    capturedAt: { type: Date, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    /** Brought over from the person's identity on file (onboarding/identity.js), not uploaded here. */
    carried: { type: Boolean, default: false },
  },
  { _id: false },
);

const submittedFieldSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, lowercase: true },
    value: { type: String, default: '' },
  },
  { _id: false },
);

const providerEnrolmentSchema = new mongoose.Schema(
  {
    providerKind: { type: String, enum: PROVIDER_KINDS, required: true, index: true },
    /** Exactly one of these is set, matching providerKind. */
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    domainCode: { type: String, required: true, lowercase: true, index: true },
    lineCode: { type: String, required: true, lowercase: true, index: true },

    status: { type: String, enum: ENROLMENT_STATUSES, default: 'draft', index: true },

    documents: { type: [submittedDocumentSchema], default: [] },
    fields: { type: [submittedFieldSchema], default: [] },
    acceptedDeclarations: { type: Boolean, default: false },

    /**
     * The requirement set this submission was judged against, frozen at submit
     * time. Requirements change; a decision must stay explicable against the
     * rules that were actually in force when it was made.
     */
    requirementSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'KycRequirementSet', default: null },

    submittedAt: { type: Date, default: null },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

// A provider enrols in a given line once. Re-applying edits the same record,
// which keeps its history rather than scattering duplicates across reviews.
providerEnrolmentSchema.index({ shopId: 1, lineCode: 1 }, { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } });
providerEnrolmentSchema.index({ workerId: 1, lineCode: 1 }, { unique: true, partialFilterExpression: { workerId: { $type: 'objectId' } } });
providerEnrolmentSchema.index({ status: 1, updatedAt: -1 });

/** The owner side of an enrolment, in the shape the rest of the code uses. */
providerEnrolmentSchema.methods.ownerRef = function ownerRef() {
  return this.providerKind === 'shop'
    ? { kind: 'shop', id: this.shopId }
    : { kind: 'worker', id: this.workerId };
};

/* "The service I do isn't listed" */

/**
 * A provider proposing a line we do not carry.
 *
 * Kept as a request rather than letting providers create catalog rows: a line
 * carries pricing, KYC rules and a delivery flow, none of which a signup form
 * can invent. Admin reviews it and, if it is real, creates the line properly.
 */
const serviceLineRequestSchema = new mongoose.Schema(
  {
    providerKind: { type: String, enum: PROVIDER_KINDS, required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

    domainCode: { type: String, default: '', lowercase: true, index: true },
    proposedName: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 1000 },
    /** How many providers asked for the same thing — demand, not noise. */
    requestCount: { type: Number, default: 1 },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    resultLineCode: { type: String, default: null },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

serviceLineRequestSchema.index({ status: 1, requestCount: -1, createdAt: -1 });

module.exports = {
  PROVIDER_KINDS,
  ENROLMENT_STATUSES,
  ServiceDomain: mongoose.model('ServiceDomain', serviceDomainSchema),
  ServiceLine: mongoose.model('ServiceLine', serviceLineSchema),
  KycRequirementSet: mongoose.model('KycRequirementSet', kycRequirementSetSchema),
  ProviderEnrolment: mongoose.model('ProviderEnrolment', providerEnrolmentSchema),
  ServiceLineRequest: mongoose.model('ServiceLineRequest', serviceLineRequestSchema),
};
