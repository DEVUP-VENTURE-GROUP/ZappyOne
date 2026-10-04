const mongoose = require('mongoose');

/**
 * ChatMessage — messages scoped to an order's conversation.
 *
 * Chat is intentionally order-scoped (not a general inbox): it exists only
 * while the order is active + 7 days after. This keeps ops simple and matches
 * Uber/Zomato model where you can't DM your driver from last week.
 *
 * Messages are plain text only — no media uploads in v1 to avoid moderation
 * complexity. Canned messages (quick replies) are a separate client-side
 * catalog not persisted here.
 *
 * Delivery state:
 *   - `deliveredAt` set when socket reaches the recipient
 *   - `readAt` set when recipient opens the chat thread
 */

const chatMessageSchema = new mongoose.Schema(
  {
    // Older order chats carry orderId; every newer booking kind carries kind + jobId (jobs/job-chat).
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    kind: { type: String, default: null },
    jobId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    from: {
      kind: { type: String, enum: ['user', 'worker', 'shop'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    text: { type: String, required: true, maxlength: 1000 },

    // Optional: canned message code for analytics ("i_am_here", "call_me", …)
    cannedCode: String,

    deliveredAt: Date,
    readAt: Date,
  },
  { timestamps: true }
);

chatMessageSchema.index({ orderId: 1, createdAt: 1 });
chatMessageSchema.index({ jobId: 1, createdAt: 1 });
// TTL: retain chat for 30 days after creation
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
