'use strict';

/**
 * ZI Partner Intelligence Service
 * Computes composite scores and churn risk for event partners.
 */

const mongoose = require('mongoose');
const EventBooking = require('../../events/event-booking.model');
const EventPartner = require('../../events/event-partner.model');
const ZIPartnerIntel = require('../models/ZIPartnerIntel');
const logger = require('../../../utils/logger');

// Weight constants
const WEIGHTS = {
  revenue:    0.25,
  quality:    0.30,
  acceptance: 0.15,
  completion: 0.15,
  loyalty:    0.15,
};

/**
 * Compute city average GMV in paise for normalisation.
 * Returns 0 if no data, avoiding division-by-zero downstream.
 */
async function _getCityAvgRevenue(cityId) {
  try {
    const result = await EventBooking.aggregate([
      {
        $lookup: {
          from: 'eventpartners',
          localField: 'partnerId',
          foreignField: '_id',
          as: 'partner',
        },
      },
      { $unwind: '$partner' },
      {
        $match: {
          'partner.cities': { $in: [cityId] },
          status: { $in: ['completed', 'confirmed', 'partner_assigned', 'in_progress'] },
        },
      },
      {
        $group: {
          _id: '$partnerId',
          totalRevenue: { $sum: '$pricing.totalPaise' },
        },
      },
      {
        $group: {
          _id: null,
          avgRevenue: { $avg: '$totalRevenue' },
        },
      },
    ]);

    return result.length > 0 ? result[0].avgRevenue : 0;
  } catch (err) {
    logger.error({ err }, 'partner-intel: _getCityAvgRevenue failed');
    return 0;
  }
}

/**
 * Compute intelligence scores for a single partner and upsert ZIPartnerIntel.
 */
async function computePartnerScores(partnerId) {
  const partnerObjectId =
    typeof partnerId === 'string' ? new mongoose.Types.ObjectId(partnerId) : partnerId;

  // Load partner record
  const partner = await EventPartner.findById(partnerObjectId);
  if (!partner) {
    throw new Error(`EventPartner ${partnerId} not found`);
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all bookings for this partner
  const allBookings = await EventBooking.find({ partnerId: partnerObjectId }).lean();
  const recentBookings = allBookings.filter(
    (b) => new Date(b.createdAt) >= thirtyDaysAgo
  );
  const completedBookings = allBookings.filter((b) => b.status === 'completed');
  const acceptedBookings = allBookings.filter(
    (b) => !['pending_payment', 'cancelled'].includes(b.status)
  );

  // ── Revenue Score (0-100) ─────────────────────────────────────────────────
  const totalRevenue30d = recentBookings.reduce(
    (sum, b) => sum + (b.pricing?.totalPaise || 0),
    0
  );
  const partnerCityId = partner.cities && partner.cities[0] ? partner.cities[0] : 'unknown';
  const cityAvgRevenue = await _getCityAvgRevenue(partnerCityId);
  let revenueScore = 0;
  if (cityAvgRevenue > 0) {
    revenueScore = Math.min(100, (totalRevenue30d / cityAvgRevenue) * 100);
  } else if (totalRevenue30d > 0) {
    revenueScore = 50; // No city average to compare against, give median score
  }

  // ── Quality Score (0-100): avg rating from completed bookings ────────────
  const ratedBookings = completedBookings.filter((b) => b.userRating != null);
  let qualityScore = 0;
  if (ratedBookings.length > 0) {
    const avgRating =
      ratedBookings.reduce((sum, b) => sum + b.userRating, 0) / ratedBookings.length;
    qualityScore = (avgRating / 5) * 100;
  } else if (partner.rating && partner.rating > 0) {
    // Fall back to partner's stored aggregate rating
    qualityScore = (partner.rating / 5) * 100;
  }

  // ── Acceptance Score (0-100): accepted / total requests ──────────────────
  const totalRequests = allBookings.length;
  const totalAccepted = acceptedBookings.length;
  const acceptanceScore = totalRequests > 0 ? (totalAccepted / totalRequests) * 100 : 75;

  // ── Completion Score (0-100): completed / accepted ────────────────────────
  const completionScore =
    totalAccepted > 0 ? (completedBookings.length / totalAccepted) * 100 : 75;

  // ── Response Score (0-100): dummy 75 unless tracked ──────────────────────
  const responseScore = 75;

  // ── Loyalty Score (0-100): months active / 24 * 100 ─────────────────────
  const partnerCreatedAt = new Date(partner.createdAt);
  const monthsActive =
    (now.getFullYear() - partnerCreatedAt.getFullYear()) * 12 +
    (now.getMonth() - partnerCreatedAt.getMonth());
  const loyaltyScore = Math.min(100, (Math.max(0, monthsActive) / 24) * 100);

  // ── Composite Score ───────────────────────────────────────────────────────
  const compositeScore =
    revenueScore    * WEIGHTS.revenue +
    qualityScore    * WEIGHTS.quality +
    acceptanceScore * WEIGHTS.acceptance +
    completionScore * WEIGHTS.completion +
    loyaltyScore    * WEIGHTS.loyalty;

  // ── Churn Probability ─────────────────────────────────────────────────────
  const hasRecentBooking = recentBookings.length > 0;
  let churnProbability;
  if (!hasRecentBooking && loyaltyScore < 40) {
    churnProbability = 0.8;
  } else {
    // Formula: baseline 0.1, adjusted by quality and completion inversion
    const qualityFactor  = (100 - qualityScore)  / 100;
    const completeFactor = (100 - completionScore) / 100;
    const recentFactor   = hasRecentBooking ? 0 : 0.3;
    churnProbability = Math.min(
      0.95,
      0.1 + qualityFactor * 0.25 + completeFactor * 0.2 + recentFactor
    );
  }

  // ── Financial snapshot ────────────────────────────────────────────────────
  const gmv30dPaise = totalRevenue30d;
  const commission30dPaise = Math.round(gmv30dPaise * 0.18);
  const avgOrderValuePaise =
    recentBookings.length > 0
      ? Math.round(gmv30dPaise / recentBookings.length)
      : 0;

  // WoW revenue growth
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thisWeekRevenue = recentBookings
    .filter((b) => new Date(b.createdAt) >= sevenDaysAgo)
    .reduce((sum, b) => sum + (b.pricing?.totalPaise || 0), 0);
  const lastWeekRevenue = allBookings
    .filter(
      (b) =>
        new Date(b.createdAt) >= fourteenDaysAgo &&
        new Date(b.createdAt) < sevenDaysAgo
    )
    .reduce((sum, b) => sum + (b.pricing?.totalPaise || 0), 0);
  const revenueGrowthWoW =
    lastWeekRevenue > 0
      ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100
      : 0;

  // ── Quality / fraud risk flags ────────────────────────────────────────────
  const qualityRisk = qualityScore < 40 ? 80 : qualityScore < 60 ? 50 : 10;
  const fraudRisk =
    completedBookings.length > 5 && qualityScore < 20 ? 70 : 5;

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations = [];
  if (churnProbability > 0.7) {
    recommendations.push({
      type: 'churn_risk',
      message: 'Partner at high churn risk. Reach out with retention offer.',
      priority: 'critical',
    });
  }
  if (qualityScore < 50) {
    recommendations.push({
      type: 'quality_improvement',
      message: 'Quality score below threshold. Consider quality coaching session.',
      priority: 'high',
    });
  }
  if (acceptanceScore < 60) {
    recommendations.push({
      type: 'acceptance_rate',
      message: 'Low acceptance rate detected. Investigate availability issues.',
      priority: 'medium',
    });
  }

  // ── Upsert ZIPartnerIntel ─────────────────────────────────────────────────
  const doc = await ZIPartnerIntel.findOneAndUpdate(
    { partnerId: partnerId.toString() },
    {
      $set: {
        partnerName: partner.businessName,
        cityId: partnerCityId,
        category: 'events',
        scores: {
          revenueScore:    Math.round(revenueScore * 100) / 100,
          qualityScore:    Math.round(qualityScore * 100) / 100,
          acceptanceScore: Math.round(acceptanceScore * 100) / 100,
          completionScore: Math.round(completionScore * 100) / 100,
          responseScore,
          loyaltyScore:    Math.round(loyaltyScore * 100) / 100,
          compositeScore:  Math.round(compositeScore * 100) / 100,
        },
        financials: {
          gmv30dPaise,
          commission30dPaise,
          avgOrderValuePaise,
          revenueGrowthWoW: Math.round(revenueGrowthWoW * 100) / 100,
        },
        riskFlags: {
          churnProbability: Math.round(churnProbability * 1000) / 1000,
          qualityRisk,
          fraudRisk,
        },
        recommendations,
        updatedAt: now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info(
    { partnerId: partnerId.toString(), compositeScore: doc.scores.compositeScore },
    'partner-intel: scores computed'
  );

  return doc;
}

/**
 * Return paginated partner intel records.
 * Filters: cityId, minScore, maxChurnRisk
 */
async function getAllPartnerIntel(filters = {}) {
  const { cityId, minScore, maxChurnRisk, page = 1, limit = 20 } = filters;

  const query = {};
  if (cityId) query.cityId = cityId.toLowerCase();
  if (minScore != null) query['scores.compositeScore'] = { $gte: Number(minScore) };
  if (maxChurnRisk != null) {
    query['riskFlags.churnProbability'] = { $lte: Number(maxChurnRisk) };
  }

  const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
  const limitN = Math.min(100, Number(limit) || 20);

  const [docs, total] = await Promise.all([
    ZIPartnerIntel.find(query)
      .sort({ 'scores.compositeScore': -1 })
      .skip(skip)
      .limit(limitN)
      .lean(),
    ZIPartnerIntel.countDocuments(query),
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
 * Return template-based AI-style insights for a single partner.
 */
async function getPartnerInsights(partnerId) {
  const doc = await ZIPartnerIntel.findOne({ partnerId: partnerId.toString() }).lean();
  if (!doc) {
    throw new Error(`No intel found for partner ${partnerId}. Run recompute first.`);
  }

  const insights = [];
  const { scores, riskFlags, financials } = doc;

  // Churn risk insight
  if (riskFlags.churnProbability > 0.7) {
    const lastBookingMs = doc.updatedAt
      ? Date.now() - new Date(doc.updatedAt).getTime()
      : null;
    const daysSinceUpdate = lastBookingMs
      ? Math.floor(lastBookingMs / (1000 * 60 * 60 * 24))
      : 'unknown';
    insights.push(
      `Partner at high risk of churning. Last intel update was ${daysSinceUpdate} days ago. Churn probability: ${(riskFlags.churnProbability * 100).toFixed(0)}%.`
    );
  }

  // Quality insight
  if (scores.qualityScore < 50) {
    insights.push(
      `Quality score low (${scores.qualityScore.toFixed(1)}/100). Customer complaints likely detected. Recommend coaching or performance review.`
    );
  }

  // Revenue insight
  if (financials.revenueGrowthWoW < -20) {
    insights.push(
      `Revenue declined ${Math.abs(financials.revenueGrowthWoW).toFixed(1)}% week-over-week. Investigate supply or demand issues.`
    );
  } else if (financials.revenueGrowthWoW > 20) {
    insights.push(
      `Strong revenue growth: +${financials.revenueGrowthWoW.toFixed(1)}% WoW. Partner performing above average.`
    );
  }

  // Acceptance insight
  if (scores.acceptanceScore < 60) {
    insights.push(
      `Acceptance rate below 60% (${scores.acceptanceScore.toFixed(1)}%). Partner may be over-committed or selectively rejecting bookings.`
    );
  }

  // Loyalty insight
  if (scores.loyaltyScore > 80) {
    insights.push(
      `Long-term partner (loyalty score ${scores.loyaltyScore.toFixed(0)}/100). Consider exclusive tier or loyalty rewards.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      `Partner performing within normal parameters. Composite score: ${scores.compositeScore.toFixed(1)}/100.`
    );
  }

  return insights;
}

/**
 * Bulk compute scores for all active event partners.
 * Safe for weekly cron — processes one by one with error isolation.
 */
async function bulkComputeAllPartners() {
  const partners = await EventPartner.find({ isActive: true, isBlocked: false })
    .select('_id')
    .lean();

  logger.info({ count: partners.length }, 'partner-intel: bulk compute started');

  let succeeded = 0;
  let failed = 0;

  for (const partner of partners) {
    try {
      await computePartnerScores(partner._id);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error({ err, partnerId: partner._id }, 'partner-intel: bulk compute error for partner');
    }
  }

  logger.info({ succeeded, failed }, 'partner-intel: bulk compute finished');
  return { succeeded, failed, total: partners.length };
}

module.exports = {
  computePartnerScores,
  getAllPartnerIntel,
  getPartnerInsights,
  bulkComputeAllPartners,
};
