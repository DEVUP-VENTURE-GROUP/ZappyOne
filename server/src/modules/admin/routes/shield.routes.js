const express = require('express');
const shieldService      = require('../../order/shield.service');
const CancellationFeeRecord = require('../../order/cancellation-shield.model');
const { ShieldFundWeek, ShieldWorkerPayout } = require('../../order/shield-fund.model');
const auditService       = require('../audit.service');

const router = express.Router();

/* Summary stats */
router.get('/shield/summary', async (req, res, next) => {
  try {
    const summary = await shieldService.getSummary();
    res.json(summary);
  } catch (err) { next(err); }
});

/* Weekly fund history */
router.get('/shield/weeks', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const [weeks, total] = await Promise.all([
      ShieldFundWeek.find(filter)
        .sort({ weekStart: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      ShieldFundWeek.countDocuments(filter),
    ]);
    res.json({ weeks, total, page: Number(page) });
  } catch (err) { next(err); }
});

/* Worker payouts for a specific week */
router.get('/shield/weeks/:weekId/payouts', async (req, res, next) => {
  try {
    const Worker = require('../../worker/worker.model');
    const payouts = await ShieldWorkerPayout.find({ weekId: req.params.weekId })
      .sort({ harmScore: -1 })
      .lean();

    // Attach worker name/phone for display
    const workerIds = payouts.map(p => p.workerId);
    const workers   = await Worker.find({ _id: { $in: workerIds } }, 'name phone').lean();
    const wMap      = Object.fromEntries(workers.map(w => [String(w._id), w]));

    const enriched = payouts.map(p => ({
      ...p,
      worker: wMap[String(p.workerId)] || null,
    }));

    res.json({ payouts: enriched, total: enriched.length });
  } catch (err) { next(err); }
});

/* Fee records */
router.get('/shield/fees', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, userId } = req.query;
    const filter = {};
    if (status) filter.collectionStatus = status;
    if (userId) filter.userId = userId;

    const [fees, total] = await Promise.all([
      CancellationFeeRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('userId', 'name phone')
        .populate('workerId', 'name phone')
        .populate('orderId', 'service status')
        .lean(),
      CancellationFeeRecord.countDocuments(filter),
    ]);

    res.json({ fees, total, page: Number(page) });
  } catch (err) { next(err); }
});

/* Pending fee totals (how much is owed but uncollected) */
router.get('/shield/pending-summary', async (req, res, next) => {
  try {
    const agg = await CancellationFeeRecord.aggregate([
      { $match: { collectionStatus: 'pending_next_order' } },
      {
        $group: {
          _id: null,
          totalPaise:  { $sum: '$feePaise' },
          count:       { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
    ]);
    const result = agg[0] || { totalPaise: 0, count: 0, uniqueUsers: [] };
    res.json({
      totalPendingPaise: result.totalPaise,
      pendingCount:      result.count,
      uniqueUsersCount:  result.uniqueUsers.length,
    });
  } catch (err) { next(err); }
});

/* Manual payout trigger (admin override) */
router.post('/shield/trigger-payout', async (req, res, next) => {
  try {
    const results = await shieldService.runWeeklyPayout({
      triggeredBy:   'admin',
      triggeredById: req.auth?.sub,
    });

    await auditService.fromRequest(
      req,
      'admin.shield_payout_manual',
      { kind: 'system', id: null },
      null,
      { weeksProcessed: results.length }
    );

    res.json({ ok: true, results });
  } catch (err) { next(err); }
});

/* Write-off a stale pending fee (admin decision) */
router.post('/shield/fees/:id/write-off', async (req, res, next) => {
  try {
    const fee = await CancellationFeeRecord.findById(req.params.id);
    if (!fee) return res.status(404).json({ error: 'Fee record not found' });
    if (fee.collectionStatus !== 'pending_next_order') {
      return res.status(409).json({ error: 'Only pending fees can be written off' });
    }
    fee.collectionStatus = 'written_off';
    await fee.save();

    await auditService.fromRequest(
      req,
      'admin.shield_fee_writeoff',
      { kind: 'user', id: fee.userId },
      { collectionStatus: 'pending_next_order' },
      { collectionStatus: 'written_off' }
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* Config: update worker/platform split % */
router.post('/shield/config', async (req, res, next) => {
  try {
    const { workerPct, platformPct } = req.body;
    if (
      typeof workerPct !== 'number' || typeof platformPct !== 'number' ||
      workerPct + platformPct !== 100 ||
      workerPct < 50 || workerPct > 100
    ) {
      return res.status(400).json({ error: 'workerPct + platformPct must equal 100; workerPct must be 50–100' });
    }

    // Persist to the current open week and as a default in env/config
    // For now, update all future weeks by storing in the open week;
    // the service reads splitWorkerPct from the week document.
    const { weekStart } = shieldService.getWeekBounds();
    await ShieldFundWeek.findOneAndUpdate(
      { weekStart },
      { $set: { splitWorkerPct: workerPct, splitPlatformPct: platformPct } },
      { upsert: false }
    );

    await auditService.fromRequest(
      req,
      'admin.shield_config_update',
      { kind: 'system', id: null },
      null,
      { workerPct, platformPct }
    );

    res.json({ ok: true, workerPct, platformPct });
  } catch (err) { next(err); }
});

/* Fee schedule — read */
router.get('/shield/fee-schedule', async (req, res, next) => {
  try {
    const cfg = await shieldService.getConfig();
    res.json({
      feeSchedule: cfg.feeSchedule,
      harmScores:  cfg.harmScores,
      defaultSplit: {
        workerPct:   cfg.splitWorkerPct,
        platformPct: cfg.splitPlatformPct,
      },
    });
  } catch (err) { next(err); }
});

/* Fee schedule — update */
router.put('/shield/fee-schedule', async (req, res, next) => {
  try {
    const { feeSchedule, harmScores, splitWorkerPct, splitPlatformPct } = req.body;

    // Validate fee schedule structure
    const STAGES = ['searching', 'assigned', 'on_the_way', 'arrived'];
    if (feeSchedule) {
      for (const stage of STAGES) {
        if (!Array.isArray(feeSchedule[stage]) || feeSchedule[stage].length !== 3) {
          return res.status(400).json({ error: `feeSchedule.${stage} must be an array of 3 numbers` });
        }
        if (feeSchedule[stage].some(v => typeof v !== 'number' || v < 0 || v > 100000)) {
          return res.status(400).json({ error: `feeSchedule.${stage} values must be 0–100000 paise` });
        }
      }
      // Searching tier 0 must always be 0 (grace — not overrideable)
      if (feeSchedule.searching?.[0] !== 0) {
        return res.status(400).json({ error: 'feeSchedule.searching[0] must be 0 (grace — cannot charge for first searching cancel)' });
      }
    }

    // Validate harm scores
    if (harmScores) {
      for (const stage of STAGES) {
        if (harmScores[stage] !== undefined && (typeof harmScores[stage] !== 'number' || harmScores[stage] < 0 || harmScores[stage] > 100)) {
          return res.status(400).json({ error: `harmScores.${stage} must be 0–100` });
        }
      }
    }

    // Validate split
    if (splitWorkerPct !== undefined || splitPlatformPct !== undefined) {
      const w = splitWorkerPct ?? (100 - splitPlatformPct);
      const p = splitPlatformPct ?? (100 - splitWorkerPct);
      if (w + p !== 100 || w < 50 || w > 100) {
        return res.status(400).json({ error: 'splitWorkerPct + splitPlatformPct must equal 100; worker share must be 50–100' });
      }
    }

    const updated = await shieldService.updateConfig(
      { feeSchedule, harmScores, splitWorkerPct, splitPlatformPct },
      req.auth?.sub
    );

    await auditService.fromRequest(
      req,
      'admin.shield_config_update',
      { kind: 'system', id: null },
      null,
      { version: updated.version, splitWorkerPct: updated.splitWorkerPct }
    );

    res.json({
      ok: true,
      feeSchedule:  updated.feeSchedule,
      harmScores:   updated.harmScores,
      splitWorkerPct:   updated.splitWorkerPct,
      splitPlatformPct: updated.splitPlatformPct,
      version: updated.version,
    });
  } catch (err) { next(err); }
});

module.exports = router;
