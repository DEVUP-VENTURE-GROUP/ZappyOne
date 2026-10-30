const { redis } = require('../../../config/redis');
const auditService = require('../audit.service');

async function getIncentiveConfig(req, res, next) {
  try {
    const incentiveService = require('../../worker/incentive.service');
    const [milestones, ratingBonus] = await Promise.all([
      incentiveService.getMilestones(),
      incentiveService.getRatingBonusConfig(),
    ]);
    res.json({ milestones, ratingBonus });
  } catch (err) {
    next(err);
  }
}

async function setIncentiveMilestones(req, res, next) {
  try {
    const incentiveService = require('../../worker/incentive.service');
    const updated = await incentiveService.setMilestones(req.body.milestones);
    await auditService.fromRequest(
      req,
      'admin.incentives_milestones_update',
      { kind: 'system', id: null },
      null,
      updated,
    );
    res.json({ milestones: updated });
  } catch (err) {
    next(err);
  }
}

async function runRatingBonusSweep(req, res, next) {
  try {
    const incentiveService = require('../../worker/incentive.service');
    const result = await incentiveService.checkRatingBonuses();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listDeferredMilestones(req, res, next) {
  try {
    const stream = redis.scanStream({
      match: 'incentive:deferred:*:*',
      count: 200,
    });
    const keys = [];
    for await (const batch of stream) keys.push(...batch);

    const results = await Promise.all(
      keys.map(async (key) => {
        const raw = await redis.get(key);
        if (!raw) return null;
        try {
          const data = JSON.parse(raw);
          const parts = key.split(':'); // incentive:deferred:workerId:milestone
          return { workerId: parts[2], milestone: parts[3], ...data, key };
        } catch {
          return null;
        }
      }),
    );

    res.json({
      deferred: results.filter(Boolean),
      count: results.filter(Boolean).length,
    });
  } catch (err) {
    next(err);
  }
}

async function releaseDeferredMilestone(req, res, next) {
  try {
    const { workerId, milestone } = req.params;
    const key = `incentive:deferred:${workerId}:${milestone}`;
    const raw = await redis.get(key);
    if (!raw)
      return res
        .status(404)
        .json({ error: 'Deferred milestone not found or already released' });

    const data = JSON.parse(raw);
    const walletService = require('../../wallet/wallet.service');
    const Transaction = require('../../payment/transaction.model');

    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: data.bonusPaise,
      reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
      idempotencyKey: `incentive:milestone:${workerId}:${milestone}:admin_release`,
      description: `Milestone ${milestone} bonus — admin released after rating improvement`,
    });

    await redis.del(key);
    await auditService.fromRequest(
      req,
      'admin.deferred_milestone_release',
      { kind: 'worker', id: workerId },
      null,
      { milestone, bonusPaise: data.bonusPaise },
    );

    const notificationService = require('../../notification/notification.service');
    notificationService
      .notify({
        recipient: { kind: 'worker', id: workerId },
        type: 'wallet_credited',
        title: `🏆 Milestone #${milestone} bonus released!`,
        body: `₹${data.bonusPaise / 100} has been credited to your wallet`,
        deepLink: '/wallet',
      })
      .catch(() => {});

    res.json({ ok: true, bonusPaise: data.bonusPaise });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getIncentiveConfig,
  setIncentiveMilestones,
  runRatingBonusSweep,
  listDeferredMilestones,
  releaseDeferredMilestone,
};
