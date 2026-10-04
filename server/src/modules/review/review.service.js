const mongoose = require('mongoose');
const Review = require('./review.model');
const Worker = require('../worker/worker.model');
const Shop = require('../shop/shop.model');
const EventPartner = require('../events/event-partner.model');
const logger = require('../../core/logger');

const oid = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

/**
 * Words that make a review unfit to show as written. A match does not hide
 * anything by itself; it puts the review in the admin queue (`flagged`).
 */
const FLAG_PATTERNS = [
  /\b\d{10}\b/, // a phone number
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // an email address
  /\b(fuck|bitch|bastard|madarchod|bhenchod|chutiya|randi|gandu)\b/i,
];

function autoFlag(comment) {
  const hit = FLAG_PATTERNS.find((re) => re.test(comment || ''));
  if (!hit) return null;
  return hit === FLAG_PATTERNS[0] || hit === FLAG_PATTERNS[1] ? 'Contains contact details' : 'Abusive language';
}

/**
 * Store a customer's review of a finished job. Called right after the booking
 * itself records the rating; never throws, because the customer's rating is
 * already saved on their booking either way.
 */
async function recordReview({ kind, jobId, userId, workerId = null, shopId = null, partnerId = null, rating, comment = '', serviceLabel = '' }) {
  try {
    if (!rating || !jobId || !userId) return null;
    const flagReason = autoFlag(comment);
    return await Review.findOneAndUpdate(
      { kind, jobId },
      {
        $setOnInsert: {
          kind, jobId, userId, workerId, shopId, partnerId, serviceLabel,
          rating, comment: String(comment || '').slice(0, 1000),
          flagged: !!flagReason, flagReason: flagReason || '',
        },
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    logger.warn({ err: err.message, kind, jobId: String(jobId) }, '[REVIEW] could not record review');
    return null;
  }
}

/**
 * Recompute a provider's rating from every review that still counts. Used when
 * a review is excluded or restored, so the published average is exactly the
 * average of the reviews we stand behind.
 */
async function recomputeRating({ workerId, shopId, partnerId }) {
  const target = partnerId ? { model: EventPartner, id: partnerId, key: 'partnerId' }
    : shopId ? { model: Shop, id: shopId, key: 'shopId' }
      : workerId ? { model: Worker, id: workerId, key: 'workerId' } : null;
  if (!target) return null;
  const [agg] = await Review.aggregate([
    { $match: { [target.key]: oid(target.id), excluded: false } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  const rating = agg ? Number(agg.avg.toFixed(2)) : 0;
  const reviewCount = agg ? agg.n : 0;
  await target.model.updateOne({ _id: target.id }, { $set: { rating, reviewCount } });
  return { rating, reviewCount };
}

/** "Ravi K." style: first name and an initial, never the full name. */
function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
}

/** What a provider's public profile shows: real, visible reviews and the star spread. */
async function publicSummary({ workerId, shopId }, { limit = 12 } = {}) {
  const key = shopId ? { shopId: oid(shopId) } : { workerId: oid(workerId) };
  const counted = { ...key, excluded: false };
  const [rows, spread] = await Promise.all([
    Review.find({ ...counted, status: 'visible', comment: { $ne: '' } })
      .sort({ createdAt: -1 }).limit(limit).populate('userId', 'name').lean(),
    Review.aggregate([{ $match: counted }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
  ]);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const s of spread) breakdown[s._id] = s.n;
  return {
    breakdown,
    reviews: rows.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      text: r.comment,
      service: r.serviceLabel,
      at: r.createdAt,
      by: maskName(r.userId?.name),
    })),
  };
}

module.exports = { recordReview, recomputeRating, publicSummary, maskName, autoFlag };
