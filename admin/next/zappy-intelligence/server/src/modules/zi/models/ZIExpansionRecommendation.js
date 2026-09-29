'use strict';

const mongoose = require('mongoose');

const scenarioSchema = new mongoose.Schema(
  {
    revenue: { type: Number, default: 0 },  // paise
    orders: { type: Number, default: 0 },
  },
  { _id: false }
);

const projectionsSchema = new mongoose.Schema(
  {
    monthlyRevenuePaise: { type: Number, default: 0 },
    monthlyOrders: { type: Number, default: 0 },
    workersNeeded: { type: Number, default: 0 },
    breakEvenMonths: { type: Number, default: 0 },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    scenarios: {
      bear: { type: scenarioSchema, default: () => ({}) },
      base: { type: scenarioSchema, default: () => ({}) },
      bull: { type: scenarioSchema, default: () => ({}) },
    },
  },
  { _id: false }
);

const reasoningSchema = new mongoose.Schema(
  {
    demandScore: { type: Number, min: 0, max: 100, default: 0 },
    competitionScore: { type: Number, min: 0, max: 100, default: 0 },
    supplyScore: { type: Number, min: 0, max: 100, default: 0 },
    populationScore: { type: Number, min: 0, max: 100, default: 0 },
    incomeScore: { type: Number, min: 0, max: 100, default: 0 },
    connectivityScore: { type: Number, min: 0, max: 100, default: 0 },
    compositeScore: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const ziExpansionRecommendationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['city', 'category', 'worker_type'],
      required: true,
      index: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    reasoning: {
      type: reasoningSchema,
      default: () => ({}),
    },
    projections: {
      type: projectionsSchema,
      default: () => ({}),
    },
    aiNarrative: {
      type: String,
      default: '',
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'launched'],
      default: 'pending_review',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      default: null,
    },
    approvalNotes: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'zi_expansion_recommendations',
  }
);

ziExpansionRecommendationSchema.index({ 'reasoning.compositeScore': -1 });
ziExpansionRecommendationSchema.index({ type: 1, status: 1 });
ziExpansionRecommendationSchema.index({ target: 1, type: 1 }, { unique: true, sparse: true });

const ZIExpansionRecommendation = mongoose.model(
  'ZIExpansionRecommendation',
  ziExpansionRecommendationSchema
);

module.exports = ZIExpansionRecommendation;
