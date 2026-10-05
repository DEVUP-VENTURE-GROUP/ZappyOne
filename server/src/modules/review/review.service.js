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

/** Which provider field a signed-in account's reviews are filed under. */
const OWNER_KEY = { worker: 'workerId', shop: 'shopId', event_partner: 'partnerId' };

/**
 * A provider's own reviews: every one, newest first, with the star spread and
 * the rating customers see. Hidden reviews are included with a note (the
 * provider should know what was said); excluded ones are marked as not counted.
 */
async function mine({ role, id }, { page = 1, limit = 20 } = {}) {
  const key = OWNER_KEY[role];
  if (!key) throw Object.assign(new Error('Reviews are for service providers'), { status: 403, code: 'BAD_ROLE' });
  const match = { [key]: oid(id) };
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total, spread, counted] = await Promise.all([
    Review.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'name').lean(),
    Review.countDocuments(match),
    Review.aggregate([{ $match: { ...match, excluded: false } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { ...match, excluded: false } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]),
  ]);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of spread) breakdown[r._id] = r.n;
  return {
    rating: counted[0] ? Number(counted[0].avg.toFixed(1)) : 0,
    reviewCount: counted[0]?.n || 0,
    breakdown,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    reviews: rows.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      rating: r.rating,
      text: r.comment,
      service: r.serviceLabel,
      at: r.createdAt,
      by: maskName(r.userId?.name),
      hidden: r.status === 'hidden',
      excluded: r.excluded,
      reported: r.flagged,
    })),
  };
}

/**
 * The provider asks for a review to be looked at (fake, abusive, wrong job).
 * It goes to the admin moderation queue; nothing changes until an admin decides.
 */
async function report({ role, id }, reviewId, reason) {
  const key = OWNER_KEY[role];
  if (!key || !mongoose.isValidObjectId(reviewId)) throw Object.assign(new Error('Review not found'), { status: 404, code: 'NOT_FOUND' });
  const r = await Review.findOne({ _id: reviewId, [key]: oid(id) });
  if (!r) throw Object.assign(new Error('Review not found'), { status: 404, code: 'NOT_FOUND' });
  if (r.flagged) return { reported: true, already: true };
  r.flagged = true;
  r.flagReason = `Reported by provider: ${String(reason).trim().slice(0, 300)}`;
  await r.save();
  return { reported: true };
}

/** Admin queue: reported/auto-flagged first, or every review of a rating. */
async function adminList({ flagged, rating, page = 1, limit = 30 } = {}) {
  const q = {};
  if (flagged) q.flagged = true;
  if (rating) q.rating = Number(rating);
  const [rows, total] = await Promise.all([
    Review.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('userId', 'name phone').populate('workerId', 'name').populate('shopId', 'businessName').populate('partnerId', 'businessName').lean(),
    Review.countDocuments(q),
  ]);
  return {
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    reviews: rows.map((r) => ({
      id: String(r._id), kind: r.kind, rating: r.rating, text: r.comment, service: r.serviceLabel, at: r.createdAt,
      customer: r.userId ? { name: r.userId.name, phone: r.userId.phone } : null,
      provider: r.shopId?.businessName || r.partnerId?.businessName || r.workerId?.name || null,
      status: r.status, excluded: r.excluded, flagged: r.flagged, flagReason: r.flagReason, moderation: r.moderation,
    })),
  };
}

/**
 * An admin's decision. hide/show: the words on public pages. exclude/include:
 * whether the stars count (the provider's rating is recomputed). dismiss:
 * the report was looked at and the review stays as it is.
 */
async function moderate(reviewId, { action, reason = '' }, adminId) {
  const r = await Review.findById(reviewId);
  if (!r) throw Object.assign(new Error('Review not found'), { status: 404, code: 'NOT_FOUND' });
  const set = {
    hide: { status: 'hidden' }, show: { status: 'visible' },
    exclude: { excluded: true }, include: { excluded: false }, dismiss: {},
  }[action];
  if (!set) throw Object.assign(new Error('Unknown action'), { status: 400, code: 'BAD_ACTION' });
  Object.assign(r, set, { flagged: false, moderation: { by: adminId || null, at: new Date(), reason: String(reason).slice(0, 300) } });
  await r.save();
  if (action === 'exclude' || action === 'include') {
    await recomputeRating({ workerId: r.workerId, shopId: r.shopId, partnerId: r.partnerId });
  }
  return r.toObject();
}

module.exports = { recordReview, recomputeRating, publicSummary, maskName, autoFlag, mine, report, adminList, moderate, OWNER_KEY };
