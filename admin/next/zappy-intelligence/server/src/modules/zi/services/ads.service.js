'use strict';

/**
 * ZI Internal Ads Platform Service
 * Campaign management, targeting, impression/click/conversion tracking.
 */

const mongoose = require('mongoose');
const { redis } = require('../../../config/redis');
const ZIAdsCampaign = require('../models/ZIAdsCampaign');
const logger = require('../../../utils/logger');

const REDIS_ADS_SET    = 'zi:active_ads';
const IMPRESSION_TTL   = 86400; // 24h for frequency cap keys
const FREQ_CAP_DAILY   = 3;     // max impressions per user per campaign per day

// ── createCampaign ────────────────────────────────────────────────────────────

async function createCampaign(data, userId) {
  const {
    advertiserId,
    advertiserName,
    advertiserType,
    name,
    type,
    targeting = {},
    budget,
    creative = {},
    startDate,
    endDate,
  } = data;

  // Validation
  if (!advertiserId || !advertiserName || !advertiserType || !name || !type) {
    throw Object.assign(new Error('advertiserId, advertiserName, advertiserType, name, type are required'), { statusCode: 400 });
  }
  if (!budget || !budget.totalPaise || !budget.dailyPaise || !budget.model) {
    throw Object.assign(new Error('budget.totalPaise, budget.dailyPaise, and budget.model are required'), { statusCode: 400 });
  }
  if (!startDate || !endDate) {
    throw Object.assign(new Error('startDate and endDate are required'), { statusCode: 400 });
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw Object.assign(new Error('Invalid startDate or endDate'), { statusCode: 400 });
  }
  if (end <= start) {
    throw Object.assign(new Error('endDate must be after startDate'), { statusCode: 400 });
  }
  if (end <= new Date()) {
    throw Object.assign(new Error('endDate must be in the future'), { statusCode: 400 });
  }
  if (budget.totalPaise < budget.dailyPaise) {
    throw Object.assign(new Error('totalPaise must be >= dailyPaise'), { statusCode: 400 });
  }

  const userObjectId =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const campaign = await ZIAdsCampaign.create({
    advertiserId,
    advertiserName,
    advertiserType,
    name,
    type,
    targeting: {
      cities:       targeting.cities       || [],
      categories:   targeting.categories   || [],
      userSegments: targeting.userSegments || [],
      deviceTypes:  targeting.deviceTypes  || [],
    },
    budget: {
      totalPaise:    budget.totalPaise,
      dailyPaise:    budget.dailyPaise,
      spentPaise:    0,
      model:         budget.model,
      bidAmountPaise: budget.bidAmountPaise || 0,
    },
    creative: {
      imageUrl:  creative.imageUrl  || null,
      headline:  creative.headline  || '',
      cta:       creative.cta       || '',
      deeplink:  creative.deeplink  || '',
      body:      creative.body      || '',
    },
    startDate: start,
    endDate:   end,
    status:    'draft',
    createdBy: userObjectId,
  });

  logger.info({ campaignId: campaign._id, name }, 'ads: campaign created');
  return campaign;
}

// ── activateCampaign ──────────────────────────────────────────────────────────

async function activateCampaign(id, userId) {
  const campaign = await ZIAdsCampaign.findById(id);
  if (!campaign) {
    throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  }
  if (campaign.status === 'active') {
    return campaign; // already active
  }
  if (campaign.status === 'completed') {
    throw Object.assign(new Error('Cannot activate a completed campaign'), { statusCode: 400 });
  }

  const now = new Date();
  if (campaign.endDate <= now) {
    throw Object.assign(new Error('Campaign end date has passed'), { statusCode: 400 });
  }
  if (campaign.budget.spentPaise >= campaign.budget.totalPaise) {
    throw Object.assign(new Error('Campaign budget is exhausted'), { statusCode: 400 });
  }

  campaign.status = 'active';
  await campaign.save();

  // Register in Redis sorted set for fast retrieval — score = bid amount
  const score = campaign.budget.bidAmountPaise || campaign.budget.dailyPaise;
  await redis.zadd(REDIS_ADS_SET, score, campaign._id.toString());

  logger.info({ campaignId: id }, 'ads: campaign activated');
  return campaign;
}

// ── getActiveCampaigns ────────────────────────────────────────────────────────

async function getActiveCampaigns(targeting = {}, viewerUserId = null) {
  const { city, category, deviceType, userSegment } = targeting;
  const now = new Date();

  // Get active campaign IDs from Redis sorted set (highest bid first)
  const campaignIds = await redis.zrevrange(REDIS_ADS_SET, 0, 49);

  // Build DB query — always re-verify status from DB (Redis is a cache)
  const dbQuery = {
    status:    'active',
    startDate: { $lte: now },
    endDate:   { $gt:  now },
  };

  if (campaignIds.length > 0) {
    dbQuery._id = { $in: campaignIds };
  }

  // Targeting filters (OR-style: match if campaign targets this or is untargeted)
  const targetingConditions = [];
  if (city) {
    targetingConditions.push({
      $or: [
        { 'targeting.cities': { $size: 0 } },
        { 'targeting.cities': city },
      ],
    });
  }
  if (category) {
    targetingConditions.push({
      $or: [
        { 'targeting.categories': { $size: 0 } },
        { 'targeting.categories': category },
      ],
    });
  }
  if (deviceType) {
    targetingConditions.push({
      $or: [
        { 'targeting.deviceTypes': { $size: 0 } },
        { 'targeting.deviceTypes': deviceType },
      ],
    });
  }
  if (userSegment) {
    targetingConditions.push({
      $or: [
        { 'targeting.userSegments': { $size: 0 } },
        { 'targeting.userSegments': userSegment },
      ],
    });
  }

  if (targetingConditions.length > 0) {
    dbQuery.$and = targetingConditions;
  }

  let campaigns = await ZIAdsCampaign.find(dbQuery)
    .sort({ 'budget.bidAmountPaise': -1 })
    .limit(20)
    .lean();

  // Apply frequency capping if a viewer is known
  if (viewerUserId) {
    const eligible = [];
    for (const campaign of campaigns) {
      const freqKey = `zi:ads:freq:${campaign._id}:${viewerUserId}:${_todayStr()}`;
      const count   = await redis.get(freqKey);
      if (!count || parseInt(count, 10) < FREQ_CAP_DAILY) {
        eligible.push(campaign);
      }
    }
    return eligible;
  }

  return campaigns;
}

// ── recordImpression ──────────────────────────────────────────────────────────

async function recordImpression(campaignId, userId, placement = 'feed') {
  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);

  // Atomic Redis increment
  const impressionKey = `zi:ads:${campaignId}:impressions`;
  await redis.incr(impressionKey);

  // Frequency cap tracking
  const freqKey = `zi:ads:freq:${campaignId}:${userId}:${_todayStr()}`;
  const pipeline = redis.pipeline();
  pipeline.incr(freqKey);
  pipeline.expire(freqKey, IMPRESSION_TTL);
  await pipeline.exec();

  // Fetch campaign to compute CPM deduction
  const campaign = await ZIAdsCampaign.findById(campaignObjectId).select('budget metrics');
  if (!campaign) return;

  // CPM deduction: cost per 1000 impressions
  let spendDeduction = 0;
  if (campaign.budget.model === 'cpm') {
    spendDeduction = Math.round(campaign.budget.bidAmountPaise / 1000);
  }

  await ZIAdsCampaign.findByIdAndUpdate(campaignObjectId, {
    $inc: {
      'metrics.impressions': 1,
      'budget.spentPaise':   spendDeduction,
    },
  });

  logger.debug({ campaignId, userId, placement }, 'ads: impression recorded');
}

// ── recordClick ───────────────────────────────────────────────────────────────

async function recordClick(campaignId, userId) {
  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);

  const clickKey = `zi:ads:${campaignId}:clicks`;
  await redis.incr(clickKey);

  const campaign = await ZIAdsCampaign.findById(campaignObjectId).select('budget metrics');
  if (!campaign) return;

  let spendDeduction = 0;
  if (campaign.budget.model === 'cpc') {
    spendDeduction = campaign.budget.bidAmountPaise || 0;
  }

  const updated = await ZIAdsCampaign.findByIdAndUpdate(
    campaignObjectId,
    {
      $inc: {
        'metrics.clicks':      1,
        'budget.spentPaise':   spendDeduction,
      },
    },
    { new: true }
  );

  // Recalculate CTR on the updated doc
  if (updated && updated.metrics.impressions > 0) {
    updated.metrics.ctr = updated.metrics.clicks / updated.metrics.impressions;
    await updated.save();
  }

  logger.debug({ campaignId, userId }, 'ads: click recorded');
}

// ── recordConversion ──────────────────────────────────────────────────────────

async function recordConversion(campaignId, userId, orderId) {
  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);

  const updated = await ZIAdsCampaign.findByIdAndUpdate(
    campaignObjectId,
    { $inc: { 'metrics.conversions': 1 } },
    { new: true }
  );

  if (!updated) return;

  // Recalculate CVR
  if (updated.metrics.clicks > 0) {
    updated.metrics.cvr = updated.metrics.conversions / updated.metrics.clicks;
    await updated.save();
  }

  logger.info({ campaignId, userId, orderId }, 'ads: conversion recorded');
  return updated;
}

// ── getCampaignAnalytics ──────────────────────────────────────────────────────

async function getCampaignAnalytics(campaignId) {
  const campaign = await ZIAdsCampaign.findById(campaignId).lean();
  if (!campaign) {
    throw Object.assign(new Error('Campaign not found'), { statusCode: 404 });
  }

  const { metrics, budget } = campaign;
  const impressions = metrics.impressions || 0;
  const clicks      = metrics.clicks      || 0;
  const conversions = metrics.conversions || 0;
  const spentPaise  = budget.spentPaise   || 0;

  const ctr = impressions > 0 ? _round(clicks / impressions, 4) : 0;
  const cvr = clicks > 0      ? _round(conversions / clicks, 4) : 0;
  const cpc = clicks > 0      ? Math.round(spentPaise / clicks) : 0;
  const cpm = impressions > 0 ? Math.round((spentPaise / impressions) * 1000) : 0;

  // ROAS: if we have revenue from conversions (can't know order value here, use estimate)
  const estimatedRevenuePaise = conversions * 50000; // ₹500 avg order estimate
  const roas = spentPaise > 0 ? _round(estimatedRevenuePaise / spentPaise, 2) : 0;

  return {
    campaignId:     campaign._id,
    name:           campaign.name,
    status:         campaign.status,
    impressions,
    clicks,
    conversions,
    spentPaise,
    spentRs:        _round(spentPaise / 100, 2),
    remainingPaise: Math.max(0, budget.totalPaise - spentPaise),
    ctr,
    cvr,
    cpcPaise:       cpc,
    cpmPaise:       cpm,
    roas,
    startDate:      campaign.startDate,
    endDate:        campaign.endDate,
    generatedAt:    new Date().toISOString(),
  };
}

// ── pauseExhaustedCampaigns ───────────────────────────────────────────────────

async function pauseExhaustedCampaigns() {
  const now = new Date();

  // Find campaigns that are active but either budget exhausted or end date passed
  const campaigns = await ZIAdsCampaign.find({
    status: 'active',
    $or: [
      { endDate: { $lte: now } },
      { $expr: { $gte: ['$budget.spentPaise', '$budget.totalPaise'] } },
    ],
  }).select('_id name budget endDate');

  let paused = 0;
  let completed = 0;

  for (const campaign of campaigns) {
    const newStatus = campaign.endDate <= now ? 'completed' : 'paused';
    await ZIAdsCampaign.findByIdAndUpdate(campaign._id, { status: newStatus });

    // Remove from Redis active set
    await redis.zrem(REDIS_ADS_SET, campaign._id.toString());

    if (newStatus === 'completed') {
      completed++;
      logger.info({ campaignId: campaign._id, name: campaign.name }, 'ads: campaign completed (end date passed)');
    } else {
      paused++;
      logger.info({ campaignId: campaign._id, name: campaign.name }, 'ads: campaign paused (budget exhausted)');
    }
  }

  return { paused, completed, checked: campaigns.length };
}

// ── getAdsRevenue ─────────────────────────────────────────────────────────────

async function getAdsRevenue(period = 'last30d') {
  const { start, end } = _getPeriodDates(period);

  const result = await ZIAdsCampaign.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id:              '$advertiserType',
        totalSpentPaise:  { $sum: '$budget.spentPaise' },
        campaignCount:    { $sum: 1 },
        totalImpressions: { $sum: '$metrics.impressions' },
        totalClicks:      { $sum: '$metrics.clicks' },
        totalConversions: { $sum: '$metrics.conversions' },
      },
    },
  ]);

  const totalRevenue = result.reduce((sum, r) => sum + r.totalSpentPaise, 0);

  return {
    period,
    totalRevenuePaise: totalRevenue,
    totalRevenueRs:    _round(totalRevenue / 100, 2),
    byAdvertiserType:  result.map((r) => ({
      advertiserType:   r._id,
      revenuePaise:     r.totalSpentPaise,
      campaigns:        r.campaignCount,
      impressions:      r.totalImpressions,
      clicks:           r.totalClicks,
      conversions:      r.totalConversions,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function _round(val, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round((val || 0) * f) / f;
}

function _getPeriodDates(period) {
  const now = new Date();
  let start;
  switch (period) {
    case 'last7d':  start = new Date(now.getTime() - 7  * 86400000); break;
    case 'last30d': start = new Date(now.getTime() - 30 * 86400000); break;
    case 'last90d': start = new Date(now.getTime() - 90 * 86400000); break;
    case 'mtd':     start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'ytd':     start = new Date(now.getFullYear(), 0, 1); break;
    default:        start = new Date(now.getTime() - 30 * 86400000);
  }
  return { start, end: now };
}

module.exports = {
  createCampaign,
  activateCampaign,
  getActiveCampaigns,
  recordImpression,
  recordClick,
  recordConversion,
  getCampaignAnalytics,
  pauseExhaustedCampaigns,
  getAdsRevenue,
};
