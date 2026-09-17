const mongoose = require('mongoose');

/**
 * CancellationFeeRecord — one row per cancelled job where a fee was assessed.
 *
 * Covers orders AND repair bookings. They are the same problem: a customer
 * cancelled, a worker lost time, and somebody has to make that good. Giving
 * repairs their own parallel table would mean two fee schedules drifting apart,
 * two admin screens, and two compensation funds paying the same worker — so
 * both write here and the weekly payout sees one pool.
 *
 * `kind` says which. Exactly one of orderId / repairBookingId is set; both are
 * sparse-unique so one job can never be charged twice, while the other stays
 * absent rather than null-colliding with every other row of its type.
 *
 * Tracks collection status: wallet deducted immediately, or deferred to next job.
 * Also records harm score so the weekly payout can distribute proportionally.
 */
const cancellationFeeRecordSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['order', 'repair'], default: 'order', index: true },

    orderId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: undefined,
    },
    repairBookingId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'RepairBooking', default: undefined,
    },

    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
    shopId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },

    /**
     * The stage vocabulary is shared on purpose.
     *
     * A repair's own statuses are far more granular (DIAGNOSING, AT_WORKSHOP,
     * QA_PENDING …), but for the question "how much harm did this cancellation
     * do?" they collapse to the same five answers an order has. Mapping them at
     * the edge keeps ONE fee schedule to reason about and to tune.
     */
    cancelledAtStage: {
      type: String,
      enum: ['created', 'searching', 'assigned', 'on_the_way', 'arrived'],
      required: true,
    },

    /**
     * Work already done that the customer owes for regardless of fault.
     *
     * Distinct from feePaise, which is a penalty. If a technician has inspected
     * a device, the inspection fee is earned — cancelling afterwards does not
     * un-inspect it. Kept separate so a refund can net it off without it being
     * mistaken for a punishment, and so the Shield fund never swallows money
     * that belongs to the technician as payment.
     */
    earnedFeePaise: { type: Number, default: 0, min: 0 },

    /** What actually went back to the customer, for an online-paid job. */
    refundedPaise: { type: Number, default: 0, min: 0 },

    feePaise:      { type: Number, required: true, default: 0 },
    isGrace:       { type: Boolean, default: false }, // first searching cancel → ₹0 + warning only
    harmScore:     { type: Number, required: true, default: 0 }, // 0/1/2/3/5 based on stage

    // How many user-initiated cancels in last 30 days at time of cancel (0=first, 1=second, 2+=third+)
    cancelsInPeriod: { type: Number, default: 0 },

    collectionStatus: {
      type: String,
      enum: ['grace', 'zero_fee', 'collected_wallet', 'pending_next_order', 'collected_next_order', 'written_off'],
      default: 'pending_next_order',
      index: true,
    },
    collectedAt:         { type: Date, default: null },
    collectedFromOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    // Which weekly fund pool this fee was added to
    addedToFundWeekId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShieldFundWeek', default: null, index: true },
    addedToFundAt:     { type: Date, default: null },

    warningIssuedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

cancellationFeeRecordSchema.index({ userId: 1, createdAt: -1 });
cancellationFeeRecordSchema.index({ addedToFundWeekId: 1, workerId: 1 });

// One record per job. Sparse so the unused id column does not collide across
// every row of the other kind.
cancellationFeeRecordSchema.index(
  { orderId: 1 }, { unique: true, partialFilterExpression: { orderId: { $exists: true } } },
);
cancellationFeeRecordSchema.index(
  { repairBookingId: 1 }, { unique: true, partialFilterExpression: { repairBookingId: { $exists: true } } },
);

module.exports = mongoose.model('CancellationFeeRecord', cancellationFeeRecordSchema);
