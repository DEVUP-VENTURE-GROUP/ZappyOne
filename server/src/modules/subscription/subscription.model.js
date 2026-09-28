const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    owner: {
      kind: { type: String, enum: ['user', 'worker'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    planCode: { type: String, required: true }, // denormalized for cheap reads

    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'pending_payment'],
      default: 'pending_payment',
      index: true,
    },

    startAt: Date,
    endAt: { type: Date, index: true }, // for expiry sweeps
    cancelledAt: Date,
    cancellationReason: String,

    autoRenew: { type: Boolean, default: false },

    // Last successful payment that activated/renewed this subscription
    paymentIntentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentIntent' },
    paymentId: String,

    // Cached effects snapshot (locked at activation so plan changes don't
    // retroactively alter what an existing subscriber gets)
    effectsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// At most one ACTIVE or PENDING_PAYMENT subscription per owner.
// Cancelled/expired rows are kept for history; partial unique index excludes them.
subscriptionSchema.index(
  { 'owner.kind': 1, 'owner.id': 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['active', 'pending_payment'] } } }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
