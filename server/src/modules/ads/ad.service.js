const crypto  = require('crypto');
const Ad       = require('./ad.model');
const AdEvent  = require('./ad-event.model');
const AdWallet = require('./ad-wallet.model');
const { redis }  = require('../../config/redis');
const logger   = require('../../utils/logger');

// Placement-aware ad serving

/**
 * Serve ads for a specific placement with relevance scoring.
 * Uses Redis cache (5 min) keyed by placement+city+category.
 * Falls back gracefully on any error — ads must never break the page.
 */
async function getAdsByPlacement({ placement, city, categoryId, keywords, userId, limit = 3 }) {
  try {
    const cacheKey = `ads:p:${placement}:${city || '_'}:${categoryId || '_'}`;
    const cached   = await redis.get(cacheKey).catch(() => null);
    let candidates = cached ? JSON.parse(cached) : null;

    if (!candidates) {
      const now = new Date();
      candidates = await Ad.find({
        status:    'active',
        placements: placement,
        'schedule.startAt': { $lte: now },
        'schedule.endAt':   { $gte: now },
        $or: [
          { 'billing.budget': 0 },
          { $expr: { $lt: ['$stats.spend', '$billing.budget'] } },
        ],
      }).lean();

      await redis.set(cacheKey, JSON.stringify(candidates), 'EX', 300).catch(() => {});
    }

    // Filter by targeting context
    const eligible = candidates.filter(ad => {
      const t = ad.targeting || {};
      if (t.cities?.length && city && !t.cities.includes(city.toLowerCase())) return false;
      if (t.eventCategories?.length && categoryId && !t.eventCategories.includes(String(categoryId))) return false;
      if (t.serviceCategories?.length && categoryId && !t.serviceCategories.includes(String(categoryId))) return false;
      if (placement === 'search_ads' && t.keywords?.length && keywords) {
        const q = (keywords || '').toLowerCase();
        if (!t.keywords.some(k => q.includes(k.toLowerCase()) || k.toLowerCase().includes(q))) return false;
      }
      // Daily cap check
      if (ad.billing?.dailyCapPaise > 0 && ad.billing?.spentTodayPaise >= ad.billing?.dailyCapPaise) return false;
      return true;
    });

    // Relevance scoring: bid × relevance multiplier
    const scored = eligible.map(ad => {
      let score = (ad.billing?.rate || 1);
      const t   = ad.targeting || {};
      if (categoryId && (t.eventCategories?.includes(String(categoryId)) || t.serviceCategories?.includes(String(categoryId)))) score *= 1.5;
      if (city && t.cities?.includes(city.toLowerCase())) score *= 1.3;
      if (keywords && t.keywords?.some(k => (keywords||'').toLowerCase().includes(k.toLowerCase()))) score *= 1.4;
      return { ...ad, _score: score };
    }).sort((a, b) => b._score - a._score);

    return scored.slice(0, limit);
  } catch (err) {
    logger.warn({ err: err.message, placement }, '[ADS] serveAds failed — returning empty');
    return [];
  }
}

/** Legacy: all active ads for homepage banner (backward compat) */
async function getActiveAds({ audience, limit = 8 }) {
  const now = new Date();
  const audienceFilter = audience === 'users'
    ? { audience: { $in: ['users', 'both'] } }
    : audience === 'workers'
    ? { audience: { $in: ['workers', 'both'] } }
    : {};

  const ads = await Ad.find({
    ...audienceFilter,
    status: 'active',
    'schedule.startAt': { $lte: now },
    'schedule.endAt':   { $gte: now },
  }).sort({ createdAt: -1 }).limit(limit).lean();

  return ads.filter(ad => {
    if (!ad.schedule?.impressionsLimit) return true;
    return (ad.stats?.impressions || 0) < ad.schedule.impressionsLimit;
  });
}

// Event tracking + fraud detection

function fp(ip = '', ua = '') {
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex').slice(0, 16);
}

async function recordImpression(adId, { userId, ip, ua, placement, meta } = {}) {
  try {
    const fingerprint = fp(ip, ua);
    const dedupKey    = `ad:imp:${adId}:${fingerprint}`;

    // Dedup: one impression per fingerprint per hour per ad
    const already = await redis.get(dedupKey).catch(() => null);
    if (!already) {
      await redis.set(dedupKey, '1', 'EX', 3600).catch(() => {});
      await Ad.updateOne({ _id: adId }, { $inc: { 'stats.impressions': 1 } });

      const ad = await Ad.findById(adId).select('billing advertiser').lean();
      let costPaise = 0;
      if (ad?.billing?.model === 'cpm' && ad.billing.rate > 0) {
        costPaise = Math.round(ad.billing.rate / 1000);
        if (ad.advertiser?.id) await _chargeWallet(ad.advertiser.id, adId, costPaise);
        else await Ad.updateOne({ _id: adId }, { $inc: { 'stats.spend': costPaise } });
      }

      await AdEvent.create({ adId, type: 'impression', placement, userId, ip, fingerprint, meta, costPaise }).catch(() => {});
      await _checkBudget(adId);
    }
  } catch (err) {
    logger.warn({ err: err.message, adId }, '[ADS] Impression record failed');
  }
}

async function recordClick(adId, { userId, ip, ua, placement, meta } = {}) {
  try {
    const fingerprint = fp(ip, ua);
    const fraudKey    = `ad:click:${adId}:${fingerprint}`;

    // Fraud: 1 billed click per fingerprint per ad per 24h
    const isFraud = !!(await redis.get(fraudKey).catch(() => null));
    if (!isFraud) await redis.set(fraudKey, '1', 'EX', 86400).catch(() => {});

    const ad = await Ad.findByIdAndUpdate(adId, { $inc: { 'stats.clicks': 1 } }, { new: true }).lean();
    let costPaise = 0;
    if (!isFraud && ad?.billing?.model === 'cpc' && ad.billing.rate > 0) {
      costPaise = ad.billing.rate;
      if (ad.advertiser?.id) await _chargeWallet(ad.advertiser.id, adId, costPaise);
      else await Ad.updateOne({ _id: adId }, { $inc: { 'stats.spend': costPaise } });
      await _checkBudget(adId);
    }

    await AdEvent.create({ adId, type: 'click', placement, userId, ip, fingerprint, meta, costPaise, isFraud }).catch(() => {});
    return { ok: true, isFraud };
  } catch (err) {
    logger.warn({ err: err.message, adId }, '[ADS] Click record failed');
    return { ok: false };
  }
}

async function recordLead(adId, { userId, meta } = {}) {
  try {
    await Ad.updateOne({ _id: adId }, { $inc: { 'stats.leads': 1 } });
    const ad = await Ad.findById(adId).select('billing advertiser').lean();
    let costPaise = 0;
    if (ad?.billing?.model === 'cpl' && ad.billing.rate > 0) {
      costPaise = ad.billing.rate;
      if (ad.advertiser?.id) await _chargeWallet(ad.advertiser.id, adId, costPaise);
    }
    await AdEvent.create({ adId, type: 'lead', userId, meta, costPaise }).catch(() => {});
  } catch (err) {
    logger.warn({ err: err.message, adId }, '[ADS] Lead record failed');
  }
}

// Wallet

async function _chargeWallet(advertiserId, adId, costPaise) {
  if (costPaise <= 0) return;

  const wallet = await AdWallet.findOneAndUpdate(
    { advertiserId, creditsPaise: { $gte: costPaise } },
    {
      $inc: { creditsPaise: -costPaise, lifetimeSpentPaise: costPaise },
      $push: {
        ledger: {
          $each:  [{ type: 'spend', amountPaise: -costPaise, adId, note: 'Ad spend' }],
          $slice: -200,
        },
      },
    },
    { new: true }
  );

  if (!wallet) {
    // Insufficient credits — pause campaign
    await Ad.updateOne({ _id: adId }, { $set: { status: 'exhausted' } });
    // Bust cache
    await redis.keys('ads:p:*').then(keys => keys.length && redis.del(...keys)).catch(() => {});
    logger.info({ advertiserId, adId }, '[ADS] Campaign exhausted — insufficient credits');
    return;
  }

  await Ad.updateOne({ _id: adId }, {
    $inc: { 'stats.spend': costPaise, 'billing.spentTodayPaise': costPaise },
  });

  // Update balance on ledger entry
  await AdWallet.updateOne(
    { advertiserId, 'ledger': { $slice: -1 } },
    { $set: { 'ledger.$[last].balancePaise': wallet.creditsPaise } },
    { arrayFilters: [{ 'last.balancePaise': { $exists: false } }] }
  ).catch(() => {});
}

async function topUpWallet({ advertiserId, advertiserKind, advertiserName, amountPaise, ref }) {
  const wallet = await AdWallet.findOneAndUpdate(
    { advertiserId },
    {
      $inc: { creditsPaise: amountPaise, lifetimeTopUpPaise: amountPaise },
      $push: {
        ledger: {
          $each:  [{ type: 'topup', amountPaise, ref, note: 'Wallet top-up' }],
          $slice: -200,
        },
      },
      $setOnInsert: { advertiserKind, advertiserName },
    },
    { upsert: true, new: true }
  );
  return wallet;
}

async function getWallet(advertiserId) {
  let wallet = await AdWallet.findOne({ advertiserId }).lean();
  if (!wallet) wallet = { advertiserId, creditsPaise: 0, lifetimeTopUpPaise: 0, lifetimeSpentPaise: 0, ledger: [] };
  return wallet;
}

// Analytics

async function getCampaignAnalytics(adId, days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const mongoose = require('mongoose');

  const daily = await AdEvent.aggregate([
    { $match: { adId: new mongoose.Types.ObjectId(adId), at: { $gte: since } } },
    { $group: {
      _id: {
        type: '$type',
        day:  { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
      },
      count:     { $sum: 1 },
      costPaise: { $sum: '$costPaise' },
    }},
    { $sort: { '_id.day': 1 } },
  ]);

  const summary = daily.reduce((acc, d) => {
    acc[d._id.type] = (acc[d._id.type] || 0) + d.count;
    acc.spendPaise  = (acc.spendPaise  || 0) + d.costPaise;
    return acc;
  }, {});

  return { daily, summary };
}

// Budget maintenance (run daily via cron)

async function resetDailyCaps() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await Ad.updateMany(
    {
      status: { $in: ['active', 'paused', 'exhausted'] },
      'billing.dailyCapPaise': { $gt: 0 },
      'billing.lastDayReset':  { $ne: today },
    },
    {
      $set: {
        'billing.spentTodayPaise': 0,
        'billing.lastDayReset':    today,
        status: 'active',
      },
    }
  );
  if (result.modifiedCount) logger.info({ count: result.modifiedCount }, '[ADS] Daily caps reset');
  return result.modifiedCount;
}

async function sweepExpired() {
  const now    = new Date();
  const result = await Ad.updateMany(
    { status: 'active', 'schedule.endAt': { $lt: now } },
    { $set: { status: 'completed' } }
  );
  return result.modifiedCount;
}

async function _checkBudget(adId) {
  const ad = await Ad.findById(adId).select('billing stats').lean();
  if (!ad) return;
  const { budget } = ad.billing;
  const spent = ad.stats?.spend || 0;
  if (budget > 0 && spent >= budget) {
    await Ad.updateOne({ _id: adId }, { $set: { status: 'exhausted' } });
    await redis.keys('ads:p:*').then(ks => ks.length && redis.del(...ks)).catch(() => {});
  }
}

// Self-serve CRUD

async function advertiserCreate(data, advertiser) {
  // New campaigns go to pending_approval — admin must approve
  return Ad.create({
    ...data,
    advertiser,
    status: 'pending_approval',
  });
}

async function advertiserList(advertiserId, { page = 1, limit = 20 } = {}) {
  const filter = { 'advertiser.id': advertiserId };
  const [ads, total] = await Promise.all([
    Ad.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ad.countDocuments(filter),
  ]);
  return { ads, total, page, totalPages: Math.ceil(total / limit) };
}

async function advertiserUpdate(id, advertiserId, patch) {
  const allowed = ['title', 'content', 'targeting', 'schedule', 'billing', 'placements'];
  const safe    = {};
  for (const k of allowed) { if (patch[k] !== undefined) safe[k] = patch[k]; }
  // Editing a live/approved ad resets to pending
  if (safe.content || safe.targeting || safe.placements) safe.status = 'pending_approval';
  return Ad.findOneAndUpdate(
    { _id: id, 'advertiser.id': advertiserId },
    { $set: safe },
    { new: true }
  );
}

// Admin CRUD (existing)

async function listAll({ status, audience, page = 1, limit = 20 }) {
  const filter = {};
  if (status)   filter.status   = status;
  if (audience) filter.audience = audience;
  const [ads, total] = await Promise.all([
    Ad.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ad.countDocuments(filter),
  ]);
  return { ads, total, totalPages: Math.ceil(total / limit), page };
}

async function create(data)        { return Ad.create(data); }
async function update(id, patch)   { return Ad.findByIdAndUpdate(id, { $set: patch }, { new: true }); }
async function remove(id)          { return Ad.findByIdAndDelete(id); }

async function adminApprove(id, adminId) {
  const ad = await Ad.findByIdAndUpdate(
    id,
    { $set: { status: 'active', approvedBy: adminId, approvedAt: new Date() } },
    { new: true }
  );
  await redis.keys('ads:p:*').then(ks => ks.length && redis.del(...ks)).catch(() => {});
  return ad;
}

async function adminReject(id, note) {
  return Ad.findByIdAndUpdate(id, { $set: { status: 'rejected', adminNote: note } }, { new: true });
}

module.exports = {
  // Serving
  getAdsByPlacement, getActiveAds,
  // Tracking
  recordImpression, recordClick, recordLead,
  // Wallet
  topUpWallet, getWallet,
  // Analytics
  getCampaignAnalytics,
  // Maintenance
  resetDailyCaps, sweepExpired,
  // Self-serve
  advertiserCreate, advertiserList, advertiserUpdate,
  // Admin
  listAll, create, update, remove, adminApprove, adminReject,
};
