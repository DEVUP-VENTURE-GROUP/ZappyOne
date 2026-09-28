const mongoose = require('mongoose');

/**
 * PaymentIntent — represents a single Cashfree payment lifecycle.
 *
 * We create one of these the moment we ask Cashfree to create an order. The
 * webhook later resolves it. Status transitions:
 *
 *   created → captured  (success)
 *           → failed    (terminal)
 *           → expired   (terminal, sweeper)
 *
 * The `purpose` field tells the webhook handler what side-effects to apply
 * once payment captures: activate a subscription, top up a wallet, or settle
 * an order. Kept on the intent so reconciliation works even if Cashfree tags
 * are lost.
 */
const paymentIntentSchema = new mongoose.Schema(
  {
    cfOrderId:   { type: String, required: true, unique: true, index: true }, // Cashfree order_id (we set this)
    cfPaymentId: { type: String, sparse: true, unique: true },                // cf_payment_id — set on capture

    owner: {
      kind: { type: String, enum: ['user', 'worker'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    },

    purpose: {
      type: String,
      // repair_payment was accepted by the service but missing here, so every
      // repair checkout failed at save. booking_payment covers every engine.
      enum: ['subscription', 'wallet_topup', 'order_payment', 'repair_payment', 'booking_payment',
        'event_advance_payment', 'event_remaining_payment'],
      required: true,
      index: true,
    },

    /** booking_payment: which engine's booking this pays for. */
    bookingSource: { type: String, enum: ['repair', 'pet', 'helping', null], default: null },
    bookingId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /** Refund lifecycle, set when a cancelled booking's online payment is returned. */
    refund: {
      status: { type: String, enum: ['none', 'requested', 'processed', 'manual_required'], default: 'none' },
      amountPaise: { type: Number, default: 0 },
      cfRefundId: { type: String, default: null },
      reason: { type: String, default: '' },
      at: { type: Date, default: null },
    },

    // Refs depending on purpose — exactly one will be populated
    planId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    orderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    eventBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventBooking' },

    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'expired', 'refunded'],
      default: 'created',
      index: true,
    },

    // For double-processing prevention: set the first time we successfully
    // apply side-effects. Idempotency key in our domain.
    appliedAt: Date,

    // Raw metadata from Cashfree webhook events for audit + debugging
    events: [
      {
        event: String,
        at: { type: Date, default: Date.now },
        payload: mongoose.Schema.Types.Mixed,
      },
    ],

    failureReason: String,

    // Reconciliation flag: set when side-effects fail after payment captures. (#95/#96)
    // Admin must manually verify and apply the credit/subscription/order update.
    reconciliationRequired: { type: Boolean, default: false, index: true },
    reconciliationReason:   String,
    reconciliationAt:       Date,
    reconciledAt:           Date,   // set by admin when resolved
    reconciledBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

paymentIntentSchema.index({ 'owner.id': 1, createdAt: -1 });
paymentIntentSchema.index({ status: 1, createdAt: -1 });
paymentIntentSchema.index({ reconciliationRequired: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentIntent', paymentIntentSchema);
