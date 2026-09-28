const mongoose = require('mongoose');

/**
 * PricingConfig — singleton-ish (one active row at a time, history kept).
 *
 * Why DB-backed when we already have Redis hot config?
 *   - Audit trail (versioning) — every change keeps a row
 *   - Source-of-truth that survives Redis flushes
 *   - Service-level overrides for ac_repair vs puncture etc.
 *
 * The pricing service hot-reads from Redis cache → falls back to DB → falls
 * back to env defaults. Admin updates write to BOTH DB and Redis.
 */
const serviceOverrideSchema = new mongoose.Schema(
  {
    service: { type: String, required: true },
    multiplier: { type: Number, default: 1.0 },
    minFarePaise: Number, // optional service-specific floor
  },
  { _id: false }
);

const pricingConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, unique: true, index: true },

    baseFeePaise: { type: Number, required: true, default: 4000 },     // ₹40
    perKmFeePaise: { type: Number, required: true, default: 1200 },    // ₹12 per km
    perMinFeePaise: { type: Number, required: true, default: 200 },    // ₹2 per min
    platformFeePaise: { type: Number, required: true, default: 1000 }, // ₹10
    minFarePaise: { type: Number, required: true, default: 6000 },     // ₹60

    serviceOverrides: { type: [serviceOverrideSchema], default: [] },

    // Surge controls
    surgeEnabled: { type: Boolean, default: true },
    surgeMaxCap: { type: Number, default: 2.5, min: 1.0, max: 5.0 },
    // Max price increase (%) between quote and submit before order is blocked.
    // 0.10 = 10%. User must re-confirm if price spiked beyond this threshold.
    surgeTolerancePct: { type: Number, default: 0.10, min: 0.02, max: 0.50 },

    // Auto-pricing: Night surcharge
    nightSurchargeEnabled:    { type: Boolean, default: false },
    nightSurchargeMultiplier: { type: Number,  default: 1.3, min: 1.0, max: 3.0 },
    nightStartHour:           { type: Number,  default: 22,  min: 0,   max: 23  },
    nightEndHour:             { type: Number,  default: 6,   min: 0,   max: 23  },

    // Auto-pricing: Rain surcharge
    rainSurchargeEnabled:    { type: Boolean, default: false },
    rainSurchargeMultiplier: { type: Number,  default: 1.2, min: 1.0, max: 3.0 },
    // Epoch ms — rain surcharge active until this timestamp. null = not active.
    rainActiveUntil: { type: Date, default: null },

    // Auto-pricing: Weekend surcharge
    weekendSurchargeEnabled:    { type: Boolean, default: false },
    weekendSurchargeMultiplier: { type: Number,  default: 1.1, min: 1.0, max: 2.0 },

    // Auto-pricing: Peak hour surcharge
    peakHourSurchargeEnabled: { type: Boolean, default: false },
    // [{ label: string, startHour: 0-23, endHour: 0-23, multiplier: number }]
    peakHourRanges: { type: Array, default: [] },

    // Commission (workers' platform cut)
    commissionRate: { type: Number, default: 0.30, min: 0, max: 0.5 }, // 30%
    // Reduced commission rate when customer used a coupon/promo code.
    // Platform absorbs the coupon marketing cost; worker keeps more.
    couponCommissionRate: { type: Number, default: 0.15, min: 0, max: 0.5 }, // 15%

    // Dispatch kill-switch
    // When false, the dispatch worker re-queues all jobs with a 60s delay instead
    // of processing them. Admin can re-enable to drain the queue normally.
    dispatchEnabled: { type: Boolean, default: true },

    // Dispatch / worker behaviour
    // Force-assign bonus credited to workers who get auto-assigned (no voluntary accept)
    forceAssignBonusPaise: { type: Number, default: 1500 },        // ₹15

    // Acceptance-first dispatch (never force a non-consenting worker)
    // When OFF (default) dispatch never force-assigns: if nobody voluntarily
    // accepts, the order fails gracefully with a full refund instead of shoving
    // the job onto a reluctant worker (who would likely cancel/ghost).
    // Admin can flip this ON to keep force-assign as a last resort.
    forceAssignEnabled:      { type: Boolean, default: false },

    // Geo-readiness gate
    // Rejects an order outright when no skilled worker is within radius, instead of
    // letting it sit in 'searching' and fail later. Admin-controlled (not env-only)
    // so it can be killed INSTANTLY if it starts rejecting real bookings — on a thin
    // day-1 supply this gate is the fastest way to lose a paying customer, and an
    // SSH + .env edit + restart is not an acceptable response time.
    // null = defer to env / NODE_ENV default.
    geoReadinessEnabled:     { type: Boolean, default: null },
    geoReadinessKm:          { type: Number,  default: 25 },

    // Growing "high-demand" accept bonus — platform-funded incentive shown in the
    // offer that grows as the search radius widens, so workers OPT IN voluntarily.
    // Credited on COMPLETION (not accept) so it can't be farmed by accept-then-cancel.
    urgencyBonusEnabled:     { type: Boolean, default: true },
    urgencyBonusStartStep:   { type: Number,  default: 4 },        // kicks in once search expands past ~1km
    urgencyBonusStepPaise:   { type: Number,  default: 500 },      // +₹5 per step beyond start
    urgencyBonusMaxPaise:    { type: Number,  default: 3000 },     // cap ₹30
    // Best-first: give the top-scored pro a short exclusive head-start before the
    // broadcast, so the BEST worker wins — not merely the fastest to tap.
    bestFirstEnabled:        { type: Boolean, default: true },
    bestFirstWindowMs:       { type: Number,  default: 8000 },     // exclusive window per top pro
    bestFirstTopN:           { type: Number,  default: 1 },        // how many top pros get the head-start

    // ZeroWait Instant Match
    // L0 — tier-scaled accept bonus. Express/Priority customers pay more, so the
    // worker's incentive scales too — otherwise a paid tier looks identical to a
    // worker and nothing makes them prefer it.
    tierBonusMultiplierExpress:  { type: Number, default: 2.0 },
    tierBonusMultiplierPriority: { type: Number, default: 1.5 },
    // Express should dangle a bonus from the very first step (no slow ramp).
    expressBonusFromStep0:       { type: Boolean, default: true },

    // L1 — Ready Pool (pre-accept). Idle, high-trust workers opt in to auto-accept
    // the next matching job, so dispatch can lock a worker with NO offer/accept
    // round-trip — sub-second matching.
    readyPoolEnabled:       { type: Boolean, default: true },
    readyMaxMinutes:        { type: Number,  default: 20 },    // Ready Mode auto-expires
    readyDefaultRadiusKm:   { type: Number,  default: 5 },
    readyBonusPaise:        { type: Number,  default: 2000 },  // ₹20, paid on COMPLETION
    readyMinRating:         { type: Number,  default: 4.0 },   // trust gate
    readyMinAcceptRate:     { type: Number,  default: 0.6 },
    readyMinCompletedJobs:  { type: Number,  default: 5 },
    readyCancelBanHours:    { type: Number,  default: 24 },    // ghost after auto-accept → banned
    readyTiersOnly:         { type: [String], default: [] },   // [] = all tiers

    // L2 — Warm Dispatch: pre-compute ranked candidates while the customer is still
    // on checkout, so assignment on confirm is instant. No worker is notified.
    warmDispatchEnabled:    { type: Boolean, default: true },
    warmTtlSec:             { type: Number,  default: 90 },

    // L3 — Predictive positioning: pay idle workers to move into predicted-demand
    // zones BEFORE orders land, so the Ready Pool is dense where demand appears.
    positioningEnabled:     { type: Boolean, default: true },
    positioningBonusPaise:  { type: Number,  default: 3000 },  // ₹30 to relocate
    positioningMinGap:      { type: Number,  default: 2 },     // demand−supply to call a zone "hot"
    // Dispatch reject-rate threshold — above this → worker auto-offline
    workerAutoOfflineRejectRate: { type: Number, default: 0.70 },   // 70%
    // Dispatch reject-rate early-warning threshold
    workerRejectWarnRate: { type: Number, default: 0.50 },          // 50%
    // Dispatch scoring weights
    rejectRatePenaltyWeight: { type: Number, default: 3.0 },
    cancelRatePenaltyWeight: { type: Number, default: 5.0 },
    // Minimum worker rating to appear in dispatch
    minWorkerRating: { type: Number, default: 3.0 },

    // Stale order watchdog
    staleNudgeMinutes: { type: Number, default: 5 },         // nudge after X min assigned
    staleRedispatchMinutes: { type: Number, default: 10 },   // re-dispatch after X min
    staleOtwAlertMinutes: { type: Number, default: 20 },     // on_the_way alert after X min

    // Tip caps
    tipMaxPaise: { type: Number, default: 50000 },           // ₹500 max tip
    tipOptions: { type: [Number], default: [20, 50, 100] },  // quick tip buttons (₹)

    // Offer Boost (pre-acceptance incentive)
    // Boost is the optional pre-acceptance incentive shown during searching phase.
    // 100% of boost goes to worker earnings. Admin controls amounts, max, and
    // whether the feature is enabled at all.
    boostEnabled:         { type: Boolean, default: true },
    boostOptions:         { type: [Number], default: [10, 20, 30, 50, 100] }, // ₹ options shown in UI
    boostMaxPaise:        { type: Number, default: 20000 },   // ₹200 max boost per order
    // dispatch weight: higher boost → higher priority score in dispatch scoring
    // Value of 1.0 = no effect; 2.0 = ₹10 boost counts as 20 in scoring
    boostDispatchWeight:  { type: Number, default: 1.5, min: 1.0, max: 10.0 },

    // Referral rewards
    referralReferrerBonusPaise: { type: Number, default: 15000 },  // ₹150 for referring
    referralRefereeBonusPaise: { type: Number, default: 5000 },    // ₹50 for new user

    // Earned wage advance
    earnedWageAdvanceEnabled: { type: Boolean, default: true },
    earnedWageAdvanceRate: { type: Number, default: 0.80 },    // worker can withdraw 80%

    // Emergency fund
    emergencyFundContributionRate: { type: Number, default: 0.005 }, // 0.5% of commission

    // Late arrival penalty
    // Deducted from worker earnings per extra minute beyond ETA.
    // Set to 0 to disable. Default: ₹2/min (200 paise).
    lateArrivalPenaltyPaisePerMin: { type: Number, default: 200, min: 0 },
    // Grace period before penalty kicks in (minutes). Default: 5 min buffer.
    lateArrivalGraceMinutes: { type: Number, default: 5, min: 0 },

    // Service tiers (booking-time speed/quality premium)
    // Multipliers applied on top of the base quote price.
    // Priority: 4.5 + workers only. Express: nearest worker, instant match.
    tierMultiplierPriority: { type: Number, default: 1.2, min: 1.0, max: 3.0 },
    tierMultiplierExpress:  { type: Number, default: 1.4, min: 1.0, max: 3.0 },
    // Max search window before force-assign kicks in (milliseconds).
    // Express = 60s, Priority = 2 min, Standard = 5 min (system default).
    tierExpressMaxSearchMs:  { type: Number, default: 60000 },
    tierPriorityMaxSearchMs: { type: Number, default: 120000 },

    isActive: { type: Boolean, default: false }, // exactly one active — unique index below

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    notes: String,
  },
  { timestamps: true }
);

// Only one active config at a time
pricingConfigSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('PricingConfig', pricingConfigSchema);
