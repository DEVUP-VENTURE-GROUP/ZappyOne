'use strict';

const mongoose = require('mongoose');

const workerScoresSchema = new mongoose.Schema(
  {
    productivityScore: { type: Number, min: 0, max: 100, default: 0 },
    earningsScore: { type: Number, min: 0, max: 100, default: 0 },
    qualityScore: { type: Number, min: 0, max: 100, default: 0 },
    attendanceScore: { type: Number, min: 0, max: 100, default: 0 },
    trainingScore: { type: Number, min: 0, max: 100, default: 0 },
    compositeScore: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const metrics30dSchema = new mongoose.Schema(
  {
    jobsCompleted: { type: Number, default: 0 },
    jobsDeclined: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    avgCompletionTimeMinutes: { type: Number, default: 0 },
    earningsPaise: { type: Number, default: 0 },
    onlineHours: { type: Number, default: 0 },
    earningsPerHour: { type: Number, default: 0 },  // paise per hour
  },
  { _id: false }
);

const workerRiskFlagsSchema = new mongoose.Schema(
  {
    churnProbability: { type: Number, min: 0, max: 1, default: 0 },
    fraudRisk: { type: Number, min: 0, max: 1, default: 0 },
    burnoutRisk: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false }
);

const trainingPlanItemSchema = new mongoose.Schema(
  {
    module: { type: String, required: true },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    deadline: { type: Date, default: null },
  },
  { _id: false }
);

const ziWorkerIntelSchema = new mongoose.Schema(
  {
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      unique: true,
      index: true,
    },
    scores: {
      type: workerScoresSchema,
      default: () => ({}),
    },
    metrics30d: {
      type: metrics30dSchema,
      default: () => ({}),
    },
    riskFlags: {
      type: workerRiskFlagsSchema,
      default: () => ({}),
    },
    trainingPlan: {
      type: [trainingPlanItemSchema],
      default: [],
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'zi_worker_intel',
  }
);

ziWorkerIntelSchema.index({ 'scores.compositeScore': -1 });
ziWorkerIntelSchema.index({ 'riskFlags.churnProbability': -1 });
ziWorkerIntelSchema.index({ 'riskFlags.burnoutRisk': -1 });

const ZIWorkerIntel = mongoose.model('ZIWorkerIntel', ziWorkerIntelSchema);

module.exports = ZIWorkerIntel;
