const mongoose = require('mongoose');

/**
 * SupportTicket — general user/worker support (vs Dispute which is
 * order-specific with financial resolution).
 *
 * Typical tickets: "I can't log in", "My KYC is stuck", "Payout not received".
 * A ticket may reference an order but doesn't require one.
 */

const ticketSchema = new mongoose.Schema(
  {
    raisedBy: {
      kind: { type: String, enum: ['user', 'worker', 'shop', 'event_partner'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    },
    category: {
      type: String,
      enum: ['payment', 'account', 'order', 'kyc', 'app_bug', 'feature_request', 'complaint', 'other'],
      required: true,
      index: true,
    },
    subject: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },
    attachments: [String],

    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },

    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },

    messages: [
      {
        from: { type: String, enum: ['user', 'worker', 'shop', 'event_partner', 'admin'] },
        fromId: mongoose.Schema.Types.ObjectId,
        text: String,
        at: { type: Date, default: Date.now },
      },
    ],

    firstResponseAt: Date,
    resolvedAt: Date,

    // SLA — first response within 4h for normal, 1h for urgent
    slaDeadline: Date,
  },
  { timestamps: true }
);

ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', ticketSchema);
