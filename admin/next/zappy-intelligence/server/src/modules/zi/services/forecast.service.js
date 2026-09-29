'use strict';

/**
 * Statistical demand forecasting service for ZI.
 * Implements Holt-Winters (triple exponential smoothing), linear regression,
 * simple exponential smoothing, and an ensemble combiner — all in pure JavaScript.
 */

const ZIForecast = require('../models/ZIForecast');
const logger     = require('../../../utils/logger');

function getOrder()  { return require('../../order/order.model'); }
function getWorker() { return require('../../worker/worker.model'); }

// ─── Core Statistical Algorithms ──────────────────────────────────────────────

/**
 * Simple Exponential Smoothing.
 * @param {number[]} data  Historical values (oldest first)
 * @param {number}   alpha Smoothing factor (0-1)
 * @param {number}   steps Number of future steps
 * @returns {number[]} Forecasted values
 */
function simpleExponentialSmoothing(data, alpha, steps) {
  if (!data.length) return Array(steps).fill(0);
  let level = data[0];
  for (let i = 1; i < data.length; i++) {
    level = alpha * data[i] + (1 - alpha) * level;
  }
  // SES: forecast is flat at the last smoothed value
  return Array(steps).fill(level);
}

/**
 * Full Holt-Winters triple exponential smoothing.
 * Handles additive seasonality.
 *
 * @param {number[]} data          Historical values (oldest first)
 * @param {number}   alpha         Level smoothing (0-1)
 * @param {number}   beta          Trend smoothing (0-1)
 * @param {number}   gamma         Seasonal smoothing (0-1)
 * @param {number}   seasonLength  Length of one season (e.g. 7 for weekly)
 * @param {number}   forecastSteps Number of future points
 * @returns {{ forecasts: number[], level: number, trend: number, seasonal: number[] }}
 */
function holtWinters(data, alpha, beta, gamma, seasonLength, forecastSteps) {
  if (data.length < seasonLength * 2) {
    // Not enough data: fall back to SES
    const ses = simpleExponentialSmoothing(data, alpha, forecastSteps);
    return { forecasts: ses, level: ses[0], trend: 0, seasonal: Array(seasonLength).fill(0) };
  }

  // Initialise level: average of first season
  let level = data.slice(0, seasonLength).reduce((s, v) => s + v, 0) / seasonLength;

  // Initialise trend: average difference between first and second season means
  const season1Avg = data.slice(0, seasonLength).reduce((s, v) => s + v, 0) / seasonLength;
  const season2Avg = data.slice(seasonLength, seasonLength * 2).reduce((s, v) => s + v, 0) / seasonLength;
  let trend = (season2Avg - season1Avg) / seasonLength;

  // Initialise seasonal indices as difference from level
  const seasonal = [];
  for (let i = 0; i < seasonLength; i++) {
    const avg = data.slice(0, seasonLength).reduce((s, v) => s + v, 0) / seasonLength;
    seasonal.push(data[i] - avg);
  }

  // Fit on historical data
  const fitted = [];
  for (let i = 0; i < data.length; i++) {
    const s = seasonal[i % seasonLength];
    const prevLevel = level;
    const prevTrend = trend;

    level   = alpha * (data[i] - s)        + (1 - alpha) * (prevLevel + prevTrend);
    trend   = beta  * (level - prevLevel)  + (1 - beta)  * prevTrend;
    seasonal[i % seasonLength] = gamma * (data[i] - prevLevel - prevTrend) + (1 - gamma) * s;

    fitted.push(prevLevel + prevTrend + s);
  }

  // Generate forecasts
  const forecasts = [];
  for (let h = 1; h <= forecastSteps; h++) {
    const s = seasonal[(data.length + h - 1) % seasonLength];
    forecasts.push(level + trend * h + s);
  }

  return { forecasts, fitted, level, trend, seasonal: seasonal.slice(0, seasonLength) };
}

/**
 * Simple linear regression with seasonal adjustment.
 * @param {number[]} data
 * @param {number}   steps
 * @param {number}   seasonLength
 * @returns {number[]}
 */
function linearRegressionForecast(data, steps, seasonLength = 7) {
  if (!data.length) return Array(steps).fill(0);

  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((s, v) => s + v, 0) / n;

  let ssxy = 0;
  let ssxx = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (i - xMean) * (data[i] - yMean);
    ssxx += (i - xMean) ** 2;
  }

  const slope     = ssxx !== 0 ? ssxy / ssxx : 0;
  const intercept = yMean - slope * xMean;

  // Compute seasonal factors (deviations from trend)
  const seasonFactors = Array(seasonLength).fill(0);
  const seasonCounts  = Array(seasonLength).fill(0);
  for (let i = 0; i < n; i++) {
    const trend  = intercept + slope * i;
    const factor = trend !== 0 ? data[i] / trend : 1;
    const si     = i % seasonLength;
    seasonFactors[si] += factor;
    seasonCounts[si]  += 1;
  }
  for (let i = 0; i < seasonLength; i++) {
    seasonFactors[i] = seasonCounts[i] > 0 ? seasonFactors[i] / seasonCounts[i] : 1;
  }

  const forecasts = [];
  for (let h = 1; h <= steps; h++) {
    const idx    = n + h - 1;
    const trend  = intercept + slope * idx;
    const factor = seasonFactors[idx % seasonLength];
    forecasts.push(Math.max(0, trend * factor));
  }

  return forecasts;
}

/**
 * Ensemble forecast: weighted combination of HW, linear regression, and SES.
 */
function ensembleForecast(data, forecastSteps, seasonLength = 7) {
  const hw  = holtWinters(data, 0.3, 0.1, 0.4, seasonLength, forecastSteps);
  const lr  = linearRegressionForecast(data, forecastSteps, seasonLength);
  const ses = simpleExponentialSmoothing(data, 0.3, forecastSteps);

  const weights = { hw: 0.5, lr: 0.3, ses: 0.2 };

  return hw.forecasts.map((hwVal, i) => {
    return Math.max(0, hwVal * weights.hw + lr[i] * weights.lr + ses[i] * weights.ses);
  });
}

/**
 * Compute confidence intervals (approx ±1.96 * std dev of residuals)
 */
function confidenceIntervals(forecasts, historicalStd, multiplier = 1.96) {
  return forecasts.map((v, i) => {
    // Widen CI with horizon
    const horizonFactor = 1 + 0.05 * (i + 1);
    const margin = historicalStd * multiplier * horizonFactor;
    return { lower: Math.max(0, v - margin), upper: v + margin };
  });
}

/**
 * Compute std deviation of an array.
 */
function stdDev(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Mean Absolute Error
 */
function mae(actual, predicted) {
  if (!actual.length) return 0;
  const n = Math.min(actual.length, predicted.length);
  return actual.slice(0, n).reduce((s, v, i) => s + Math.abs(v - predicted[i]), 0) / n;
}

/**
 * Mean Absolute Percentage Error
 */
function mape(actual, predicted) {
  const n = Math.min(actual.length, predicted.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (actual[i] !== 0) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }
  return count > 0 ? (sum / count) * 100 : 0;
}

/**
 * Root Mean Squared Error
 */
function rmse(actual, predicted) {
  if (!actual.length) return 0;
  const n = Math.min(actual.length, predicted.length);
  const mse = actual.slice(0, n).reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0) / n;
  return Math.sqrt(mse);
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Fetch daily order counts for the past N days grouped by date.
 * @param {string} cityId       City identifier (matches order pickup address field)
 * @param {string} categoryKey  Service category (partial match)
 * @param {number} days         How many days back to fetch
 * @returns {{ date: string, count: number }[]} Oldest first
 */
async function fetchDailyOrderCounts(cityId, categoryKey, days = 365) {
  const Order = getOrder();
  const since = new Date(Date.now() - days * 86400 * 1000);

  const matchStage = {
    createdAt: { $gte: since },
    status:    { $in: ['completed', 'cancelled', 'failed', 'created', 'assigned'] },
  };

  // Filter by city if available (using address text match — approximation)
  if (cityId) {
    matchStage['pickupLocation.address'] = { $regex: cityId, $options: 'i' };
  }
  if (categoryKey) {
    matchStage.service = { $regex: categoryKey, $options: 'i' };
  }

  const result = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill missing dates with 0
  const map = new Map(result.map(r => [r._id, r.count]));
  const filled = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400 * 1000);
    const key  = date.toISOString().split('T')[0];
    filled.push({ date: key, count: map.get(key) || 0 });
  }

  return filled;
}

/**
 * Fetch daily revenue (paise) for the past N days.
 */
async function fetchDailyRevenue(cityId, days = 365) {
  const Order = getOrder();
  const since = new Date(Date.now() - days * 86400 * 1000);

  const matchStage = { status: 'completed', completedAt: { $gte: since } };
  if (cityId) {
    matchStage['pickupLocation.address'] = { $regex: cityId, $options: 'i' };
  }

  const result = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'Asia/Kolkata' } },
        revenuePaise: { $sum: { $ifNull: ['$pricing.totalPaise', { $multiply: ['$pricing.total', 100] }] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const map = new Map(result.map(r => [r._id, r.revenuePaise]));
  const filled = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400 * 1000);
    const key  = date.toISOString().split('T')[0];
    filled.push({ date: key, revenuePaise: map.get(key) || 0 });
  }

  return filled;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Forecast daily order demand for a city/category.
 */
async function forecastDemand(cityId, categoryKey, horizonDays = 30) {
  const historicalData = await fetchDailyOrderCounts(cityId, categoryKey, 365);
  const values         = historicalData.map(d => d.count);

  const { forecasts, fitted } = holtWinters(values, 0.3, 0.1, 0.4, 7, horizonDays);
  const ensembleForecasts     = ensembleForecast(values, horizonDays, 7);
  const histStd               = stdDev(values);
  const cis                   = confidenceIntervals(ensembleForecasts, histStd);

  // Build predictions array with dates
  const today      = new Date();
  const predictions = ensembleForecasts.map((value, i) => {
    const date = new Date(today.getTime() + (i + 1) * 86400 * 1000);
    return {
      date:  date.toISOString().split('T')[0],
      value: Math.round(Math.max(0, value)),
      lower: Math.round(cis[i].lower),
      upper: Math.round(cis[i].upper),
    };
  });

  // Accuracy from back-testing last 30 days
  const testActual    = values.slice(-30);
  const testFitted    = (fitted || []).slice(-30);
  const accuracy = {
    mae:  Math.round(mae(testActual, testFitted) * 100) / 100,
    mape: Math.round(mape(testActual, testFitted) * 100) / 100,
  };

  // Persist to ZIForecast
  const horizonLabel = horizonDays <= 7 ? '7d' : horizonDays <= 30 ? '30d' : '90d';
  await ZIForecast.findOneAndUpdate(
    { type: 'demand', 'scope.cityId': cityId || 'all', 'scope.categoryKey': categoryKey || 'all' },
    {
      type:        'demand',
      scope:       { cityId: cityId || 'all', categoryKey: categoryKey || 'all' },
      horizon:     horizonLabel,
      model:       'ensemble',
      predictions,
      accuracy,
      generatedAt: new Date(),
      validUntil:  new Date(Date.now() + 24 * 3600 * 1000),
      isStale:     false,
    },
    { upsert: true, new: true }
  );

  return { cityId, categoryKey, horizonDays, predictions, accuracy };
}

/**
 * Forecast revenue with bear/base/bull scenarios.
 */
async function forecastRevenue(cityId, horizonDays = 90) {
  const historicalData = await fetchDailyRevenue(cityId, 365);
  const values         = historicalData.map(d => d.revenuePaise);

  const baseForecasts = ensembleForecast(values, horizonDays, 7);
  const today         = new Date();

  const buildScenario = (multiplier) =>
    baseForecasts.map((value, i) => ({
      date:         new Date(today.getTime() + (i + 1) * 86400 * 1000).toISOString().split('T')[0],
      revenuePaise: Math.round(Math.max(0, value * multiplier)),
    }));

  return {
    cityId,
    horizonDays,
    base: buildScenario(1.0),
    bear: buildScenario(0.7),
    bull: buildScenario(1.4),
  };
}

/**
 * Forecast worker demand for a target date based on predicted order volume.
 * Returns { skill: workerCount } map.
 */
async function forecastWorkerDemand(cityId, targetDate) {
  const Order  = getOrder();
  const date   = new Date(targetDate);
  const dow    = date.getDay(); // 0=Sun, 6=Sat

  // Get demand forecast for target date
  const horizonMs   = date.getTime() - Date.now();
  const horizonDays = Math.max(1, Math.ceil(horizonMs / 86400000));
  const { predictions } = await forecastDemand(cityId, null, Math.min(horizonDays + 5, 90));
  const targetDateStr   = date.toISOString().split('T')[0];
  const targetPred      = predictions.find(p => p.date === targetDateStr);
  const predictedOrders = targetPred ? targetPred.value : (predictions[0]?.value || 10);

  // Historical skill distribution from last 30d
  const since = new Date(Date.now() - 30 * 86400 * 1000);
  const matchStage = { createdAt: { $gte: since }, status: { $in: ['completed', 'assigned'] } };
  if (cityId) matchStage['pickupLocation.address'] = { $regex: cityId, $options: 'i' };

  const serviceBreakdown = await Order.aggregate([
    { $match: matchStage },
    { $group: { _id: '$service', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = serviceBreakdown.reduce((s, r) => s + r.count, 0) || 1;

  // Map services to worker skills and compute needed count
  // Assume 1 worker handles ~3 orders/day on average
  const ordersPerWorker = 3;
  const workerDemand    = {};

  for (const { _id: service, count } of serviceBreakdown) {
    const fraction      = count / total;
    const ordersForSkill = Math.round(predictedOrders * fraction);
    const workersNeeded  = Math.max(1, Math.ceil(ordersForSkill / ordersPerWorker));

    // Group into skill categories
    const skill = mapServiceToSkill(service);
    workerDemand[skill] = (workerDemand[skill] || 0) + workersNeeded;
  }

  return {
    cityId,
    targetDate: targetDateStr,
    predictedOrders,
    workerDemand,
    dow,
  };
}

function mapServiceToSkill(service) {
  if (!service) return 'general';
  const s = service.toLowerCase();
  if (s.includes('screen') || s.includes('battery') || s.includes('laptop') || s.includes('phone'))
    return 'electronics_repair';
  if (s.includes('bike') || s.includes('car') || s.includes('puncture') || s.includes('vehicle'))
    return 'vehicle_care';
  if (s.includes('pet')) return 'pet_care';
  if (s.includes('event')) return 'event_crew';
  if (s.includes('elder') || s.includes('medicine') || s.includes('family')) return 'family_assist';
  return 'general';
}

/**
 * Compare past ZIForecast predictions vs actual orders.
 */
async function getAccuracyReport(cityId) {
  const Order = getOrder();

  // Fetch the latest completed forecast for this city
  const forecasts = await ZIForecast.find({
    'scope.cityId':  cityId || 'all',
    type:            'demand',
    isStale:         false,
  })
    .sort({ generatedAt: -1 })
    .limit(10)
    .lean();

  if (!forecasts.length) {
    return { cityId, mae: null, mape: null, rmse: null, forecastsEvaluated: 0, message: 'No forecasts found' };
  }

  const actuals  = [];
  const preds    = [];
  let evaluated  = 0;

  for (const forecast of forecasts) {
    for (const point of (forecast.predictions || [])) {
      const pointDate = new Date(point.date);
      if (pointDate >= new Date()) continue; // skip future dates

      // Count actual orders on that date
      const dayStart = new Date(pointDate.toISOString().split('T')[0]);
      const dayEnd   = new Date(dayStart.getTime() + 86400 * 1000);
      const matchStage = { createdAt: { $gte: dayStart, $lt: dayEnd } };
      if (cityId && cityId !== 'all') {
        matchStage['pickupLocation.address'] = { $regex: cityId, $options: 'i' };
      }

      const actual = await Order.countDocuments(matchStage);
      actuals.push(actual);
      preds.push(point.value || 0);
      evaluated++;
    }
  }

  if (!evaluated) {
    return { cityId, mae: null, mape: null, rmse: null, forecastsEvaluated: 0, message: 'No past predictions to evaluate' };
  }

  return {
    cityId,
    mae:                Math.round(mae(actuals, preds) * 100) / 100,
    mape:               Math.round(mape(actuals, preds) * 100) / 100,
    rmse:               Math.round(rmse(actuals, preds) * 100) / 100,
    forecastsEvaluated: evaluated,
  };
}

/**
 * Retrain (refresh) all forecasts for a city.
 */
async function retrainModels(cityId) {
  const nextRetrain = new Date(Date.now() + 24 * 3600 * 1000);

  try {
    // Mark existing forecasts stale
    await ZIForecast.updateMany(
      { 'scope.cityId': cityId || 'all' },
      { $set: { isStale: true } }
    );

    // Regenerate demand forecast (30d and 90d)
    await forecastDemand(cityId, null, 30);
    await forecastDemand(cityId, null, 90);
    await forecastRevenue(cityId, 90);

    logger.info({ cityId }, 'ZI forecast models retrained');

    return {
      status:          'success',
      modelsRetrained: ['demand_30d', 'demand_90d', 'revenue_90d'],
      nextRetrain:     nextRetrain.toISOString(),
    };
  } catch (err) {
    logger.error({ err, cityId }, 'retrainModels failed');
    return {
      status:          'error',
      error:           err.message,
      modelsRetrained: [],
      nextRetrain:     nextRetrain.toISOString(),
    };
  }
}

module.exports = {
  forecastDemand,
  forecastRevenue,
  forecastWorkerDemand,
  getAccuracyReport,
  retrainModels,
  // Exported for testing
  holtWinters,
  simpleExponentialSmoothing,
  linearRegressionForecast,
  ensembleForecast,
};
