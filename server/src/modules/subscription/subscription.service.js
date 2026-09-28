/**
 * Subscription Service
 * ----------------------------------------------------------------------------
 * Implements:
 *   - Plan listing
 *   - Activation (called from payments webhook on capture)
 *   - Cancellation
 *   - Feature flag reads (isUserPremium, isWorkerPro, getEffects)
 *
 * Active-subscription cache:
 *   The hot path is `getActiveFor(owner)` which is read on every pricing
 *   quote and every assignment scoring. We cache it in Redis for 60 s and
 *   bust on activate/cancel/expire.
 *
 *   Cache key:  sub:active:<kind>:<id>
 *   Cache value: JSON of { planCode, endAt, effects } or "none"
 * ----------------------------------------------------------------------------
 */

const Plan = require('./plan.model');
const Subscription = require('./subscription.model');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const CACHE_TTL = 60; // seconds
const NONE_MARKER = 'none';

function cacheKey(kind, id) {
  return `sub:active:${kind}:${id}`;
}

async function getActiveFor({ kind, id }) {
  const key = cacheKey(kind, id);
  const cached = await redis.get(key);
  if (cached === NONE_MARKER) return null;
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fallthrough */ }
  }

  const sub = await Subscription.findOne({
    'owner.kind': kind,
    'owner.id': id,
    status: 'active',
    endAt: { $gt: new Date() },
  }).lean();

  if (!sub) {
    await redis.setex(key, CACHE_TTL, NONE_MARKER);
    return null;
  }

  const view = {
    _id: String(sub._id),
    planCode: sub.planCode,
    endAt: sub.endAt,
    effects: sub.effectsSnapshot || {},
  };
  await redis.setex(key, CACHE_TTL, JSON.stringify(view));
  return view;
}

function bustCache({ kind, id }) {
  return redis.del(cacheKey(kind, id));
}

async function listPlans({ audience } = {}) {
  const filter = { isActive: true };
  if (audience) filter.audience = audience;
  return Plan.find(filter).sort({ sortOrder: 1, priceInPaise: 1 }).lean();
}

/**
 * Create a `pending_payment` subscription. The actual activation happens
 * in `activateFromPayment` once the webhook fires.
 *
 * Returns the subscription doc + the plan, ready for the caller to spin
 * up a Cashfree order.
 */
async function startPurchase({ owner, planCode }) {
  const plan = await Plan.findOne({ code: planCode, isActive: true });
  if (!plan) throw Object.assign(new Error('Plan not found'), { status: 404, code: 'PLAN_NOT_FOUND' });
  if (plan.audience !== owner.kind) {
    throw Object.assign(new Error('Plan not available for this account type'), {
      status: 400, code: 'PLAN_AUDIENCE_MISMATCH',
    });
  }

  // Refuse if there's already an active or pending subscription.
  // The unique partial index also guards this at DB level.
  const existing = await Subscription.findOne({
    'owner.kind': owner.kind,
    'owner.id': owner.id,
    status: { $in: ['active', 'pending_payment'] },
  });
  if (existing) {
    if (existing.status === 'active') {
      throw Object.assign(new Error('You already have an active subscription'), {
        status: 409, code: 'SUBSCRIPTION_ACTIVE_EXISTS', subscriptionId: existing._id,
      });
    }
    // Pending → reuse it (user may have abandoned a previous payment attempt).
    return { subscription: existing, plan, reused: true };
  }

  const subscription = await Subscription.create({
    owner,
    planId: plan._id,
    planCode: plan.code,
    status: 'pending_payment',
  });
  return { subscription, plan, reused: false };
}

/**
 * Called by the webhook handler on `payment.captured`.
 * Idempotent: re-running this for the same payment is a no-op.
 */
async function activateFromPayment({ subscriptionId, paymentIntentId, cfPaymentId }) {
  const resolvedPaymentId = cfPaymentId;
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw Object.assign(new Error('Subscription not found'), { status: 404 });
  if (sub.status === 'active') {
    logger.info({ subscriptionId }, 'Subscription already active — webhook idempotency');
    return sub;
  }

  const plan = await Plan.findById(sub.planId).lean();
  if (!plan) throw Object.assign(new Error('Plan vanished'), { status: 500 });

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  sub.status = 'active';
  sub.startAt = startAt;
  sub.endAt = endAt;
  sub.paymentIntentId = paymentIntentId;
  sub.paymentId = resolvedPaymentId;
  // Snapshot the effects so future plan edits don't retroactively change perks
  sub.effectsSnapshot = plan.effects || {};
  await sub.save();

  await bustCache(sub.owner);
  logger.info({ subscriptionId, planCode: sub.planCode }, 'Subscription activated');

  return sub;
}

async function cancel({ subscriptionId, reason, byOwner }) {
  const sub = await Subscription.findById(subscriptionId);
  if (!sub) throw Object.assign(new Error('Subscription not found'), { status: 404 });
  if (sub.status !== 'active') {
    throw Object.assign(new Error(`Cannot cancel a ${sub.status} subscription`), { status: 409 });
  }
  sub.status = 'cancelled';
  sub.cancelledAt = new Date();
  sub.cancellationReason = reason || (byOwner ? 'owner_cancelled' : 'admin_cancelled');
  sub.autoRenew = false;
  await sub.save();
  await bustCache(sub.owner);
  return sub;
}

// --- Feature flag readers used across the app ---

async function isUserPremium(userId) {
  const sub = await getActiveFor({ kind: 'user', id: userId });
  return !!sub;
}

async function isWorkerPro(workerId) {
  const sub = await getActiveFor({ kind: 'worker', id: workerId });
  return !!sub;
}

async function getEffects({ kind, id }) {
  const sub = await getActiveFor({ kind, id });
  return sub?.effects || {};
}

// --- Expiry sweeper (called from a cron) ---

async function expireOverdue() {
  const result = await Subscription.updateMany(
    { status: 'active', endAt: { $lte: new Date() } },
    { $set: { status: 'expired' } }
  );
  if (result.modifiedCount > 0) {
    // Coarse cache invalidation — flushing all sub:active keys is cheaper than scanning
    const stream = redis.scanStream({ match: 'sub:active:*', count: 200 });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);
    if (keys.length) await redis.del(...keys);
    logger.info({ expired: result.modifiedCount }, 'Subscriptions expired');
  }
  return result.modifiedCount;
}

module.exports = {
  listPlans,
  startPurchase,
  activateFromPayment,
  cancel,
  getActiveFor,
  isUserPremium,
  isWorkerPro,
  getEffects,
  expireOverdue,
  bustCache,
};
