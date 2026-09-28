const orderRepo = require('../order.repository');
const Worker = require('../../worker/worker.model');
const logger = require('../../../core/logger');

/** Ratings both ways once a job is done. */

const RATING_WINDOW_SEC = 7 * 24 * 3600; // 7 days to rate after completion

// Basic spam-word filter for review text
const REVIEW_SPAM_WORDS = ['http://', 'https://', 'whatsapp', 'telegram', 'instagram', 'call me at', 'contact me'];
function containsSpam(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return REVIEW_SPAM_WORDS.some((w) => lower.includes(w));
}

async function rateOrder({ orderId, userId, rating, review }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.status !== 'completed') {
    throw Object.assign(new Error('Can only rate completed orders'), { status: 409 });
  }
  if (order.userRating) {
    throw Object.assign(new Error('Already rated'), { status: 409, code: 'ALREADY_RATED' });
  }
  // Anti-manipulation: ratings must be submitted within 7 days of completion.
  if (order.completedAt) {
    const ageSec = (Date.now() - new Date(order.completedAt).getTime()) / 1000;
    if (ageSec > RATING_WINDOW_SEC) {
      throw Object.assign(new Error('Rating window expired — must rate within 7 days of completion'), {
        status: 409, code: 'RATING_EXPIRED',
      });
    }
  }

  // Review spam check
  if (review && containsSpam(review)) {
    throw Object.assign(
      new Error('Review contains prohibited content (URLs or contact details not allowed)'),
      { status: 400, code: 'REVIEW_SPAM' }
    );
  }
  if (review && review.length > 1000) {
    throw Object.assign(new Error('Review must be under 1000 characters'), { status: 400 });
  }

  // Velocity limit: max 5 ratings per user per day
  // Blocks fake-account farms: new phone numbers batch-rating one worker.
  const ratingVelocityKey = `rating:velocity:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const { redis: r } = require('../../../config/redis');
  const dailyCount = await r.incr(ratingVelocityKey).catch(() => 0);
  if (dailyCount === 1) await r.expire(ratingVelocityKey, 86400).catch(() => {});
  if (dailyCount > 5) {
    await r.decr(ratingVelocityKey).catch(() => {}); // don't count this attempt
    throw Object.assign(
      new Error('You\'ve submitted too many ratings today. Please try again tomorrow.'),
      { status: 429, code: 'RATING_VELOCITY_LIMIT' }
    );
  }

  // Cross-order duplicate guard: same user rating same worker within 48h
  if (order.workerId) {
    const recent48h = new Date(Date.now() - 48 * 3600 * 1000);
    const recentRating = await orderRepo.model().findOne({
      userId,
      workerId:   order.workerId,
      userRating: { $exists: true, $ne: null },
      completedAt: { $gte: recent48h },
      _id: { $ne: order._id },
    }).select('_id').lean();
    if (recentRating) {
      // Flag suspicious but don't hard-block: allow rating, mark for review
      logger.warn({ userId, workerId: order.workerId, orderId }, '[RATING] Possible duplicate rating — same worker within 48h');
    }
  }

  order.userRating = rating;
  order.ratingSubmittedAt = new Date(); // immutability timestamp (#88)
  if (review) order.userReview = review; // queryable for the pro's public trust profile
  await order.save();

  // Update worker rolling rating — true rolling average using (oldAvg*n + new)/(n+1)
  // We use completedJobs as N (the worker has at least 1 — this order).
  if (order.workerId) {
    const worker = await Worker.findById(order.workerId);
    if (worker && worker.completedJobs > 0) {
      const n = worker.completedJobs;
      const newRating = (worker.rating * (n - 1) + rating) / n;
      worker.rating = Number(newRating.toFixed(2));
      await worker.save();
    }
  }
  return order;
}

/**
 * Worker rates the user — symmetric to rateOrder. Affects user.rating
 * which flagged users dispatchers can later factor into access decisions.
 */
async function workerRateUser({ orderId, workerId, rating, review }) {
  const User = require('../../user/user.model');
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId || '') !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.status !== 'completed') {
    throw Object.assign(new Error('Can only rate completed orders'), { status: 409 });
  }
  if (order.workerRating) {
    throw Object.assign(new Error('Already rated'), { status: 409, code: 'ALREADY_RATED' });
  }

  order.workerRating = rating;
  if (review) order.statusHistory.push({ status: 'completed', at: new Date(), meta: { workerReview: review } });
  await order.save();

  // Roll into the user's average. Count completed orders for this user to
  // get N.
  const totalCompleted = await require('../order.model').countDocuments({
    userId: order.userId, status: 'completed',
  });
  if (totalCompleted > 0) {
    const user = await User.findById(order.userId);
    if (user) {
      const n = totalCompleted;
      const newRating = (user.rating * (n - 1) + rating) / n;
      user.rating = Number(newRating.toFixed(2));
      await user.save();
    }
  }
  return order;
}

module.exports = {
  containsSpam,
  rateOrder,
  workerRateUser,
};
