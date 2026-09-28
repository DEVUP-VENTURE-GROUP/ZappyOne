const mongoose = require('mongoose');

/**
 * A purchasable subscription plan.
 *
 * `effects` is an arbitrary bag of feature flags the rest of the system reads
 * via `subscription.service`. Keeping it open-ended lets us launch new perks
 * without schema migrations — a new `effects.maxFreeBookings: 3` is just a
 * data change and a single read site.
 */
const planSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    name: { type: String, required: true },
    description: String,
    audience: { type: String, enum: ['user', 'worker'], required: true, index: true },

    priceInPaise: { type: Number, required: true }, // paise, like every amount
    currency: { type: String, default: 'INR' },
    durationDays: { type: Number, required: true, default: 30 },

    // Free trial in days — 0 means none
    trialDays: { type: Number, default: 0 },

    /**
     * Concrete effects this plan grants:
     *   user:
     *     surgeCap: number   // caps any computed surge multiplier
     *     waivePlatformFee: bool
     *     priorityAssignment: bool
     *   worker:
     *     commissionDelta: number  // -0.05 = 5pp lower commission
     *     proBoost: number          // points subtracted from match score
     *     visibilityMultiplier: number
     */
    effects: { type: mongoose.Schema.Types.Mixed, default: {} },

    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
