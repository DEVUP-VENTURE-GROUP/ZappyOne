/**
 * AI Time Estimator
 * Computes realistic service duration from actual historical order data.
 * "This plumbing job typically takes 45–90 minutes based on 312 recent jobs."
 * Competitors show static estimates. We show data-backed estimates.
 */
const Order  = require('../order/order.model');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const CACHE_TTL = 3600; // 1h

async function getServiceTimeEstimate({ service, subCategory, lat, lng }) {
  const cacheKey = `time_est:${service}:${subCategory || 'all'}`;
  const cached   = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }

  const since60d = new Date(Date.now() - 60 * 86400000);

  /* Find completed orders for this service in a ~10km radius */
  const pipeline = [
    {
      $match: {
        service,
        status: 'completed',
        completedAt: { $gte: since60d },
        ...(lat && lng ? {
          pickupLocation: {
            $near: {
              $geometry: { type: 'Point', coordinates: [lng, lat] },
              $maxDistance: 10000,
            },
          },
        } : {}),
      },
    },
    {
      $project: {
        durationMs: {
          $subtract: [
            '$completedAt',
            {
              $reduce: {
                input: '$statusHistory',
                initialValue: null,
                in: {
                  $cond: [
                    { $eq: ['$$this.status', 'in_progress'] },
                    '$$this.at',
                    '$$value',
                  ],
                },
              },
            },
          ],
        },
      },
    },
    { $match: { durationMs: { $gt: 600000, $lt: 28800000 } } }, // 10min–8h sanity
    {
      $group: {
        _id: null,
        count:  { $sum: 1 },
        avgMs:  { $avg: '$durationMs' },
        p25Ms:  { $percentile: { input: '$durationMs', p: [0.25], method: 'approximate' } },
        p75Ms:  { $percentile: { input: '$durationMs', p: [0.75], method: 'approximate' } },
        minMs:  { $min: '$durationMs' },
        maxMs:  { $max: '$durationMs' },
      },
    },
  ];

  let stats = null;
  try {
    const result = await Order.aggregate(pipeline);
    stats = result[0] || null;
  } catch (err) {
    /* percentile requires MongoDB 7+ — fall back to simpler query */
    try {
      const fallback = await Order.aggregate([
        pipeline[0], pipeline[1], pipeline[2],
        { $group: { _id: null, count: { $sum: 1 }, avgMs: { $avg: '$durationMs' }, minMs: { $min: '$durationMs' }, maxMs: { $max: '$durationMs' } } },
      ]);
      stats = fallback[0] || null;
    } catch (e2) {
      logger.warn({ err: e2.message, service }, '[TimeEstimator] Fallback failed');
    }
  }

  let estimate;
  if (!stats || stats.count < 5) {
    /* Not enough local data — use catalog default */
    const ServiceCatalog = require('./service-catalog.model');
    const svc = await ServiceCatalog.findOne({ code: service }).lean();
    const defMin = svc?.estimatedDurationMinutes || 60;
    estimate = {
      minMinutes:   Math.round(defMin * 0.7),
      maxMinutes:   Math.round(defMin * 1.4),
      avgMinutes:   defMin,
      sampleCount:  stats?.count || 0,
      isLocal:      false,
      confidence:   'low',
    };
  } else {
    const avgMin  = Math.round(stats.avgMs / 60000);
    const p25Min  = stats.p25Ms ? Math.round(stats.p25Ms[0] / 60000) : Math.round(avgMin * 0.7);
    const p75Min  = stats.p75Ms ? Math.round(stats.p75Ms[0] / 60000) : Math.round(avgMin * 1.3);
    estimate = {
      minMinutes:   p25Min,
      maxMinutes:   p75Min,
      avgMinutes:   avgMin,
      sampleCount:  stats.count,
      isLocal:      !!lat,
      confidence:   stats.count >= 30 ? 'high' : 'medium',
    };
  }

  /* Human-readable label */
  const { minMinutes: mn, maxMinutes: mx } = estimate;
  if (mx - mn <= 15) {
    estimate.label = `About ${mn}–${mx} min`;
  } else if (mx <= 60) {
    estimate.label = `${mn}–${mx} minutes`;
  } else {
    const hrMin = Math.round(mn / 60 * 10) / 10;
    const hrMax = Math.round(mx / 60 * 10) / 10;
    estimate.label = `${hrMin}–${hrMax} hours`;
  }

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(estimate)).catch(() => {});
  return estimate;
}

module.exports = { getServiceTimeEstimate };
