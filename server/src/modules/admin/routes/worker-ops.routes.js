const express = require('express');
const { redis } = require('../../../config/redis');
const Worker = require('../../worker/worker.model');
const cancellationService = require('../../order/cancellation.service');

const router = express.Router();

/**
 * Worker Operations summary — one place for the ops team to see worker-side
 * policy + live signals: single-device, cancellation policy + escalation
 * threshold, and how many workers are cancelling / have been auto-offlined today.
 */
router.get('/worker-ops', async (req, res, next) => {
  try {
    const cfg = await cancellationService.getConfig();
    const limit = cfg.workerCancelLimit ?? 3;

    // Live cancel-window counters (Redis: worker:cancelwin:<id>, 24h TTL).
    const keys = [];
    const stream = redis.scanStream({ match: 'worker:cancelwin:*', count: 200 });
    for await (const batch of stream) keys.push(...batch);

    const perWorker = [];
    if (keys.length) {
      const pipe = redis.pipeline();
      keys.forEach((k) => pipe.get(k));
      const vals = await pipe.exec();
      keys.forEach((k, i) => {
        const n = Number(vals[i]?.[1]) || 0;
        if (n > 0) perWorker.push({ id: k.replace('worker:cancelwin:', ''), cancels: n });
      });
    }
    const cancelsToday = perWorker.reduce((sum, w) => sum + w.cancels, 0);
    const workersCancellingToday = perWorker.length;
    const workersAtLimit = perWorker.filter((w) => w.cancels >= limit).length;

    // Resolve worker names for the live list (most cancels first).
    let recentCancellers = [];
    if (perWorker.length) {
      const ids = perWorker.map((w) => w.id).filter((id) => /^[a-f0-9]{24}$/i.test(id));
      const workers = await Worker.find({ _id: { $in: ids } }).select('name phone isOnline').lean();
      const byId = new Map(workers.map((w) => [String(w._id), w]));
      recentCancellers = perWorker
        .map((w) => {
          const doc = byId.get(w.id) || {};
          return {
            workerId: w.id,
            name: doc.name || 'Worker',
            phone: doc.phone || null,
            cancels: w.cancels,
            atLimit: w.cancels >= limit,
            isOnline: !!doc.isOnline,
          };
        })
        .sort((a, b) => b.cancels - a.cancels)
        .slice(0, 50);
    }

    const [totalWorkers, onlineWorkers, availableWorkers] = await Promise.all([
      Worker.countDocuments({ isBlocked: { $ne: true } }),
      Worker.countDocuments({ isOnline: true }),
      Worker.countDocuments({ isOnline: true, isAvailable: true }),
    ]);

    res.json({
      singleDevice: { enforced: true, hardBlockNewDevice: process.env.WORKER_NEW_DEVICE_BLOCK === 'true' },
      policy: {
        workerCancelLimit: limit,
        workerCancelWindowHours: Math.round((cfg.workerCancelWindowSec ?? 86400) / 3600),
        workerCancelPenaltyRupees: Math.round((cfg.workerCancelPenaltyPaise ?? 2000) / 100),
        lateWorkerCancelMultiplier: cfg.lateWorkerCancelMultiplier ?? 2,
        workerNoShowPenaltyRupees: Math.round((cfg.workerNoShowPenaltyPaise ?? 5000) / 100),
        workerRejectLimit: cfg.workerRejectLimit ?? 5,
      },
      stats: {
        totalWorkers,
        onlineWorkers,
        availableWorkers,
        cancelsToday,
        workersCancellingToday,
        workersAtLimit, // auto-offlined for repeated cancels today
      },
      penaltyFreeReasons: cancellationService.WORKER_CANCEL_REASONS.filter((r) => r.genuine).map((r) => r.label),
      penalisedReasons: cancellationService.WORKER_CANCEL_REASONS.filter((r) => !r.genuine).map((r) => r.label),
    });
  } catch (err) { next(err); }
});

module.exports = router;
