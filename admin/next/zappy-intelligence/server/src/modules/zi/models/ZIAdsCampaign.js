'use strict';

const mongoose = require('mongoose');

const targetingSchema = new mongoose.Schema(
  {
    cities: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    userSegments: { type: [String], default: [] },
    deviceTypes: { type: [String], default: [] },
  },
  { _id: false }
);

const budgetSchema = new mongoose.Schema(
  {
    totalPaise: { type: Number, required: true, min: 0 },
    dailyPaise: { type: Number, required: true, min: 0 },
    spentPaise: { type: Number, default: 0 },
    model: {
      type: String,
      enum: ['cpm', 'cpc', 'cpa'],
      default: 'cpc',
    },
    bidAmountPaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const creativeSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, default: null },
    headline: { type: String, maxlength: 200, default: '' },
    cta: { type: String, maxlength: 100, default: '' },
    deeplink: { type: String, maxlength: 500, default: '' },
    body: { type: String, maxlength: 1000, default: '' },
  },
  { _id: false }
);

const metricsSchema = new mongoose.Schema(
  {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },         // click-through rate 0-1
    cvr: { type: Number, default: 0 },         // conversion rate 0-1
    revenuePaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const ziAdsCampaignSchema = new mongoose.Schema(
  {
    advertiserId: {
      type: String,
      required: true,
      index: true,
    },
    advertiserName: {
      type: String,
      required: true,
      trim: true,
    },
    advertiserType: {
      type: String,
      enum: ['business', 'partner', 'brand', 'internal'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    type: {
      type: String,
      enum: ['banner', 'sponsored_listing', 'push', 'video'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed'],
      default: 'draft',
      index: true,
    },
    targeting: {
      type: targetingSchema,
      default: () => ({}),
    },
    budget: {
      type: budgetSchema,
      required: true,
    },
    creative: {
      type: creativeSchema,
      default: () => ({}),
    },
    metrics: {
      type: metricsSchema,
      default: () => ({}),
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'zi_ads_campaigns',
  }
);

ziAdsCampaignSchema.index({ advertiserId: 1, status: 1 });
ziAdsCampaignSchema.index({ status: 1, startDate: 1, endDate: 1 });
ziAdsCampaignSchema.index({ 'targeting.cities': 1, status: 1 });

// Auto-update CTR and CVR on metrics change
ziAdsCampaignSchema.pre('save', function (next) {
  if (this.metrics) {
    if (this.metrics.impressions > 0) {
      this.metrics.ctr = this.metrics.clicks / this.metrics.impressions;
    }
    if (this.metrics.clicks > 0) {
      this.metrics.cvr = this.metrics.conversions / this.metrics.clicks;
    }
  }
  next();
});

const ZIAdsCampaign = mongoose.model('ZIAdsCampaign', ziAdsCampaignSchema);

module.exports = ZIAdsCampaign;
