'use strict';

const mongoose = require('mongoose');

const inputAssumptionsSchema = new mongoose.Schema(
  {
    initialWorkers: { type: Number, default: 50 },
    initialMarketingSpend: { type: Number, default: 0 },         // paise per month
    avgOrderValuePaise: { type: Number, default: 50000 },        // ₹500 default
    targetPenetrationRate: { type: Number, default: 0.02 },      // 2% of addressable population
    operationalCostPerOrderPaise: { type: Number, default: 5000 }, // ₹50 per order
    workerAcquisitionCost: { type: Number, default: 50000 },     // ₹500 per worker
    userAcquisitionCost: { type: Number, default: 20000 },       // ₹200 per user
    commissionRate: { type: Number, default: 0.18 },             // 18%
  },
  { _id: false }
);

const monthlyCostsSchema = new mongoose.Schema(
  {
    ops: { type: Number, default: 0 },
    workers: { type: Number, default: 0 },
    marketing: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const monthlyProjectionSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true },         // 1-indexed
    workers: { type: Number, default: 0 },
    users: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    gmvPaise: { type: Number, default: 0 },
    revenuePaise: { type: Number, default: 0 },
    costs: { type: monthlyCostsSchema, default: () => ({}) },
    cashflow: { type: Number, default: 0 },           // paise
    cumulativeCashflow: { type: Number, default: 0 }, // paise
  },
  { _id: false }
);

const ziSimulationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    population: {
      type: Number,
      required: true,
      min: 0,
    },
    inputAssumptions: {
      type: inputAssumptionsSchema,
      default: () => ({}),
    },
    monthlyProjections: {
      type: [monthlyProjectionSchema],
      default: [],
    },
    breakEvenMonth: {
      type: Number,
      default: null,
    },
    totalInvestmentNeeded: {
      type: Number,
      default: 0,  // paise
    },
    projectedYr1RevenuePaise: {
      type: Number,
      default: 0,
    },
    projectedYr1GMVPaise: {
      type: Number,
      default: 0,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.7,
    },
    runBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZIUser',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'zi_simulations',
  }
);

ziSimulationSchema.index({ runBy: 1, createdAt: -1 });
ziSimulationSchema.index({ city: 1, createdAt: -1 });

const ZISimulation = mongoose.model('ZISimulation', ziSimulationSchema);

module.exports = ZISimulation;
