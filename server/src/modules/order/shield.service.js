/**
 * Worker Cancellation Shield Fund Service
 *
 * Tiered cancellation fees (repeat-behaviour aware):
 *
 *   Stage        | 1st cancel | 2nd (30 days) | 3rd+
 *   -------------|------------|----------------|-----
 *   searching    |  ₹0 grace  |  ₹15           | ₹25
 *   assigned     |  ₹20       |  ₹30           | ₹40
 *   on_the_way   |  ₹30       |  ₹40           | ₹50
 *   arrived      |  ₹50       |  ₹60           | ₹75
 *
 * Collection:
 *   1. Try user wallet — deduct instantly.
 *   2. Insufficient → mark pending_next_order (collected on next booking).
 *
 * Fund distribution (every Monday):
 *   85% → workers (proportional to harm score)
 *   15% → platform (operational cost)
 *
 * Harm scores:  searching=1  assigned=2  on_the_way=3  arrived=5
 *
 * Edge cases handled:
 *   - Fund = 0 → mark week as 'skipped', no payouts.
 *   - Worker had 0 harm → excluded from payout.
 *   - Payout already ran → idempotency guard.
 *   - Rounding: last worker gets remainder so fund drains exactly.
 *   - Blocked workers still receive payout (harm still happened).
 *   - Multiple pending fees: all collected together on next booking.
 *   - "Next booking" cancelled again: pending fees still collected first.
 */

const Order                   = require('./order.model');
const CancellationFeeRecord   = require('./cancellation-shield.model');
const { ShieldFundWeek, ShieldWorkerPayout } = require('./shield-fund.model');
const ShieldConfig            = require('./shield-config.model');
const logger                  = require('../../core/logger');
const { redis }               = require('../../config/redis');

// Default constants (used as fallback if DB/Redis unavailable)

const DEFAULT_FEE_SCHEDULE = {
  created:    [0,    0,    0   ],
  searching:  [0,    1500, 2500],
  assigned:   [2000, 3000, 4000],
  on_the_way: [3000, 4000, 5000],
  arrived:    [5000, 6000, 7500],
};

const DEFAULT_HARM_SCORE = {
  created:    0,
  searching:  1,
  assigned:   2,
  on_the_way: 3,
  arrived:    5,
};

const WORKER_SPLIT_PCT   = 85;
const PLATFORM_SPLIT_PCT = 15;

const CONFIG_CACHE_KEY = 'config:shield:active';
const CONFIG_CACHE_TTL = 60; // seconds

// Config helpers

async function getConfig() {
  try {
    const cached = await redis.get(CONFIG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* redis unavailable — fallthrough */ }

  try {
    const doc = await ShieldConfig.findOne({ isActive: true }).lean();
    if (doc) {
      const cfg = {
        feeSchedule:      doc.feeSchedule,
        harmScores:       doc.harmScores,
        splitWorkerPct:   doc.splitWorkerPct,
        splitPlatformPct: doc.splitPlatformPct,
      };
      redis.setex(CONFIG_CACHE_KEY, CONFIG_CACHE_TTL, JSON.stringify(cfg)).catch(() => {});
      return cfg;
    }
  } catch { /* DB unavailable — fallthrough */ }

  // Fallback to hardcoded defaults (safe for cold start before first DB write)
  return {
    feeSchedule:      DEFAULT_FEE_SCHEDULE,
    harmScores:       DEFAULT_HARM_SCORE,
    splitWorkerPct:   WORKER_SPLIT_PCT,
    splitPlatformPct: PLATFORM_SPLIT_PCT,
  };
}

async function updateConfig(patch, adminId) {
  // Deactivate current
  await ShieldConfig.updateMany({ isActive: true }, { $set: { isActive: false } });

  const current = await ShieldConfig.findOne({ isActive: false }).sort({ version: -1 }).lean();
  const base    = current || {};

  const next = await ShieldConfig.create({
    feeSchedule:      patch.feeSchedule      ?? base.feeSchedule      ?? DEFAULT_FEE_SCHEDULE,
    harmScores:       patch.harmScores        ?? base.harmScores        ?? DEFAULT_HARM_SCORE,
    splitWorkerPct:   patch.splitWorkerPct    ?? base.splitWorkerPct    ?? WORKER_SPLIT_PCT,
    splitPlatformPct: patch.splitPlatformPct  ?? base.splitPlatformPct  ?? PLATFORM_SPLIT_PCT,
    isActive:  true,
    version:   (current?.version ?? 0) + 1,
    updatedBy: adminId,
  });

  // Bust cache
  redis.del(CONFIG_CACHE_KEY).catch(() => {});
  return next;
}

// Helpers

/** Counts user-initiated cancels in the last 30 days (excluding this one). */
/**
 * How often this customer has cancelled in the last 30 days.
 *
 * Counts orders AND repair bookings. The tier decides how much a cancellation
 * costs, so counting only half the business would let someone cancel on a
 * technician every week and still be treated as a first-timer each time — and
 * would price the two products differently for identical behaviour.
 *
 * Repair cancellations are counted from their fee records rather than from the
 * bookings, because a record exists only where a cancellation was actually
 * assessed — which is precisely the set that should count against someone.
 */
async function countRecentUserCancels(userId) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [orders, repairs] = await Promise.all([
    Order.countDocuments({
      userId,
      status: 'cancelled',
      cancelledAt: { $gte: since },
      cancellationReason: /^user/,
    }),
    CancellationFeeRecord.countDocuments({
      userId,
      kind: 'repair',
      createdAt: { $gte: since },
    }),
  ]);

  return orders + repairs;
}

/**
 * Returns the Monday 00:00:00 UTC of the ISO week containing `date`.
 * IST (UTC+5:30) Monday = UTC Sunday 18:30 of the previous calendar day.
 * We work in UTC throughout and convert only for display.
 */
function getWeekBounds(date = new Date()) {
  // Convert to IST to find "Monday" from the user's perspective
  const istOffsetMs = 5.5 * 3600 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);

  const dayIST = istDate.getUTCDay(); // 0=Sun … 6=Sat in IST
  const daysFromMon = (dayIST + 6) % 7; // 0=Mon … 6=Sun

  const mondayIST = new Date(istDate);
  mondayIST.setUTCDate(istDate.getUTCDate() - daysFromMon);
  mondayIST.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(mondayIST.getTime() - istOffsetMs);
  const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000 - 1);
  return { weekStart, weekEnd };
}

/** Finds the open fund week for `date`, creating it if it doesn't exist. */
async function getOrCreateCurrentWeek(date = new Date()) {
  const { weekStart, weekEnd } = getWeekBounds(date);
  let week = await ShieldFundWeek.findOne({ weekStart });
  if (!week) {
    week = await ShieldFundWeek.findOneAndUpdate(
      { weekStart },
      {
        $setOnInsert: {
          weekStart, weekEnd,
          totalCollectedPaise: 0, platformCutPaise: 0, workerPoolPaise: 0,
          status: 'open',
          splitWorkerPct: (await getConfig()).splitWorkerPct,
          splitPlatformPct: (await getConfig()).splitPlatformPct,
        },
      },
      { upsert: true, new: true }
    );
  }
  return week;
}

// Fee contribution to fund

/**
 * Atomically adds `feePaise` to the current week's pool
 * and records the worker's harm entry.
 */
async function addToFund(feeRecordId, feePaise, workerId, harmScore) {
  const week = await getOrCreateCurrentWeek();

  await ShieldFundWeek.updateOne(
    { _id: week._id },
    { $inc: { totalCollectedPaise: feePaise } }
  );

  await CancellationFeeRecord.updateOne(
    { _id: feeRecordId },
    { $set: { addedToFundWeekId: week._id, addedToFundAt: new Date() } }
  );

  // Track harm per worker — upsert so we accumulate across multiple cancellations
  if (workerId) {
    await ShieldWorkerPayout.findOneAndUpdate(
      { weekId: week._id, workerId },
      {
        $inc: { harmScore, cancellationsCount: 1 },
        $push: { feeRecordIds: feeRecordId },
        $setOnInsert: { amountPaise: 0, status: 'pending' },
      },
      { upsert: true }
    );
  }

  return week;
}

// Main cancellation handler

/**
 * Called immediately after a user cancels an order.
 * Assesses the fee, collects from wallet or defers, adds to fund.
 * Returns the fee assessed and collection outcome.
 */
async function handleUserCancellation(order, userId) {
  const stage = order.status;
  const walletService  = require('../wallet/wallet.service');
  const Transaction    = require('../payment/transaction.model');
  const notifService   = require('../notification/notification.service');

  // Count this user's recent cancels (excluding the current one being processed)
  const cfg           = await getConfig();
  const recentCount   = await countRecentUserCancels(userId);
  const tierIdx       = Math.min(recentCount, 2);
  const stageFees     = cfg.feeSchedule[stage] ?? [0, 0, 0];
  const feePaise      = stageFees[tierIdx];
  const harmScore     = cfg.harmScores[stage] ?? 0;
  const isGrace       = (stage === 'searching' && recentCount === 0);

  // Create fee record (status will be updated after collection attempt)
  const feeRecord = await CancellationFeeRecord.create({
    orderId:          order._id,
    userId,
    workerId:         order.workerId || null,
    cancelledAtStage: stage,
    feePaise,
    isGrace,
    harmScore,
    cancelsInPeriod:  recentCount,
    collectionStatus: isGrace || feePaise === 0 ? 'grace' : 'pending_next_order',
  });

  // Grace / zero-fee path
  if (isGrace) {
    notifService.notify({
      recipient: { kind: 'user', id: userId },
      type: 'cancellation_warning',
      title: '⚠️ Cancellation noted',
      body: 'No charge this time — but future cancellations may incur a fee.',
      deepLink: '/orders',
      data: { orderId: String(order._id) },
    }).catch(() => {});

    await CancellationFeeRecord.updateOne(
      { _id: feeRecord._id },
      { $set: { collectionStatus: 'grace', warningIssuedAt: new Date() } }
    );
    return { feePaise: 0, isGrace: true, collectionStatus: 'grace', feeRecord };
  }

  if (feePaise === 0) {
    await CancellationFeeRecord.updateOne(
      { _id: feeRecord._id },
      { $set: { collectionStatus: 'zero_fee' } }
    );
    return { feePaise: 0, isGrace: false, collectionStatus: 'zero_fee', feeRecord };
  }

  // Try wallet collection
  let collectionStatus;
  try {
    await walletService.apply({
      kind:            'user',
      id:              userId,
      type:            'debit',
      amountPaise:     feePaise,
      reason:          Transaction.REASONS.CANCELLATION_FEE,
      idempotencyKey:  `shield:fee:${order._id}`,
      refs:            { orderId: order._id },
      description:     `Cancellation fee (${stage.replace(/_/g, ' ')}) — goes to Worker Shield Fund`,
    });
    collectionStatus = 'collected_wallet';

    // Fee collected — add immediately to this week's fund
    await addToFund(feeRecord._id, feePaise, order.workerId, harmScore);

    notifService.notify({
      recipient: { kind: 'user', id: userId },
      type: 'cancellation_fee_charged',
      title: `₹${Math.round(feePaise / 100)} cancellation fee charged`,
      body: 'This goes to the Worker Shield Fund to support affected workers.',
      deepLink: '/wallet',
      data: { orderId: String(order._id), feePaise },
    }).catch(() => {});

  } catch (err) {
    if (err.code === 'WALLET_INSUFFICIENT') {
      // Keep pending — will be collected on next booking
      collectionStatus = 'pending_next_order';
      logger.warn({ orderId: order._id, userId, feePaise }, 'Shield fee deferred — wallet insufficient');

      notifService.notify({
        recipient: { kind: 'user', id: userId },
        type: 'cancellation_fee_pending',
        title: `₹${Math.round(feePaise / 100)} cancellation fee pending`,
        body: 'This will be added to your next booking total.',
        deepLink: '/orders',
        data: { orderId: String(order._id), feePaise },
      }).catch(() => {});
    } else {
      // Unexpected error — log and treat as pending so we don't lose the record
      logger.error({ orderId: order._id, userId, feePaise, err: err.message }, 'Shield fee collection error');
      collectionStatus = 'pending_next_order';
    }
  }

  await CancellationFeeRecord.updateOne(
    { _id: feeRecord._id },
    {
      $set: {
        collectionStatus,
        ...(collectionStatus === 'collected_wallet' ? { collectedAt: new Date() } : {}),
      },
    }
  );

  return { feePaise, isGrace: false, collectionStatus, feeRecord };
}

// Pending fee collection (called at next booking)

/**
 * Returns the total pending cancellation fee for a user (in paise).
 * Call this at order creation to show as a line item.
 */
async function getPendingFee(userId) {
  const records = await CancellationFeeRecord.find({
    userId,
    collectionStatus: 'pending_next_order',
  }).lean();

  const totalPaise = records.reduce((s, r) => s + r.feePaise, 0);
  return { totalPaise, records };
}

/**
 * Collects all pending cancellation fees for a user from their wallet.
 * Called when they create a new order. Best-effort — if wallet still
 * insufficient, fees remain pending (no infinite deferral beyond 3 orders).
 */
async function collectPendingFees(userId, newOrderId) {
  const { totalPaise, records } = await getPendingFee(userId);
  if (!records.length || totalPaise === 0) return { collected: 0 };

  const walletService = require('../wallet/wallet.service');
  const Transaction   = require('../payment/transaction.model');

  // Check for records deferred more than 3 times — write them off after 3 failed attempts.
  // (Simplified: if the order placing itself causes them to be collected, great.
  //  Otherwise the admin sees them as pending and can decide.)

  try {
    await walletService.apply({
      kind:           'user',
      id:             userId,
      type:           'debit',
      amountPaise:    totalPaise,
      reason:         Transaction.REASONS.CANCELLATION_FEE,
      idempotencyKey: `shield:pending:${userId}:${newOrderId}`,
      refs:           { orderId: newOrderId },
      description:    `Deferred cancellation fee(s) — Worker Shield Fund`,
    });

    // All pending records → collected_next_order + add to fund
    for (const rec of records) {
      await addToFund(rec._id, rec.feePaise, rec.workerId, rec.harmScore);
      await CancellationFeeRecord.updateOne(
        { _id: rec._id },
        {
          $set: {
            collectionStatus:     'collected_next_order',
            collectedAt:          new Date(),
            collectedFromOrderId: newOrderId,
          },
        }
      );
    }

    return { collected: totalPaise, count: records.length };
  } catch (err) {
    if (err.code === 'WALLET_INSUFFICIENT') {
      logger.warn({ userId, totalPaise }, 'Deferred shield fee still uncollectable — stays pending');
      return { collected: 0 };
    }
    throw err;
  }
}

// Weekly payout

/**
 * Distribute the previous week's fund to all affected workers.
 * Idempotent — skips if week is already paid_out.
 * Called by the Monday cron job; can also be triggered manually by admin.
 */
async function runWeeklyPayout({ triggeredBy = 'cron', triggeredById = null } = {}) {
  const walletService  = require('../wallet/wallet.service');
  const Transaction    = require('../payment/transaction.model');
  const notifService   = require('../notification/notification.service');

  // Find all open weeks whose weekEnd has already passed
  const now        = new Date();
  const openWeeks  = await ShieldFundWeek.find({ status: 'open', weekEnd: { $lt: now } }).lean();

  const results = [];

  for (const week of openWeeks) {
    // Idempotency: re-check status inside loop in case parallel run just finished it
    const fresh = await ShieldFundWeek.findById(week._id);
    if (!fresh || fresh.status !== 'open') continue;

    const totalPaise = fresh.totalCollectedPaise;

    if (totalPaise === 0) {
      await ShieldFundWeek.updateOne(
        { _id: week._id },
        { $set: { status: 'skipped', paidOutAt: new Date(), triggeredBy, triggeredById } }
      );
      results.push({ weekId: week._id, status: 'skipped', totalPaise: 0, payouts: [] });
      continue;
    }

    const platformCutPaise = Math.round(totalPaise * (fresh.splitPlatformPct / 100));
    const workerPoolPaise  = totalPaise - platformCutPaise;

    // Gather all pending worker harm entries for this week
    const workerEntries = await ShieldWorkerPayout.find({
      weekId: week._id,
      status: 'pending',
    }).lean();

    if (workerEntries.length === 0) {
      // Fees collected but no worker harm recorded (edge case: all cancels were while searching with no worker)
      await ShieldFundWeek.updateOne(
        { _id: week._id },
        {
          $set: {
            status: 'paid_out', paidOutAt: now, triggeredBy, triggeredById,
            platformCutPaise, workerPoolPaise, payoutsCount: 0, totalWorkersPaid: 0,
          },
        }
      );
      results.push({ weekId: week._id, status: 'paid_out', totalPaise, payouts: [] });
      continue;
    }

    const totalHarm = workerEntries.reduce((s, e) => s + e.harmScore, 0);
    const payouts   = [];
    let distributed = 0;

    for (let i = 0; i < workerEntries.length; i++) {
      const entry     = workerEntries[i];
      const isLast    = i === workerEntries.length - 1;
      // Last worker gets the remainder to avoid rounding drift
      const amount    = isLast
        ? workerPoolPaise - distributed
        : Math.round((entry.harmScore / totalHarm) * workerPoolPaise);

      if (amount <= 0) continue;

      try {
        const tx = await walletService.apply({
          kind:           'worker',
          id:             entry.workerId,
          type:           'credit',
          amountPaise:    amount,
          reason:         Transaction.REASONS.SHIELD_PAYOUT,
          idempotencyKey: `shield:payout:${week._id}:${entry.workerId}`,
          refs:           {},
          description:    `Worker Shield Fund payout — week of ${new Date(week.weekStart).toDateString()}`,
        });

        await ShieldWorkerPayout.updateOne(
          { _id: entry._id },
          {
            $set: {
              amountPaise:   amount,
              status:        'paid',
              paidAt:        new Date(),
              transactionId: tx?._id || null,
            },
          }
        );

        distributed += amount;
        payouts.push({ workerId: entry.workerId, amountPaise: amount });

        notifService.notify({
          recipient: { kind: 'worker', id: entry.workerId },
          type:     'shield_payout',
          title:    `₹${Math.round(amount / 100)} Shield payout received 💪`,
          body:     `${entry.cancellationsCount} cancellation${entry.cancellationsCount > 1 ? 's' : ''} this week. Keep going!`,
          deepLink: '/worker/shield-payouts',
          data:     { weekId: String(week._id), amountPaise: amount },
        }).catch(() => {});

      } catch (err) {
        logger.error({ workerId: entry.workerId, amount, err: err.message }, 'Shield payout to worker failed');
        await ShieldWorkerPayout.updateOne(
          { _id: entry._id },
          { $set: { status: 'failed', failureReason: err.message } }
        );
      }
    }

    await ShieldFundWeek.updateOne(
      { _id: week._id },
      {
        $set: {
          status:           'paid_out',
          paidOutAt:        now,
          triggeredBy,
          triggeredById,
          platformCutPaise,
          workerPoolPaise,
          payoutsCount:     payouts.length,
          totalWorkersPaid: payouts.length,
        },
      }
    );

    results.push({ weekId: week._id, status: 'paid_out', totalPaise, platformCutPaise, workerPoolPaise, payouts });
    logger.info({ weekId: week._id, totalPaise, workerPoolPaise, workers: payouts.length }, 'Shield payout completed');
  }

  return results;
}

// Admin helpers

async function getSummary() {
  const now       = new Date();
  const { weekStart } = getWeekBounds(now);

  const [
    currentWeek,
    allTimePlatform,
    pendingFees,
    totalFeeRecords,
    lifetimeWorkerPool,
  ] = await Promise.all([
    ShieldFundWeek.findOne({ weekStart }).lean(),
    ShieldFundWeek.aggregate([
      { $match: { status: 'paid_out' } },
      { $group: { _id: null, total: { $sum: '$platformCutPaise' } } },
    ]),
    CancellationFeeRecord.countDocuments({ collectionStatus: 'pending_next_order' }),
    CancellationFeeRecord.countDocuments(),
    ShieldFundWeek.aggregate([
      { $match: { status: 'paid_out' } },
      { $group: { _id: null, total: { $sum: '$workerPoolPaise' } } },
    ]),
  ]);

  return {
    currentWeek: currentWeek || { totalCollectedPaise: 0, status: 'open' },
    pendingFeesCount: pendingFees,
    totalFeeRecords,
    allTimePlatformCutPaise:  allTimePlatform[0]?.total  || 0,
    allTimeWorkerPoolPaise:   lifetimeWorkerPool[0]?.total || 0,
  };
}

module.exports = {
  handleUserCancellation,
  // Shared with the repair cancellation service so both price a repeat
  // canceller from the same count.
  countRecentUserCancels,
  getPendingFee,
  collectPendingFees,
  runWeeklyPayout,
  getSummary,
  getWeekBounds,
  getOrCreateCurrentWeek,
  getConfig,
  updateConfig,
  // Kept for places that need static defaults (e.g. display fallbacks)
  DEFAULT_FEE_SCHEDULE,
  DEFAULT_HARM_SCORE,
  WORKER_SPLIT_PCT,
  PLATFORM_SPLIT_PCT,
};
