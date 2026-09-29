'use strict';

const mongoose = require('mongoose');

const predictionPointSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    value: { type: Number, required: true },
    lower: { type: Number, default: null },  // confidence interval lower bound
    upper: { type: Number, default: null },  // confidence interval upper bound
  },
  { _id: false }
);

const accuracySchema = new mongoose.Schema(
  {
    mae: { type: Number, default: null },   // Mean Absolute Error
    mape: { type: Number, default: null },  // Mean Absolute Percentage Error
    rmse: { type: Number, default: null },  // Root Mean Squared Error
  },
  { _id: false }
);

const scopeSchema = new mongoose.Schema(
  {
    cityId: { type: String, default: null },
    categoryKey: { type: String, default: null },
  },
  { _id: false }
);

const ziForecastSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['demand', 'revenue', 'worker_need', 'churn'],
      required: true,
      index: true,
    },
    scope: {
      type: scopeSchema,
      default: () => ({}),
    },
    horizon: {
      type: String,
      enum: ['7d', '30d', '90d'],
      required: true,
    },
    model: {
      type: String,
      enum: ['prophet_js', 'statistical', 'ensemble'],
      default: 'statistical',
    },
    predictions: {
      type: [predictionPointSchema],
      default: [],
    },
    accuracy: {
      type: accuracySchema,
      default: () => ({}),
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    isStale: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'zi_forecasts',
  }
);

ziForecastSchema.index({ type: 1, 'scope.cityId': 1, generatedAt: -1 });
ziForecastSchema.index({ isStale: 1, validUntil: 1 });
ziForecastSchema.index({ 'scope.cityId': 1, type: 1, horizon: 1, isStale: 1 });

// Auto-mark stale when validUntil has passed
ziForecastSchema.pre('find', function () {
  // Not a blocking hook — staleness is set explicitly by the forecast service job
});

const ZIForecast = mongoose.model('ZIForecast', ziForecastSchema);

module.exports = ZIForecast;
