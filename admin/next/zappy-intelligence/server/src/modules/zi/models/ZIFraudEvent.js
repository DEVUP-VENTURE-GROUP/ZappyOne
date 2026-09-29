'use strict';

const mongoose = require('mongoose');

const signalsSchema = new mongoose.Schema(
  {
    velocityScore: { type: Number, min: 0, max: 100, default: 0 },
    locationScore: { type: Number, min: 0, max: 100, default: 0 },
    deviceScore: { type: Number, min: 0, max: 100, default: 0 },
    networkScore: { type: Number, min: 0, max: 100, default: 0 },
    behaviorScore: { type: Number, min: 0, max: 100, default: 0 },
    paymentScore: { type: Number, min: 0, max: 100, default: 0 },
    otpScore: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const ziFraudEventSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['user', 'worker', 'partner'],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    phone: {
      type: String,
      default: null,
      index: true,
    },
    signals: {
      type: signalsSchema,
      default: () => ({}),
    },
    compositeRisk: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },
    triggeredRules: {
      type: [String],
      default: [],
    },
    action: {
      type: String,
      enum: ['none', 'flag', 'soft_block', 'hard_block', 'review'],
      default: 'none',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved'],
      default: 'pending',
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      default: null,
    },
    reviewNotes: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'zi_fraud_events',
  }
);

ziFraudEventSchema.index({ entityId: 1, createdAt: -1 });
ziFraudEventSchema.index({ compositeRisk: -1, status: 1 });
ziFraudEventSchema.index({ status: 1, action: 1 });
ziFraudEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const ZIFraudEvent = mongoose.model('ZIFraudEvent', ziFraudEventSchema);

module.exports = ZIFraudEvent;
