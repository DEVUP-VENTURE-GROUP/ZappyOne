const mongoose = require('mongoose');

/**
 * One customer review of one finished job, whatever kind of job it was.
 *
 * Each job kind keeps its own `rating` / `ratingComment` on its booking (that
 * is what the customer's screens read). This collection is the one place the
 * platform reads reviews back from: the provider's public profile, the shop's
 * analytics and the admin moderation queue, so none of them has to know how
 * many booking collections exist.
 *
 * Moderation never deletes. `status: 'hidden'` takes the words off public
 * pages (abuse, personal data) but the stars still count; `excluded` takes the
 * stars out of the provider's average too (a fake or retaliatory review). Both
 * keep who decided and why.
 */
const KINDS = ['repair', 'pet', 'helping', 'order', 'event'];

const reviewSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: KINDS, required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    /** Event decor is done by an event partner, not a worker or shop. */
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventPartner', default: null, index: true },
    /** What was done, in the customer's words where we have them (e.g. "Cracked screen"). */
    serviceLabel: { type: String, default: '' },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000 },

    status: { type: String, enum: ['visible', 'hidden'], default: 'visible', index: true },
    excluded: { type: Boolean, default: false, index: true },
    moderation: {
      by: { type: mongoose.Schema.Types.ObjectId, default: null },
      at: { type: Date, default: null },
      reason: { type: String, default: '' },
    },
    /** Raised by the provider or by an automatic check; cleared when an admin decides. */
    flagged: { type: Boolean, default: false, index: true },
    flagReason: { type: String, default: '' },
  },
  { timestamps: true },
);

reviewSchema.index({ kind: 1, jobId: 1 }, { unique: true });
reviewSchema.index({ workerId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ shopId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
module.exports.KINDS = KINDS;
