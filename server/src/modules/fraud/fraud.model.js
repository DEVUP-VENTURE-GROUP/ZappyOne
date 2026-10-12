const mongoose = require('mongoose');

const FRAUD_TYPES = [
  'gps_spoof',
  'velocity_abuse',
  'refund_abuse',
  'duplicate_account',
  'payment_anomaly',
  'rating_manipulation',
  'fake_location',
  'surge_farming',
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'dismissed', 'escalated', 'blocked'];

const fraudEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: FRAUD_TYPES, required: true, index: true },
    severity: { type: String, enum: SEVERITIES, required: true, index: true },

    actorKind: { type: String, enum: ['user', 'worker', 'shop'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    actorName: { type: String },
    actorPhone: { type: String },

    // Event-specific payload (counts, distances, device fingerprints, etc.)
    details: { type: mongoose.Schema.Types.Mixed },

    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    status: { type: String, enum: STATUSES, default: 'open', index: true },
    adminNote: { type: String, maxlength: 1000 },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true } // createdAt / updatedAt
);

// Common query paths: by actor, by type/status/severity, recency
fraudEventSchema.index({ actorId: 1, createdAt: -1 });
fraudEventSchema.index({ type: 1, status: 1, createdAt: -1 });
fraudEventSchema.index({ severity: 1, status: 1, createdAt: -1 });
fraudEventSchema.index({ status: 1, createdAt: -1 });

const FraudEvent = mongoose.model('FraudEvent', fraudEventSchema);
FraudEvent.TYPES = FRAUD_TYPES;
FraudEvent.SEVERITIES = SEVERITIES;
FraudEvent.STATUSES = STATUSES;

module.exports = FraudEvent;
module.exports.FRAUD_TYPES = FRAUD_TYPES;
module.exports.SEVERITIES = SEVERITIES;
module.exports.STATUSES = STATUSES;
