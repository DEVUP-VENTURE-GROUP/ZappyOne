'use strict';

/**
 * ZI Worker Intelligence Service
 * Computes composite performance scores, risk flags, and training plans for workers.
 */

const mongoose = require('mongoose');
const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const ZIWorkerIntel = require('../models/ZIWorkerIntel');
const logger = require('../../../utils/logger');

// Weights for composite score
const WEIGHTS = {
  productivity: 0.25,
  earnings:     0.20,
  quality:      0.30,
  attendance:   0.15,
  training:     0.10,
};

/**
 * Compute intelligence scores for a single worker and upsert ZIWorkerIntel.
 */
async function computeWorkerScores(workerId) {
  const workerObjectId =
    typeof workerId === 'string' ? new mongoose.Types.ObjectId(workerId) : workerId;

  const worker = await Worker.findById(workerObjectId);
  if (!worker) {
    throw new Error(`Worker ${workerId} not found`);
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch last 30 days orders for this worker
  const orders30d = await Order.find({
    workerId: workerObjectId,
    createdAt: { $gte: thirtyDaysAgo },
  })
    .select('status totalPaise pricing createdAt updatedAt userRating completedAt')
    .lean();

  const completedOrders = orders30d.filter((o) => o.status === 'completed');
  const cancelledOrders = orders30d.filter((o) => o.status === 'cancelled');

  // ── metrics30d ────────────────────────────────────────────────────────────
  const jobsCompleted = completedOrders.length;
  const jobsDeclined  = worker.penalties ? worker.penalties.totalCancels || 0 : 0;

  // Avg rating from completed orders that have a rating
  const ratedOrders = completedOrders.filter((o) => o.userRating != null);
  const avgRating =
    ratedOrders.length > 0
      ? ratedOrders.reduce((sum, o) => sum + o.userRating, 0) / ratedOrders.length
      : worker.rating || 0;

  // Avg completion time in minutes, capped at 120
  let avgCompletionTimeMinutes = 0;
  if (completedOrders.length > 0) {
    const timesMs = completedOrders
      .filter((o) => o.updatedAt && o.createdAt)
      .map((o) => new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime());
    if (timesMs.length > 0) {
      const avgMs = timesMs.reduce((s, t) => s + t, 0) / timesMs.length;
      avgCompletionTimeMinutes = Math.min(120, avgMs / (1000 * 60));
    }
  }

  // Earnings: worker gets 78% of order totalPaise
  const earningsPaise = Math.round(
    completedOrders.reduce((sum, o) => sum + (o.pricing?.totalPaise || 0), 0) * 0.78
  );

  // Online hours approximation: completedJobs (lifetime) pro-rated for 30d, 2hr per job
  // Use 30d jobs * 2 for more accurate 30d estimate
  const onlineHours = Math.max(1, jobsCompleted * 2);

  const earningsPerHour = Math.round(earningsPaise / onlineHours);

  // ── Scores ────────────────────────────────────────────────────────────────
  const productivityScore = Math.min(100, (jobsCompleted / 20) * 100);
  const earningsScore     = Math.min(100, (earningsPaise / 500000) * 100);
  const qualityScore      = Math.min(100, (avgRating / 5) * 100);
  // 160hr/month = full time baseline
  const attendanceScore   = Math.min(100, (onlineHours / 160) * 100);
  // Training: base 70, boost if worker has certifications
  const certCount = worker.certifications ? worker.certifications.length : 0;
  const trainingScore = Math.min(100, 70 + certCount * 5);

  const compositeScore =
    productivityScore * WEIGHTS.productivity +
    earningsScore     * WEIGHTS.earnings +
    qualityScore      * WEIGHTS.quality +
    attendanceScore   * WEIGHTS.attendance +
    trainingScore     * WEIGHTS.training;

  // ── Risk Flags ────────────────────────────────────────────────────────────
  // Churn: very low earnings per hour (< ₹15/hr = 1500 paise/hr)
  let churnProbability = 0.1;
  if (earningsPerHour < 1500 && jobsCompleted > 0) {
    churnProbability = 0.75;
  } else if (jobsCompleted === 0) {
    churnProbability = 0.6; // inactive worker
  } else {
    // Graduated: lower earnings → higher churn risk
    churnProbability = Math.max(0.1, 0.75 - (earningsPerHour / 1500) * 0.65);
  }

  // Burnout: too many online hours (> 240hr/month)
  const burnoutRisk = onlineHours > 240 ? 0.8 : Math.min(0.5, onlineHours / 240 * 0.5);

  // Fraud: suspiciously low rating with many completions
  const fraudRisk =
    avgRating < 2.5 && jobsCompleted > 10 ? 0.8 : avgRating < 3.0 ? 0.3 : 0.05;

  // ── Training Plan ─────────────────────────────────────────────────────────
  const trainingPlan = [];
  if (qualityScore < 60) {
    trainingPlan.push({
      module: 'customer_service',
      priority: qualityScore < 40 ? 'high' : 'medium',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });
  }
  if (productivityScore < 50) {
    trainingPlan.push({
      module: 'time_management',
      priority: productivityScore < 30 ? 'high' : 'medium',
      deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    });
  }
  if (fraudRisk > 0.5) {
    trainingPlan.push({
      module: 'ethics_compliance',
      priority: 'high',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  // ── Upsert ZIWorkerIntel ──────────────────────────────────────────────────
  const doc = await ZIWorkerIntel.findOneAndUpdate(
    { workerId: workerObjectId },
    {
      $set: {
        scores: {
          productivityScore: _round(productivityScore),
          earningsScore:     _round(earningsScore),
          qualityScore:      _round(qualityScore),
          attendanceScore:   _round(attendanceScore),
          trainingScore:     _round(trainingScore),
          compositeScore:    _round(compositeScore),
        },
        metrics30d: {
          jobsCompleted,
          jobsDeclined,
          avgRating:                _round(avgRating, 2),
          avgCompletionTimeMinutes: _round(avgCompletionTimeMinutes, 1),
          earningsPaise,
          onlineHours:              _round(onlineHours, 1),
          earningsPerHour,
        },
        riskFlags: {
          churnProbability: _round(churnProbability, 3),
          burnoutRisk:      _round(burnoutRisk, 3),
          fraudRisk:        _round(fraudRisk, 3),
        },
        trainingPlan,
        updatedAt: now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(
    { workerId: workerId.toString(), compositeScore: doc.scores.compositeScore },
    'worker-intel: scores computed'
  );

  return doc;
}

function _round(val, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Return paginated worker intel records.
 * Filters: minScore, minChurnRisk, cityId (requires join with Worker)
 */
async function getAllWorkerIntel(filters = {}) {
  const { minScore, minChurnRisk, cityId, page = 1, limit = 20 } = filters;

  const query = {};
  if (minScore != null) {
    query['scores.compositeScore'] = { $gte: Number(minScore) };
  }
  if (minChurnRisk != null) {
    query['riskFlags.churnProbability'] = { $gte: Number(minChurnRisk) };
  }

  const skip  = (Math.max(1, page) - 1) * Math.min(100, limit);
  const limitN = Math.min(100, Number(limit) || 20);

  // If cityId filter needed, join through Worker model
  let docs;
  let total;

  if (cityId) {
    // Get workerIds for that city
    const cityWorkers = await Worker.find({ cityId }).select('_id').lean();
    const workerIds = cityWorkers.map((w) => w._id);
    query.workerId = { $in: workerIds };
  }

  [docs, total] = await Promise.all([
    ZIWorkerIntel.find(query)
      .sort({ 'scores.compositeScore': -1 })
      .skip(skip)
      .limit(limitN)
      .populate('workerId', 'name phone skills rating completedJobs isOnline')
      .lean(),
    ZIWorkerIntel.countDocuments(query),
  ]);

  return {
    data: docs,
    pagination: {
      total,
      page: Number(page),
      limit: limitN,
      pages: Math.ceil(total / limitN),
    },
  };
}

/**
 * Return template-based insights for a single worker.
 */
async function getWorkerInsights(workerId) {
  const workerObjectId =
    typeof workerId === 'string' ? new mongoose.Types.ObjectId(workerId) : workerId;

  const doc = await ZIWorkerIntel.findOne({ workerId: workerObjectId })
    .populate('workerId', 'name completedJobs')
    .lean();

  if (!doc) {
    throw new Error(`No intel found for worker ${workerId}. Run recompute first.`);
  }

  const insights = [];
  const { scores, riskFlags, metrics30d } = doc;
  const workerName = doc.workerId?.name || 'This worker';

  // Churn risk
  if (riskFlags.churnProbability > 0.7) {
    insights.push(
      `${workerName} is at high churn risk (${(riskFlags.churnProbability * 100).toFixed(0)}%). Earnings per hour: ₹${Math.round(metrics30d.earningsPerHour / 100)}/hr — significantly below target of ₹15/hr.`
    );
  }

  // Burnout risk
  if (riskFlags.burnoutRisk > 0.7) {
    insights.push(
      `Burnout risk detected. ${workerName} has worked approximately ${metrics30d.onlineHours.toFixed(0)} hours this month — well above the recommended 160 hours.`
    );
  }

  // Fraud risk
  if (riskFlags.fraudRisk > 0.5) {
    insights.push(
      `Anomalous rating pattern detected for ${workerName}. Average rating ${metrics30d.avgRating.toFixed(1)}/5 with ${metrics30d.jobsCompleted} completed jobs. Recommend audit.`
    );
  }

  // Quality
  if (scores.qualityScore < 50) {
    insights.push(
      `Quality score low (${scores.qualityScore.toFixed(1)}/100). Customer satisfaction below threshold. Customer service training recommended.`
    );
  }

  // Productivity
  if (scores.productivityScore < 40) {
    insights.push(
      `Low productivity: only ${metrics30d.jobsCompleted} jobs completed in 30 days. Consider time management coaching.`
    );
  } else if (scores.productivityScore > 90) {
    insights.push(
      `Top performer: ${metrics30d.jobsCompleted} jobs in 30 days. Consider for mentorship programme.`
    );
  }

  // Earnings
  if (scores.earningsScore > 80) {
    insights.push(
      `High earner: ₹${Math.round(metrics30d.earningsPaise / 100).toLocaleString('en-IN')} earned in 30 days. Strong contributor.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      `${workerName} is performing within normal parameters. Composite score: ${scores.compositeScore.toFixed(1)}/100.`
    );
  }

  return insights;
}

/**
 * Bulk compute scores for all active/seen workers.
 */
async function bulkComputeAllWorkers() {
  const workers = await Worker.find({
    $or: [{ isOnline: true }, { completedJobs: { $gt: 0 } }],
    isBlocked: false,
    deletedAt: null,
  })
    .select('_id')
    .lean();

  logger.info({ count: workers.length }, 'worker-intel: bulk compute started');

  let succeeded = 0;
  let failed = 0;

  for (const worker of workers) {
    try {
      await computeWorkerScores(worker._id);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error({ err, workerId: worker._id }, 'worker-intel: bulk compute error');
    }
  }

  logger.info({ succeeded, failed }, 'worker-intel: bulk compute finished');
  return { succeeded, failed, total: workers.length };
}

/**
 * Return top workers by a specified metric for a city.
 * metric: 'earnings' | 'compositeScore' | 'qualityScore' | 'productivityScore'
 */
async function getWorkerLeaderboard(cityId, metric = 'earnings', limit = 20) {
  const VALID_METRICS = {
    earnings:         'metrics30d.earningsPaise',
    compositeScore:   'scores.compositeScore',
    qualityScore:     'scores.qualityScore',
    productivityScore: 'scores.productivityScore',
    attendanceScore:  'scores.attendanceScore',
  };

  const sortField = VALID_METRICS[metric] || 'metrics30d.earningsPaise';
  const limitN = Math.min(100, Number(limit) || 20);

  // Find workers in this city first
  const cityWorkerIds = cityId
    ? (await Worker.find({ cityId }).select('_id').lean()).map((w) => w._id)
    : null;

  const matchQuery = cityWorkerIds ? { workerId: { $in: cityWorkerIds } } : {};

  const docs = await ZIWorkerIntel.find(matchQuery)
    .sort({ [sortField]: -1 })
    .limit(limitN)
    .populate('workerId', 'name phone skills rating completedJobs cityId profilePhotoKey')
    .lean();

  return docs.map((doc, index) => ({
    rank: index + 1,
    workerId: doc.workerId?._id,
    name:     doc.workerId?.name,
    phone:    doc.workerId?.phone,
    skills:   doc.workerId?.skills,
    scores:   doc.scores,
    metrics:  doc.metrics30d,
    [metric]: _getNestedValue(doc, sortField),
  }));
}

function _getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc && acc[key], obj);
}

module.exports = {
  computeWorkerScores,
  getAllWorkerIntel,
  getWorkerInsights,
  bulkComputeAllWorkers,
  getWorkerLeaderboard,
};
