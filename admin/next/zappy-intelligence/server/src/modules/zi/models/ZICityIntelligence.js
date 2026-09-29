'use strict';

const mongoose = require('mongoose');

const kpiSchema = new mongoose.Schema(
  {
    ordersToday: { type: Number, default: 0 },
    ordersCompleted: { type: Number, default: 0 },
    ordersCancelled: { type: Number, default: 0 },
    revenueToday: { type: Number, default: 0 },       // paise
    revenueMTD: { type: Number, default: 0 },          // paise
    revenueYTD: { type: Number, default: 0 },          // paise
    activeUsers: { type: Number, default: 0 },
    activeWorkers: { type: Number, default: 0 },
    avgWaitMinutes: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    slaCompliance: { type: Number, default: 0 },       // percentage 0-100
    cancellationRate: { type: Number, default: 0 },    // percentage 0-100
    nps: { type: Number, default: 0 },                 // -100 to 100
  },
  { _id: false }
);

const targetsSchema = new mongoose.Schema(
  {
    monthlyOrders: { type: Number, default: 0 },
    monthlyRevenuePaise: { type: Number, default: 0 },
    workerCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const coordinatesSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const ziCityIntelligenceSchema = new mongoose.Schema(
  {
    cityId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    tier: {
      type: Number,
      enum: [1, 2, 3],
      required: true,
    },
    status: {
      type: String,
      enum: ['live', 'pilot', 'planned', 'paused'],
      default: 'planned',
      index: true,
    },
    launchDate: {
      type: Date,
      default: null,
    },
    coordinates: {
      type: coordinatesSchema,
      required: true,
    },
    kpis: {
      type: kpiSchema,
      default: () => ({}),
    },
    targets: {
      type: targetsSchema,
      default: () => ({}),
    },
    // Computed health score 0-100 based on SLA, rating, cancellation, revenue vs target
    healthScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Composite expansion readiness score 0-100
    expansionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'zi_city_intelligence',
  }
);

ziCityIntelligenceSchema.index({ tier: 1, status: 1 });
ziCityIntelligenceSchema.index({ healthScore: -1 });
ziCityIntelligenceSchema.index({ state: 1, status: 1 });

/**
 * Recompute healthScore from current KPIs before saving.
 * Formula: weighted average of SLA compliance (40%), avg rating/5*100 (30%),
 * (100 - cancellationRate) (20%), revenue target attainment (10%).
 */
ziCityIntelligenceSchema.pre('save', function (next) {
  if (this.kpis) {
    const slaScore = Math.min(100, this.kpis.slaCompliance || 0);
    const ratingScore = Math.min(100, ((this.kpis.avgRating || 0) / 5) * 100);
    const cancelScore = Math.max(0, 100 - (this.kpis.cancellationRate || 0));
    const revenueTarget = this.targets && this.targets.monthlyRevenuePaise > 0
      ? Math.min(100, ((this.kpis.revenueMTD || 0) / this.targets.monthlyRevenuePaise) * 100)
      : 50;

    this.healthScore = Math.round(
      slaScore * 0.4 +
      ratingScore * 0.3 +
      cancelScore * 0.2 +
      revenueTarget * 0.1
    );
  }
  this.updatedAt = new Date();
  next();
});

const ZICityIntelligence = mongoose.model('ZICityIntelligence', ziCityIntelligenceSchema);

module.exports = ZICityIntelligence;
