const mongoose = require('mongoose');

/**
 * Transaction — the immutable ledger.
 *
 * Every money movement creates a row. Wallet.balancePaise is a denormalization
 * of SUM(amountPaise) over rows for that owner. The amount sign convention:
 *   credit (money INTO the owner) = positive
 *   debit  (money OUT of the owner) = negative
 *
 * `reason` is a controlled vocabulary so admin reports can group cleanly.
 * Adding a new reason is a code change — DO NOT use free-text here.
 */

const REASONS = {
  // Credits (positive)
  WORKER_EARNING: 'worker_earning',
  CASHBACK: 'cashback',
  REFERRAL_REWARD: 'referral_reward',
  REFUND: 'refund',
  WALLET_TOPUP: 'wallet_topup',
  ADMIN_ADJUSTMENT_CREDIT: 'admin_adjustment_credit',

  // Debits (negative)
  ORDER_PAYMENT: 'order_payment',
  WITHDRAWAL: 'withdrawal',
  ADMIN_ADJUSTMENT_DEBIT: 'admin_adjustment_debit',
  CANCELLATION_FEE: 'cancellation_fee',       // debit from user for cancelling

  // Platform-side bookkeeping (principal=platform)
  PLATFORM_COMMISSION: 'platform_commission',
  PLATFORM_FEE: 'platform_fee',
  SUBSCRIPTION_REVENUE: 'subscription_revenue',

  // Worker Cancellation Shield Fund
  SHIELD_PAYOUT: 'shield_payout',             // weekly fund payout credited to worker

  /*
   * Helping Services — money that is NOT revenue.
   *
   * The whole category turns on one rule: what a helper spends in a shop is
   * the customer's money passing through, never the helper's income and never
   * ZappyOne's. Giving these their own reasons keeps them out of every
   * earnings, commission and revenue sum by construction, instead of relying
   * on a report remembering to exclude them.
   */
  WORKER_ADVANCE: 'worker_advance',            // helper fronted cash at the till
  WORKER_REIMBURSEMENT: 'worker_reimbursement',// paying that cash straight back
  PRODUCT_PURCHASE: 'product_purchase',        // customer's item money, held/charged
  PRODUCT_REFUND: 'product_refund',            // unspent item budget returned
};

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['credit', 'debit'], required: true, index: true },

    owner: {
      kind: { type: String, enum: ['user', 'worker', 'platform'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, index: true }, // null for platform
    },

    amountPaise: { type: Number, required: true }, // signed: +credit, -debit
    currency: { type: String, default: 'INR' },

    reason: { type: String, enum: Object.values(REASONS), required: true, index: true },
    description: String,

    // Cross-references
    refOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    /** Helping Services task this movement belongs to, where it is one. */
    refHelpingTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'HelpingTask', index: true },
    refPaymentIntentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentIntent', index: true },
    refSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },

    // For audit: balance immediately after this tx applied
    balanceAfterPaise: Number,

    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'reversed'],
      default: 'succeeded',
      index: true,
    },

    // Idempotency — webhooks/retries dedupe on this
    idempotencyKey: { type: String, unique: true, sparse: true },

    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

transactionSchema.index({ 'owner.kind': 1, 'owner.id': 1, createdAt: -1 });
transactionSchema.index({ refOrderId: 1, reason: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
Transaction.REASONS = REASONS;

module.exports = Transaction;
