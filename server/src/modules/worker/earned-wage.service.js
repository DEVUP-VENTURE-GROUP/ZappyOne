/**
 * Earned Wage Access — Same-Day Pay Advance
 * ---------------------------------------------------------------------------
 * Workers have completed jobs today but their wallet balance only shows
 * yesterday's confirmed balance. Gig workers often need cash today.
 *
 * This service lets workers "pull" up to 80% of today's completed earnings
 * instantly, with a small 2% advance fee (₹5 minimum, ₹100 max).
 *
 * Zero competitors in India offer this. Uber offers it in the US.
 * For an Indian gig worker who needs ₹500 for fuel today, this is LIFE-CHANGING.
 * ---------------------------------------------------------------------------
 */

const Order       = require('../order/order.model');
const { redis }   = require('../../config/redis');
const logger      = require('../../core/logger');

const ADVANCE_RATE   = 0.80;   // 80% of today's earnings available
const FEE_RATE       = 0.02;   // 2% advance fee
const FEE_MIN_PAISE  = 500;    // ₹5 minimum fee
const FEE_MAX_PAISE  = 10000;  // ₹100 maximum fee
const COOLDOWN_HOURS = 24;     // once per 24h

async function getTodayEarnings(workerId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayOrders = await Order.find({
    workerId,
    status: 'completed',
    completedAt: { $gte: startOfDay },
    'earnings.workerPaise': { $exists: true, $gt: 0 },
  }).select('earnings pricing service completedAt').lean();

  const totalEarnedPaise = todayOrders.reduce((s, o) => s + (o.earnings?.workerPaise || 0), 0);
  const advailablePaise  = Math.floor(totalEarnedPaise * ADVANCE_RATE);

  const feePaise = Math.min(
    Math.max(Math.floor(advailablePaise * FEE_RATE), FEE_MIN_PAISE),
    FEE_MAX_PAISE
  );

  const netAdvancePaise = Math.max(0, advailablePaise - feePaise);

  /* Check if already advanced today */
  const advancedKey = `wage_advance:${workerId}:${startOfDay.toDateString()}`;
  const alreadyAdvanced = await redis.get(advancedKey);

  return {
    totalEarnedPaise,
    totalEarnedRupees:  Math.round(totalEarnedPaise / 100),
    advailablePaise,
    feePaise,
    feeRupees:          Math.round(feePaise / 100),
    netAdvancePaise,
    netAdvanceRupees:   Math.round(netAdvancePaise / 100),
    jobCount:           todayOrders.length,
    jobs:               todayOrders.map(o => ({
      service:       o.service,
      earnedRupees:  Math.round((o.earnings?.workerPaise || 0) / 100),
      completedAt:   o.completedAt,
    })),
    alreadyAdvanced:    !!alreadyAdvanced,
    advanceRate:        ADVANCE_RATE,
    feeRate:            FEE_RATE,
  };
}

async function requestAdvance(workerId) {
  const data = await getTodayEarnings(workerId);

  if (data.alreadyAdvanced) {
    throw Object.assign(new Error('You already took an advance today. Advances are once per day.'), { status: 409 });
  }
  if (data.netAdvancePaise < 5000) {
    throw Object.assign(new Error('Minimum advance is ₹50. Complete more jobs today to qualify.'), { status: 400 });
  }

  const walletService = require('../wallet/wallet.service');
  const Transaction   = require('../payment/transaction.model');

  /* Deduct fee first */
  if (data.feePaise > 0) {
    await walletService.apply({
      kind:   'worker', id: workerId,
      type:   'debit',
      amountPaise: data.feePaise,
      reason: Transaction.REASONS.PLATFORM_COMMISSION,
      idempotencyKey: `advance_fee:${workerId}:${new Date().toDateString()}`,
      description: `Wage advance fee (${(FEE_RATE * 100).toFixed(0)}%)`,
    });
  }

  /* Credit advance */
  await walletService.apply({
    kind:   'worker', id: workerId,
    type:   'credit',
    amountPaise: data.advailablePaise,
    reason: Transaction.REASONS.WORKER_EARNING,
    idempotencyKey: `wage_advance:${workerId}:${new Date().toDateString()}`,
    description: `Same-day pay advance — ${data.jobCount} completed job${data.jobCount !== 1 ? 's' : ''} today`,
  });

  /* Mark as advanced for today (24h) */
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const advancedKey = `wage_advance:${workerId}:${startOfDay.toDateString()}`;
  await redis.setex(advancedKey, COOLDOWN_HOURS * 3600, '1');

  const notifService = require('../notification/notification.service');
  notifService.notify({
    recipient: { kind: 'worker', id: workerId },
    type:  'wallet_credited',
    title: `💸 ₹${data.netAdvanceRupees} advanced to your wallet!`,
    body:  `Today's earnings advance credited. Fee: ₹${data.feeRupees}. Available tomorrow: full settlement.`,
    deepLink: '/wallet',
  }).catch(() => {});

  logger.info({ workerId, advancedPaise: data.advailablePaise, feePaise: data.feePaise }, '[EWA] Advance processed');
  return { ...data, success: true };
}

module.exports = { getTodayEarnings, requestAdvance };
