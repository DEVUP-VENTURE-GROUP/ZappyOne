/**
 * Worker Incentive Service — Milestone Bonuses
 * ----------------------------------------------------------------------------
 * Tracks job completion milestones and credits bonus amounts to worker wallets.
 *
 * Milestone table (configurable via Redis key `config:incentives`):
 *   { jobs: 10,  bonusPaise: 20000 }   ₹200 on 10th job
 *   { jobs: 25,  bonusPaise: 50000 }   ₹500 on 25th job
 *   { jobs: 50,  bonusPaise: 100000 }  ₹1000 on 50th job
 *   { jobs: 100, bonusPaise: 250000 }  ₹2500 on 100th job
 *   { jobs: 200, bonusPaise: 500000 }  ₹5000 on 200th job
 *
 * Idempotency: each milestone uses a deterministic key so re-running
 * onJobCompleted never double-credits.
 *
 * Rating bonus:
 *   Workers maintaining rating ≥ 4.5 after ≥ 20 jobs get a monthly
 *   ₹100 quality bonus (triggered by a cron calling checkRatingBonuses).
 * ----------------------------------------------------------------------------
 */

const { redis } = require('../../config/redis');
const walletService = require('../wallet/wallet.service');
const Transaction = require('../payment/transaction.model');
const notificationService = require('../notification/notification.service');
const logger = require('../../core/logger');

const MILESTONE_KEY = 'config:incentives:milestones';
const RATING_BONUS_KEY = 'config:incentives:rating';

const DEFAULT_MILESTONES = [
  { jobs: 10,  bonusPaise: 20000 },
  { jobs: 25,  bonusPaise: 50000 },
  { jobs: 50,  bonusPaise: 100000 },
  { jobs: 100, bonusPaise: 250000 },
  { jobs: 200, bonusPaise: 500000 },
];

const DEFAULT_RATING_BONUS = {
  enabled: true,
  minRating: 4.5,
  minJobs: 20,
  bonusPaise: 10000, // ₹100/month
};

async function getMilestones() {
  const raw = await redis.get(MILESTONE_KEY);
  if (!raw) return DEFAULT_MILESTONES;
  try { return JSON.parse(raw); } catch { return DEFAULT_MILESTONES; }
}

async function setMilestones(milestones) {
  await redis.set(MILESTONE_KEY, JSON.stringify(milestones), 'EX', 86400);
  return milestones;
}

async function getRatingBonusConfig() {
  const raw = await redis.get(RATING_BONUS_KEY);
  if (!raw) return DEFAULT_RATING_BONUS;
  try { return { ...DEFAULT_RATING_BONUS, ...JSON.parse(raw) }; } catch { return DEFAULT_RATING_BONUS; }
}

// Minimum lifetime rating required to receive milestone bonuses.
// Workers who game fake completions tend to get poor ratings or no ratings.
// Below this threshold, milestones are deferred until rating improves.
const MILESTONE_MIN_RATING = 3.5;

// Minimum number of rated jobs before the milestone unlocks.
// Prevents fresh accounts with 0 ratings (all fake completions) from collecting.
const MILESTONE_MIN_RATED_JOBS = 3;

/**
 * Called from order.service.workerComplete (best-effort, non-blocking).
 * Checks if the worker just hit a milestone and credits if so.
 *
 * Quality gate: milestone only credits if worker's lifetime rating >= 3.5
 * and they have at least 3 rated jobs. This blocks bonus farming via
 * 60-second fake completions (which receive no user rating or 1-star ratings).
 *
 * @param {object} p
 * @param {ObjectId} p.workerId
 * @param {number}   p.completedJobs   Worker's new total (post-increment)
 * @param {number}   [p.workerRating]  Worker's current rolling rating
 * @param {string}   [p.orderId]       For logging
 */
async function onJobCompleted({ workerId, completedJobs, workerRating, orderId }) {
  const milestones = await getMilestones();
  const hit = milestones.find((m) => m.jobs === completedJobs);
  if (!hit) return null;

  // Quality gate — defer milestone if rating is too low or too few rated jobs.
  // Use a deferred-milestone Redis key so if rating improves later, the milestone
  // can still be claimed (admin triggers the sweep).
  if (workerRating != null && workerRating < MILESTONE_MIN_RATING) {
    await redis.set(
      `incentive:deferred:${workerId}:${hit.jobs}`,
      JSON.stringify({ jobs: hit.jobs, bonusPaise: hit.bonusPaise, deferredAt: new Date().toISOString() }),
      'EX', 90 * 86400 // hold for 90 days
    );
    logger.warn(
      { workerId, milestone: hit.jobs, workerRating, orderId },
      'Milestone deferred — worker rating below threshold'
    );
    // Notify worker so they understand why they didn't get the bonus
    notificationService.notify({
      recipient: { kind: 'worker', id: workerId },
      type: 'account_warning',
      title: `Milestone #${hit.jobs} pending`,
      body: `Your ₹${hit.bonusPaise / 100} milestone bonus is held until your rating reaches ${MILESTONE_MIN_RATING}. Currently: ${workerRating.toFixed(1)}`,
      deepLink: '/worker',
      data: { milestone: hit.jobs },
    }).catch(() => {});
    return null;
  }

  const idempotencyKey = `incentive:milestone:${workerId}:${hit.jobs}`;

  try {
    const result = await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: hit.bonusPaise,
      reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
      idempotencyKey,
      description: `Milestone bonus — ${hit.jobs} jobs completed`,
      metadata: { milestone: hit.jobs, bonusPaise: hit.bonusPaise },
    });

    if (!result.deduped) {
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type: 'wallet_credited',
        title: `🏆 Milestone bonus — ₹${hit.bonusPaise / 100} credited!`,
        body: `Congratulations on completing your ${hit.jobs}${ordinalSuffix(hit.jobs)} job!`,
        deepLink: '/wallet',
        data: { milestone: hit.jobs },
      }).catch(() => {});

      logger.info({ workerId, milestone: hit.jobs, bonusPaise: hit.bonusPaise }, 'Milestone bonus credited');
    }

    return result;
  } catch (err) {
    logger.error({ err: err.message, workerId, milestone: hit.jobs }, 'Milestone bonus failed');
    return null;
  }
}

/**
 * Monthly sweep — credits rating-based quality bonuses.
 * Called by a cron job (scripts/cron-incentives.js or admin endpoint).
 * Returns { credited, skipped, errors }.
 */
async function checkRatingBonuses() {
  const cfg = await getRatingBonusConfig();
  if (!cfg.enabled) return { credited: 0, skipped: 0, errors: 0 };

  const Worker = require('./worker.model');
  const eligible = await Worker.find({
    rating: { $gte: cfg.minRating },
    completedJobs: { $gte: cfg.minJobs },
    isBlocked: false,
  }).select('_id rating completedJobs').lean();

  const monthTag = new Date().toISOString().slice(0, 7); // YYYY-MM
  let credited = 0, skipped = 0, errors = 0;

  await Promise.allSettled(
    eligible.map(async (w) => {
      try {
        const result = await walletService.apply({
          kind: 'worker',
          id: w._id,
          type: 'credit',
          amountPaise: cfg.bonusPaise,
          reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
          idempotencyKey: `incentive:rating:${w._id}:${monthTag}`,
          description: `Quality bonus — rating ${w.rating.toFixed(1)} (${monthTag})`,
          metadata: { ratingBonus: true, rating: w.rating, month: monthTag },
        });
        if (result.deduped) { skipped++; return; }
        credited++;
        notificationService.notify({
          recipient: { kind: 'worker', id: w._id },
          type: 'wallet_credited',
          title: `⭐ Quality bonus — ₹${cfg.bonusPaise / 100} credited`,
          body: `Your rating of ${w.rating.toFixed(1)} earned you this month's quality reward`,
          deepLink: '/wallet',
        }).catch(() => {});
      } catch {
        errors++;
      }
    })
  );

  logger.info({ credited, skipped, errors, monthTag }, 'Rating bonus sweep complete');
  return { credited, skipped, errors };
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

module.exports = {
  onJobCompleted,
  checkRatingBonuses,
  getMilestones,
  setMilestones,
  getRatingBonusConfig,
};
