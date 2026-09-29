'use strict';

const mongoose = require('mongoose');

const scoresSchema = new mongoose.Schema(
  {
    revenueScore: { type: Number, min: 0, max: 100, default: 0 },
    qualityScore: { type: Number, min: 0, max: 100, default: 0 },
    acceptanceScore: { type: Number, min: 0, max: 100, default: 0 },
    completionScore: { type: Number, min: 0, max: 100, default: 0 },
    responseScore: { type: Number, min: 0, max: 100, default: 0 },
    loyaltyScore: { type: Number, min: 0, max: 100, default: 0 },
    compositeScore: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const financialsSchema = new mongoose.Schema(
  {
    gmv30dPaise: { type: Number, default: 0 },
    commission30dPaise: { type: Number, default: 0 },
    avgOrderValuePaise: { type: Number, default: 0 },
    revenueGrowthWoW: { type: Number, default: 0 },  // percentage, can be negative
  },
  { _id: false }
);

const riskFlagsSchema = new mongoose.Schema(
  {
    churnProbability: { type: Number, min: 0, max: 1, default: 0 },
    fraudRisk: { type: Number, min: 0, max: 100, default: 0 },
    qualityRisk: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, required: true },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
  },
  { _id: false }
);

const ziPartnerIntelSchema = new mongoose.Schema(
  {
    partnerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    partnerName: {
      type: String,
      required: true,
      trim: true,
    },
    cityId: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    scores: {
      type: scoresSchema,
      default: () => ({}),
    },
    financials: {
      type: financialsSchema,
      default: () => ({}),
    },
    riskFlags: {
      type: riskFlagsSchema,
      default: () => ({}),
    },
    recommendations: {
      type: [recommendationSchema],
      default: [],
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'zi_partner_intel',
  }
);

ziPartnerIntelSchema.index({ cityId: 1, 'scores.compositeScore': -1 });
ziPartnerIntelSchema.index({ 'riskFlags.churnProbability': -1 });
ziPartnerIntelSchema.index({ category: 1, cityId: 1 });

const ZIPartnerIntel = mongoose.model('ZIPartnerIntel', ziPartnerIntelSchema);

module.exports = ZIPartnerIntel;
