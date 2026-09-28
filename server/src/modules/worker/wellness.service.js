/**
 * Worker Wellness Service
 * ---------------------------------------------------------------------------
 * Detects burnout signals and triggers proactive interventions.
 * No competitor does this. It's both a retention mechanism and ethical design.
 *
 * Wellness Score: 1–10 (10 = thriving, 1 = severe burnout risk)
 *
 * Signals tracked:
 *   - Rejection rate last 7 days (high = overworked/demotivated)
 *   - Late-night work (10pm–5am orders)
 *   - Days since last break (>6 consecutive = risk)
 *   - Cancellation rate last 7 days
 *   - Average daily orders (too high for too long = physical burnout)
 *
 * Interventions:
 *   - Score 7-10: "You're doing great" badge
 *   - Score 5-6: Gentle tip on sustainable pace
 *   - Score 3-4: Break incentive notification (₹100 bonus to take 2h break)
 *   - Score 1-2: Strong nudge + option to schedule lighter day + support link
 * ---------------------------------------------------------------------------
 */

const Order = require('../order/order.model');
const Worker = require('./worker.model');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const WELLNESS_CACHE_TTL = 3600; // 1 hour

/* How long is "late night" in UTC (approx IST 22:00–05:00) */
function isLateNightIST(date) {
  const hIST = (date.getUTCHours() + 5) % 24 + (date.getUTCMinutes() >= 30 ? 1 : 0);
  return hIST >= 22 || hIST < 5;
}

async function computeWellnessScore(workerId) {
  const cacheKey = `wellness:${workerId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }

  const since7d  = new Date(Date.now() - 7 * 86400000);
  const since14d = new Date(Date.now() - 14 * 86400000);
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  const [worker, recentOrders, last14dOrders] = await Promise.all([
    Worker.findById(workerId).select('penalties completedJobs rating').lean(),
    Order.find({
      workerId,
      createdAt: { $gte: since7d },
      status: { $in: ['completed', 'cancelled', 'failed'] },
    }).select('status completedAt createdAt').lean(),
    Order.find({
      workerId,
      status: 'completed',
      completedAt: { $gte: since14d },
    }).select('completedAt').lean(),
  ]);

  if (!worker) return null;

  /* Compute signals */

  const completedLast7d  = recentOrders.filter(o => o.status === 'completed').length;
  const cancelledLast7d  = recentOrders.filter(o => o.status === 'cancelled').length;
  const totalLast7d      = recentOrders.length;

  /* Rejection rate from penalty store */
  const totalOffers = worker.penalties?.totalOffers || 0;
  const totalRejects = worker.penalties?.totalRejects || 0;
  const rejectRate7d = totalOffers > 0 ? totalRejects / totalOffers : 0;

  /* Late-night work frequency */
  const lateNightCount = last14dOrders.filter(o =>
    o.completedAt && isLateNightIST(new Date(o.completedAt))
  ).length;
  const lateNightRate = last14dOrders.length > 0 ? lateNightCount / last14dOrders.length : 0;

  /* Daily order load (last 7 days, working days only) */
  const avgDailyOrders = completedLast7d / 7;

  /* Days since last break — count consecutive active days */
  const dayBuckets = new Set(
    last14dOrders.map(o => new Date(o.completedAt || o.createdAt).toDateString())
  );
  let consecutiveDays = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86400000);
    if (dayBuckets.has(d.toDateString())) { consecutiveDays++; } else { break; }
  }

  /* Score calculation (each signal contributes deductions) */

  let score = 10;

  /* High rejection rate → demotivation signal */
  if (rejectRate7d > 0.7) score -= 3;
  else if (rejectRate7d > 0.5) score -= 2;
  else if (rejectRate7d > 0.3) score -= 1;

  /* Late-night dependency → health signal */
  if (lateNightRate > 0.5) score -= 2.5;
  else if (lateNightRate > 0.3) score -= 1.5;
  else if (lateNightRate > 0.15) score -= 0.5;

  /* No days off → physical burnout */
  if (consecutiveDays >= 12) score -= 3;
  else if (consecutiveDays >= 9) score -= 2;
  else if (consecutiveDays >= 7) score -= 1;

  /* Very high daily load → unsustainable pace */
  if (avgDailyOrders > 8) score -= 2;
  else if (avgDailyOrders > 6) score -= 1;

  /* High cancellation rate → stress signal */
  const cancelRate = totalLast7d > 0 ? cancelledLast7d / totalLast7d : 0;
  if (cancelRate > 0.3) score -= 1.5;
  else if (cancelRate > 0.2) score -= 0.5;

  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

  /* Intervention recommendation */
  let intervention = null;
  let badge = null;

  if (score >= 8) {
    badge = { label: 'Thriving', emoji: '🌟', color: 'green' };
  } else if (score >= 6) {
    badge = { label: 'Doing Well', emoji: '✅', color: 'blue' };
    intervention = {
      type: 'tip',
      message: 'You\'re doing well! Keep your current pace sustainable.',
    };
  } else if (score >= 4) {
    badge = { label: 'Watch Your Pace', emoji: '⚠️', color: 'amber' };
    intervention = {
      type: 'break_incentive',
      title: 'Time for a break?',
      message: consecutiveDays >= 7
        ? `You've worked ${consecutiveDays} days straight. Take a 2-hour break and earn ₹100 bonus.`
        : lateNightRate > 0.3
        ? 'You\'ve been working late nights. Consider shifting to daytime hours for better health.'
        : 'Your acceptance rate has dipped. A short break often helps you come back stronger.',
      bonusPaise: 10000,
    };
  } else {
    badge = { label: 'Rest Needed', emoji: '🛌', color: 'red' };
    intervention = {
      type: 'strong_nudge',
      title: 'Your wellbeing matters',
      message: 'Our data shows signs of overwork. Schedule a lighter day or take the day off — your earnings won\'t disappear.',
      bonusPaise: 20000,
      showSupport: true,
    };
  }

  const result = {
    score,
    badge,
    intervention,
    signals: {
      rejectRate7d:     Math.round(rejectRate7d * 100),
      lateNightRate:    Math.round(lateNightRate * 100),
      consecutiveDays,
      avgDailyOrders:   Math.round(avgDailyOrders * 10) / 10,
      completedLast7d,
      cancelRate:       Math.round(cancelRate * 100),
    },
    computedAt: new Date().toISOString(),
  };

  /* Cache 1 hour */
  await redis.setex(cacheKey, WELLNESS_CACHE_TTL, JSON.stringify(result)).catch(() => {});
  return result;
}

/* Call after each order completion/rejection to check if intervention needed */
async function checkAndMaybeIntervene(workerId) {
  try {
    /* Invalidate cache so next fetch is fresh */
    await redis.del(`wellness:${workerId}`).catch(() => {});
    const data = await computeWellnessScore(workerId);
    if (!data || !data.intervention) return;

    /* Only send notification if intervention type is break_incentive or strong_nudge */
    if (!['break_incentive', 'strong_nudge'].includes(data.intervention.type)) return;

    /* Throttle — don't send more than once per 24h */
    const throttleKey = `wellness:notified:${workerId}`;
    const already = await redis.get(throttleKey);
    if (already) return;

    const notificationService = require('../notification/notification.service');
    await notificationService.notify({
      recipient: { kind: 'worker', id: workerId },
      type: 'worker_wellness',
      title: data.intervention.title || '⚠️ Wellness check',
      body: data.intervention.message,
      deepLink: '/worker/wellness',
      data: { score: data.score, bonusPaise: data.intervention.bonusPaise || 0 },
    });

    await redis.setex(throttleKey, 86400, '1');
    logger.info({ workerId, score: data.score, type: data.intervention.type }, '[Wellness] Intervention sent');
  } catch (err) {
    logger.warn({ err: err.message, workerId }, '[Wellness] Check failed');
  }
}

/* Neighbourhood hours — break bonus fulfilment (admin can trigger or auto-credit) */
async function creditBreakBonus(workerId) {
  const cacheKey = `wellness:${workerId}`;
  const data = await computeWellnessScore(workerId);
  if (!data?.intervention?.bonusPaise) return { ok: false };

  const walletService = require('../wallet/wallet.service');
  const Transaction   = require('../payment/transaction.model');
  const idKey = `wellnessbonus:${workerId}:${new Date().toDateString()}`;

  try {
    await walletService.apply({
      kind: 'worker', id: workerId,
      type: 'credit',
      amountPaise: data.intervention.bonusPaise,
      reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
      idempotencyKey: idKey,
      description: 'Wellness break bonus — thank you for taking care of yourself',
    });
    await redis.del(cacheKey).catch(() => {});
    logger.info({ workerId, bonusPaise: data.intervention.bonusPaise }, '[Wellness] Break bonus credited');
    return { ok: true, bonusPaise: data.intervention.bonusPaise };
  } catch (err) {
    logger.warn({ err: err.message }, '[Wellness] Bonus credit failed');
    return { ok: false };
  }
}

module.exports = { computeWellnessScore, checkAndMaybeIntervene, creditBreakBonus };
