const mongoose = require('mongoose');

/**
 * Notification — persisted records for the in-app notification feed.
 *
 * Sockets push for live UI; this collection is the source of truth users see
 * when they reopen the app. We also track delivery state per channel (push,
 * SMS) for ops debugging.
 *
 * TYPES — controlled vocabulary, mapping to specific UI templates on the
 * frontend (icons, copy, deep links).
 */

const TYPES = [
  // Order lifecycle
  'order_placed',
  'worker_assigned',
  'worker_on_the_way',
  'worker_arriving_soon',
  'worker_arrived',
  'order_completed',
  'order_cancelled',
  'order_failed',
  'order_delayed',
  'order_reassigned',
  'rating_request',
  'trip_started',
  'refund_processed',

  // Worker job events
  'job_assigned',
  'job_reminder',
  'job_removed',
  'late_arrival_penalty',

  // Worker earnings & wallet
  'worker_earning',
  'penalty_applied',
  'milestone_reached',
  'rating_received',
  'wallet_credited',

  // Worker Cancellation Shield Fund
  'cancellation_warning',
  'cancellation_fee_charged',
  'cancellation_fee_pending',
  'shield_payout',

  // Worker safety + special events
  'worker_wellness',
  'worker_sos',

  // Trust / reporting
  'report_received',
  'account_warning',

  // Subscriptions & cashback
  'subscription_activated',
  'subscription_expiring',
  'cashback_received',
  'referral_reward',

  // KYC
  'kyc_approved',
  'kyc_rejected',
  'kyc_suspended',
  'kyc_clarification',

  // Disputes + support
  'dispute_response',
  'chat_message',

  // Event Commerce — user
  'event_booking_confirmed',
  'event_booking_cancelled',
  'event_booking_reminder',
  'event_completed',
  // Event Commerce — partner
  'event_booking_new',
  'event_partner_kyc_approved',
  'event_partner_kyc_rejected',
  'event_booking_declined_partner',

  // Shops
  'shop_kyc_approved',
  'shop_kyc_rejected',
  'shop_handoff_requested',   // user: worker asks to send the job to a shop
  'shop_handoff_confirmed',   // worker: customer confirmed the shop drop-off
  'shop_handoff_declined',    // worker: customer declined the shop drop-off

  // Platform-wide
  'promotional',
  'service_due',   // retention: recurring service is due for a rebook
  'system_alert',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      kind: { type: String, enum: ['user', 'worker', 'event_partner', 'shop'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },

    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true },
    body: String,

    // Deep link the app opens when the notification is tapped
    deepLink: String, // e.g. '/orders/abc123'

    // Free-form payload for the frontend (e.g. { orderId, workerName })
    data: { type: mongoose.Schema.Types.Mixed, default: {} },

    readAt: Date,

    // Per-channel delivery tracking
    channels: {
      socket: { sent: { type: Boolean, default: false }, at: Date },
      push:   { sent: { type: Boolean, default: false }, at: Date, error: String },
      sms:    { sent: { type: Boolean, default: false }, at: Date, error: String },
    },
  },
  { timestamps: true }
);

notificationSchema.index({ 'recipient.kind': 1, 'recipient.id': 1, createdAt: -1 });
// TTL: prune notifications after 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const Notification = mongoose.model('Notification', notificationSchema);
Notification.TYPES = TYPES;

module.exports = Notification;
