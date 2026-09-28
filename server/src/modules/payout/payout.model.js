const mongoose = require('mongoose');

/**
 * Payout — a worker's withdrawal request.
 *
 * Lifecycle:
 *   requested → approved → processing → paid        (success path)
 *                       → rejected                  (admin denied)
 *   processing → failed                             (payout gateway error)
 *
 * Money flow semantics:
 *   - When a Payout enters `approved`/`processing`, the worker's wallet is
 *     DEBITED immediately (reservation). This prevents the worker from
 *     simultaneously requesting multiple payouts that together exceed balance.
 *   - If a payout fails, we re-CREDIT the wallet (reversal row) and
 *     mark the payout `failed`.
 *   - `paid` is final — set only with the transfer reference.
 *
 * The debit + credit use idempotency keys derived from the payout ID, so
 * retrying a webhook or admin action never double-charges.
 */

const payoutSchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 }, // always positive
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'processing', 'paid', 'failed'],
      default: 'requested',
      index: true,
    },

    // Destination — UPI is simplest for India; bank/card payouts can be added
    method: { type: String, enum: ['upi', 'bank', 'manual'], default: 'upi' },
    destination: {
      upiId: String,
      bankAccount: String,
      bankIfsc: String,
      accountName: String,
    },

    // Set by the payout gateway once connected; `manual:<UTR>` for hand transfers.
    gatewayPayoutId: { type: String, sparse: true, unique: true },
    /** No payout gateway: an admin transfers by hand and records the bank/UPI reference (UTR). */
    manualTransferRequired: { type: Boolean, default: false, index: true },
    transferReference: { type: String, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

    // Admin actions
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    rejectedAt: Date,
    rejectionReason: String,

    // Processing
    processedAt: Date,
    failureReason: String,

    // Audit trail of state transitions
    events: [
      {
        event: String,
        at: { type: Date, default: Date.now },
        meta: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

payoutSchema.index({ workerId: 1, status: 1, createdAt: -1 });
payoutSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
