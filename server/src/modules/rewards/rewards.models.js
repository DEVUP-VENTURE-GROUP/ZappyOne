const mongoose = require('mongoose');

/**
 * Rewards system — redeemable Points + Scratch Cards. Distinct from gamification
 * XP/levels (which are progression). Points are a spendable currency: earned on
 * orders/referrals, redeemable to wallet cash. All rates are admin-configurable.
 */

// Admin config (singleton)
const scratchTierSchema = new mongoose.Schema(
  {
    label:  { type: String, required: true },              // "₹10 cashback", "50 points"
    type:   { type: String, enum: ['points', 'cashback', 'none'], required: true },
    value:  { type: Number, default: 0 },                  // points count, or paise for cashback
    weight: { type: Number, default: 1, min: 0 },          // relative odds
  },
  { _id: false }
);

const rewardsConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'active', unique: true },
    enabled: { type: Boolean, default: true },

    pointsPerOrder:       { type: Number, default: 50 },   // flat points per completed order
    pointsPer100Rupees:   { type: Number, default: 10 },   // + spend-based points
    pointsPerReferral:    { type: Number, default: 200 },  // to referrer on referee's first order
    pointsPerRefereeJoin: { type: Number, default: 50 },   // to referee on signup

    redeemPaisePerPoint:  { type: Number, default: 10 },   // 1 point = ₹0.10 (100 pts = ₹10)
    minRedeemPoints:      { type: Number, default: 100 },

    scratchOnOrder:       { type: Boolean, default: true }, // issue a scratch card on completion
    scratchExpiryDays:    { type: Number, default: 14 },
    scratchTiers:         { type: [scratchTierSchema], default: undefined },
  },
  { timestamps: true }
);

// Per-user points balance (denormalised for fast reads)
const rewardAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    points: { type: Number, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0 },
    lifetimeRedeemed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Points ledger (audit trail)
const pointsLedgerSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    delta:   { type: Number, required: true },   // +earn / -redeem
    balanceAfter: { type: Number, required: true },
    reason:  { type: String, required: true },   // order | referral | referee_join | scratch | redeem
    ref:     { type: String, default: null },    // orderId / cardId / etc.
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Scratch cards
const scratchCardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['active', 'scratched', 'expired'], default: 'active', index: true },
    source: { type: String, default: 'order' }, // order | referral | promo | admin
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    reward:  {
      type:  { type: String, enum: ['points', 'cashback', 'none'], default: null },
      value: { type: Number, default: 0 },
      label: { type: String, default: null },
    },
    issuedAt:    { type: Date, default: Date.now },
    scratchedAt: { type: Date, default: null },
    expiresAt:   { type: Date, index: true },
  },
  { timestamps: true }
);
scratchCardSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = {
  RewardsConfig:  mongoose.model('RewardsConfig',  rewardsConfigSchema),
  RewardAccount:  mongoose.model('RewardAccount',  rewardAccountSchema),
  PointsLedger:   mongoose.model('PointsLedger',   pointsLedgerSchema),
  ScratchCard:    mongoose.model('ScratchCard',    scratchCardSchema),
};
