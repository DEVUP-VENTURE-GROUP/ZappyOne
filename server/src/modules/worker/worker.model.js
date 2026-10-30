const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, sparse: true },
    // Worker-chosen login ID — approved workers can sign in with
    // username / email / phone + password instead of an OTP every time.
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, minlength: 3, maxlength: 30 },
    passwordHash: { type: String, select: false },

    // Work attributes
    skills: {
      type: [String],
      required: true,
      // No single-field index — dispatch uses Redis skill sets (hot path) or the
      // compound {isOnline,isAvailable,skills} index (Mongo fallback). Redundant index dropped.
    },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    /** How many ratings the average above is made of; 0 means "New", not 5 stars. */
    reviewCount: { type: Number, default: 0 },
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },

    // KYC — multi-state approval workflow
    kyc: {
      status: {
        type: String,
        enum: ['not_submitted', 'pending_review', 'approved', 'rejected', 'suspended'],
        default: 'not_submitted',
        index: true,
      },
      aadhaarUrl: String, // S3 key
      licenseUrl: String,
      selfieUrl: String,
      selfieMetadata: {           // liveness capture metadata
        capturedAt:     Date,
        captureMethod:  String,   // 'live_camera' | 'upload'
        lat:            Number,
        lng:            Number,
        geoStatus:      String,   // 'ok' | 'denied' | 'fetching'
        userAgent:      String,
      },
      isUpdate: { type: Boolean, default: false },

      // 3rd-party API verification results (bank penny-drop, PAN, …). Assists the
      // admin's manual review; auto-populated when a KYC provider is configured.
      verification: {
        bank: { type: mongoose.Schema.Types.Mixed, default: null },
        pan:  { type: mongoose.Schema.Types.Mixed, default: null },
        lastRunAt: { type: Date, default: null },
      },

      // Worker-initiated document change request — must be admin-approved before re-upload
      changeRequest: {
        status:      { type: String, enum: ['pending', 'approved', 'denied'], default: null },
        message:     { type: String, maxlength: 500 },  // worker's reason
        requestedAt: Date,
        reviewedAt:  Date,
        reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        denialReason: String,
      },

      // Admin "Ask Worker" clarification — status stays pending_review but the
      // worker is re-allowed to re-upload + resubmit while this is active.
      clarification: {
        active:      { type: Boolean, default: false },
        message:     { type: String, maxlength: 500 },  // what admin asked to fix
        // The documents asked for again (aadhaarUrl, licenseUrl, selfieUrl); empty = all.
        docCodes:    { type: [String], default: [] },
        requestedAt: Date,
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      },

      // Snapshot of last approved docs — used to revert if an update is rejected
      approvedSnapshot: {
        aadhaarUrl:    String,
        licenseUrl:    String,
        selfieUrl:     String,
        selfieMetadata: mongoose.Schema.Types.Mixed,
        approvedAt:    Date,
      },
      submittedAt: Date,
      reviewedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      rejectionReason: String,
      // Resubmission controls
      rejectionCount: { type: Number, default: 0 },      // lifetime rejections
      lastRejectedAt: Date,                              // last rejection timestamp
      submissionHistory: [{                              // immutable audit trail
        aadhaarUrl: String,
        licenseUrl: String,
        selfieUrl: String,
        submittedAt: Date,
        outcome: String,  // 'pending' | 'approved' | 'rejected'
        rejectionReason: String,
      }],
    },

    // Trust signals — accumulated misconduct flags
    trust: {
      harassmentComplaints: { type: Number, default: 0 },   // safety complaints by users
      harassmentFlaggedAt: Date,                            // when auto-flagged for review
      blockedFromUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // per-user blocks
    },

    // Availability + location — SOURCE OF TRUTH; Redis is a cache.
    isOnline: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: false, index: true },
    // Timestamp of the current online session (set on goOnline, cleared on
    // goOffline). Lets any client show an accurate "online for Xh Ym" that
    // survives a page refresh or a switch between phone and web, instead of a
    // device-local timer that resets. Null when offline.
    onlineSince: { type: Date, default: null },
    /**
     * Auto-accept (jobs/fast-assign): the pro takes the next matching job near
     * them without tapping, so customers are matched at once. Their choice;
     * cancelling an auto-accepted job pauses it (autoAcceptPauseDays).
     */
    // A rate agreed with this partner alone, over their type's (shop/partner-commission); until null = no end.
    // The secret in this partner's own storefront link; bookings that come through it pay the own-link commission (shop/share-link).
    shareCode: { type: String, default: undefined },
    commissionOverride: { pct: { type: Number, default: null, min: 0, max: 50 }, until: { type: Date, default: null }, note: { type: String, default: '', maxlength: 200 }, setBy: { type: mongoose.Schema.Types.ObjectId, default: null }, setAt: { type: Date, default: null } },
    // Jobs taken today and when last, for fair dispatch (jobs/fairness).
    dispatchStats: { day: { type: String, default: null }, jobs: { type: Number, default: 0 }, lastAt: { type: Date, default: null } },
    autoAccept: {
      enabled: { type: Boolean, default: false },
      maxKm: { type: Number, default: null, min: 1, max: 30 },
      pausedUntil: { type: Date, default: null },
    },
    /**
     * ZappyOne's own staff (workforce/): salaried, based at a hub, working
     * booked shifts; job money is ZappyOne's, tips are theirs. Everyone else
     * is a partner paid per job. Set by admin only.
     */
    /**
     * In a partner's team (shopId set; shop/partner.service): a member, or a
     * team lead who sees and assigns their group's jobs. leadId: their lead.
     * lastAssignedAt: when the partner's dispatch last gave them a job (turns).
     */
    team: {
      role: { type: String, enum: ['member', 'lead'], default: 'member' },
      leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
      lastAssignedAt: { type: Date, default: null },
    },
    employment: {
      type: { type: String, enum: ['partner', 'staff'], default: 'partner', index: true },
      hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub', default: null, index: true },
      salaryPaise: { type: Number, default: 0, min: 0 },
      joinedAt: { type: Date, default: null },
      // Permanent ID for the ID card and search (workforce/staff-id), e.g. ZO00012.
      staffId: { type: String, default: null },
    },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      updatedAt: { type: Date, default: Date.now },
      /** Metres, as the phone reported it when they went online. Null: an older app that did not say. */
      accuracyM: { type: Number, default: null },
    },
    currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    /** The hours they take work and their days off (jobs/work-hours). Unset = no rule. */
    workHours: {
      setAt: { type: Date, default: null },
      acceptLater: { type: Boolean, default: true },
      week: { type: [new mongoose.Schema({ day: Number, on: Boolean, from: String, to: String }, { _id: false })], default: undefined },
      daysOff: { type: [String], default: undefined },
    },

    // Optional affiliation with a verified local Shop (shop.model.js) — e.g. a
    // technician employed by "Sharma Mobile Repair". Purely a tag: dispatch's
    // candidate-matching query (isOnline/isAvailable/kyc.approved/skills) never
    // reads this field, so a shop worker stays fully eligible for ordinary
    // Express auto-dispatch. It is read ONLY when an order carries a
    // `preferredShopId` (order.model.js) — dispatch then scopes its candidate
    // pool to workers with a matching shopId instead of open geo-radius search.
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },

    // Financials
    /**
     * Denormalised wallet figures, in PAISE.
     *
     * Money is stored in paise everywhere in this system and converted to
     * rupees only for display. These two are a cache of the authoritative
     * ledger (wallet.model.js + transaction.model.js); when they disagree,
     * the ledger is right and these are rebuilt from it.
     */
    wallet: {
      balance: { type: Number, default: 0 },        // paise
      totalEarnings: { type: Number, default: 0 },  // paise, lifetime
    },

    // Saved payout destinations — worker manages these; used to pre-fill withdrawal forms
    savedBankAccounts: [{
      label:         { type: String, maxlength: 80 },
      accountName:   { type: String, required: true, maxlength: 100 },
      accountNumber: { type: String, required: true, maxlength: 20 },
      bankName:      { type: String, maxlength: 80 },
      ifsc:          { type: String, required: true, maxlength: 11, uppercase: true },
      isDefault:     { type: Boolean, default: false },
      addedAt:       { type: Date, default: Date.now },
    }],
    savedUpiIds: [{
      upiId:     { type: String, required: true, maxlength: 100 },
      label:     { type: String, maxlength: 60 },
      isDefault: { type: Boolean, default: false },
      addedAt:   { type: Date, default: Date.now },
    }],

    // Skill specialisation — primary skill for priority dispatch + higher-paying job unlock
    skillPrimary: { type: String, default: null },

    // Training certifications earned through in-app modules
    certifications: [{
      moduleId:   { type: String, required: true },
      moduleName: { type: String, required: true },
      score:      { type: Number, default: 0 },
      earnedAt:   { type: Date, default: Date.now },
    }],

    // Detailed service expertise, per category. `skills` above stays the flat
    // dispatch match-set (hot path); this is the rich, customer-facing breakdown the
    // worker configures in their portal and that powers the booking worker-comparison.
    // `skills` is kept in sync from expertise.services on update.
    expertise: [{
      category:        { type: String, required: true },   // 'mobile' | 'laptop' | 'car' | ...
      brands:          { type: [String], default: [] },     // ['Apple','Samsung'] — empty = all brands
      services:        { type: [String], default: [] },     // issue/service codes handled
      yearsExperience: { type: Number, default: 0, min: 0, max: 60 },
      certUrls:        { type: [String], default: [] },      // S3 keys of uploaded proof/certs
    }],

    // Earnings goals (daily / weekly targets set by worker)
    goals: [{
      period:      { type: String, enum: ['daily', 'weekly'], required: true },
      targetPaise: { type: Number, required: true, min: 100 },
      setAt:       { type: Date, default: Date.now },
    }],

    // Persistent penalty stats — source of truth for dispatch score degradation.
    // Redis sliding window in abuse.service is the short-term signal;
    // this is the lifetime ledger used for scoring and admin reports.
    penalties: {
      totalOffers:    { type: Number, default: 0 },  // offers received
      totalRejects:   { type: Number, default: 0 },  // rejected/timed-out offers
      rejectStreak:   { type: Number, default: 0 },  // offers passed in a row since the last accept (jobs/offer-streak)
      totalCancels:   { type: Number, default: 0 },  // worker-initiated cancellations
      totalNoShows:   { type: Number, default: 0 },  // no-show on completed disputes
      lastPenaltyAt:  { type: Date },
      // Handed back too many jobs in a day (jobs/give-back): cannot go online until then.
      pausedUntil:    { type: Date, default: null },
    },

    // Emergency contact for SOS feature
    emergencyContact: {
      name:  { type: String, maxlength: 100 },
      phone: { type: String, maxlength: 15 },
    },

    // Profile photo — set from KYC selfie S3 key when KYC is approved
    profilePhotoKey: { type: String, default: null },

    // Onboarding — set to true after worker completes name + skills + emergency contact
    onboardingComplete: { type: Boolean, default: false },

    // Ops
    deviceTokens: [String], // FCM push tokens
    deviceIds:    [String], // hardware fingerprints (for multi-account detection)
    // Trusted-device binding for re-login security. A sign-in from a device not
    // in this list (on an established account) is flagged + alerted.
    knownDevices: [{
      deviceId:    { type: String },
      firstSeenAt: { type: Date, default: Date.now },
      lastSeenAt:  { type: Date, default: Date.now },
      trusted:     { type: Boolean, default: true },
    }],
    lastNewDeviceAt: { type: Date, default: null },
    isBlocked: { type: Boolean, default: false },
    lastSeenAt: { type: Date },

    // Soft delete — data kept for compliance/fraud audit, worker can no longer log in
    deletedAt:      { type: Date, default: null },
    deletedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    deletionReason: { type: String, default: null },
  },
  { timestamps: true }
);

// CRITICAL: Compound geo index used by the matcher.
workerSchema.index({ 'trust.blockedFromUserIds': 1 }, { sparse: true });
workerSchema.index({ currentLocation: '2dsphere' });
// Unique only among real codes; partners without one yet are not indexed.
workerSchema.index({ shareCode: 1 }, { unique: true, partialFilterExpression: { shareCode: { $type: 'string' } } });
workerSchema.index({ isOnline: 1, isAvailable: 1, skills: 1 });
// Dispatch rating filter: used in geo.service.js Worker.find() on every candidate batch
workerSchema.index({ 'kyc.status': 1, rating: -1, isBlocked: 1 });
// Admin worker list: most common filter combination
workerSchema.index({ isOnline: 1, 'kyc.status': 1, createdAt: -1 });

// Password, verified email and first-time setup, shared by every account type.
workerSchema.plugin(require('../account/account.plugin'));

workerSchema.index({ 'employment.staffId': 1 }, { unique: true, partialFilterExpression: { 'employment.staffId': { $type: 'string' } } });

module.exports = mongoose.model('Worker', workerSchema);
