const mongoose = require('mongoose');

/**
 * CancellationConfig — singleton DB-backed config for all penalty rules.
 *
 * Exactly one active row at a time (partial unique index on isActive:true).
 * Admin updates create a versioned new row, preserving audit history.
 */
const cancellationConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },

    // User-side: free for a grace period after assignment, then priced by how far the worker got.
    freeCancelWindowSec:        { type: Number, default: 120 },
    userCancelFeeAssignedPaise: { type: Number, default: 2000 },
    userCancelFeeOnWayPaise:    { type: Number, default: 3000 },
    userCancelFeeArrivedPaise:  { type: Number, default: 5000 },
    // Share of that fee paid to the worker for the trip they wasted.
    workerShareOnWayPct:        { type: Number, default: 50, min: 0, max: 100 },
    workerShareArrivedPct:      { type: Number, default: 70, min: 0, max: 100 },
    userCancelFeePaise:  { type: Number, default: 2000 },    // legacy single fee, unused

    // Worker-side penalties (debited from wallet)
    workerCancelPenaltyPaise:   { type: Number, default: 2000 },  // ₹20 base
    workerNoShowPenaltyPaise:   { type: Number, default: 5000 },  // ₹50 no-show
    lateWorkerCancelMultiplier: { type: Number, default: 2 },     // on_the_way/arrived → ×2

    // Worker dues (worker-dues.service): what a worker may owe from cash jobs.
    workerDuesWarnPaise:  { type: Number, default: 80000, min: 0 },   // ₹800: warned
    workerDuesLimitPaise: { type: Number, default: 100000, min: 0 },  // ₹1,000: new jobs stop
    duesPayInstructions:  { type: String, default: '', maxlength: 300 },

    // Behaviour thresholds
    workerRejectLimit:      { type: Number, default: 5 },   // consecutive rejects → auto-unavailable
    customerWaitMinutes:    { type: Number, default: 10, min: 1, max: 60 },  // at the door before "customer not here"
    providerLateMinutes:    { type: Number, default: 30, min: 5, max: 180 }, // past the booked time before "provider not coming"
    noShowCreditPaise:      { type: Number, default: 5000, min: 0, max: 50000 }, // credited to the customer when their pro does not turn up; 0 = off
    workerCancelLimit:      { type: Number, default: 3 },   // cancels in window → auto-block
    workerPauseMinutes:     { type: Number, default: 120, min: 15, max: 1440 }, // how long that lasts
    maxActiveJobs:          { type: Number, default: 2, min: 1, max: 10 },      // jobs one worker may hold at once
    unmatchedCloseMinutes:  { type: Number, default: 15, min: 10, max: 1440 },  // nobody took it: closed free after this
    workerCancelWindowSec:  { type: Number, default: 86400 }, // 24h window for cancel counting

    // Score degradation weights (added to dispatch score — higher = worse rank)
    rejectRatePenaltyWeight: { type: Number, default: 3.0 },
    cancelRatePenaltyWeight: { type: Number, default: 5.0 },

    // Index defined explicitly below as a partial-unique index (one active row) —
    // no field-level `index: true` here to avoid a duplicate {isActive:1} index.
    isActive: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    notes: String,
  },
  { timestamps: true }
);

cancellationConfigSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('CancellationConfig', cancellationConfigSchema);
