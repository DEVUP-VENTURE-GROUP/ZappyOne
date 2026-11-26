const mongoose = require('mongoose');

/**
 * Referral system — two collections via discriminated subdocuments here for simplicity.
 *
 * ReferralCode: a permanent code attached to a user/worker
 * ReferralUse: an attribution record when someone signs up using a code
 *
 * Reward semantics:
 *   - Referee gets bonus on signup (immediate cashback to wallet)
 *   - Referrer gets bonus when referee completes their FIRST order (locked
 *     to prevent abuse — sign up + abandon shouldn't earn the referrer money)
 */

const referralCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    owner: {
      kind: { type: String, enum: ['user', 'worker', 'shop'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    },
    isActive: { type: Boolean, default: true },
    totalUses: { type: Number, default: 0 },
    totalRewardsPaise: { type: Number, default: 0 },
  },
  { timestamps: true }
);

referralCodeSchema.index({ 'owner.kind': 1, 'owner.id': 1 }, { unique: true });

const referralUseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, index: true },
    referrer: {
      kind: { type: String, enum: ['user', 'worker', 'shop'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    },
    referee: {
      kind: { type: String, enum: ['user', 'worker', 'shop'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },

    status: {
      type: String,
      enum: ['signup', 'qualified', 'rewarded', 'reversed'],
      default: 'signup',
      index: true,
    },

    refereeSignupBonusPaise: Number,
    refereeBonusGivenAt: Date,

    referrerRewardPaise: Number,
    referrerRewardGivenAt: Date,

    qualifyingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

    // Anti-abuse: same device/IP shouldn't reward
    refereeIp: String,
    refereeDeviceId: String,
  },
  { timestamps: true }
);

// One referee can only be referred ONCE
referralUseSchema.index({ 'referee.kind': 1, 'referee.id': 1 }, { unique: true });

module.exports = {
  ReferralCode: mongoose.model('ReferralCode', referralCodeSchema),
  ReferralUse: mongoose.model('ReferralUse', referralUseSchema),
};
