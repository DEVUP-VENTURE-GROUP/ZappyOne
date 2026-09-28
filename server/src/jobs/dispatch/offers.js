const { createBullConnection, redis } = require('../../config/redis');
const Order = require('../../modules/order/order.model');
const WorkerModel = require('../../modules/worker/worker.model');
const geoService = require('../../modules/worker/geo.service');
const config = require('../../config');
const logger = require('../../core/logger');
const { lockOrderToWorker, enqueueTeamSlots } = require('./team');
const { emitToOrderRoom } = require('./common');

/** Offering an order to workers: preferred worker, batch offers, force-assign. */

async function getPreferredWorker(order) {
  try {
    // 1) Customer explicitly picked this pro at checkout (worker-choice) — highest priority.
    // 2) Otherwise fall back to the customer's last completed worker for this service.
    let wId = order.dispatch?.customerPreferredWorkerId
      ? String(order.dispatch.customerPreferredWorkerId)
      : null;

    if (!wId) {
      const lastOrder = await Order.findOne({
        userId: order.userId,
        service: order.service,
        status: 'completed',
        workerId: { $exists: true, $ne: null },
      })
        .sort({ completedAt: -1 })
        .select('workerId')
        .lean();

      if (!lastOrder?.workerId) return null;
      wId = String(lastOrder.workerId);
    }

    const [avail, hasSkill, alive] = await Promise.all([
      redis.hget('workers:available', wId),
      redis.sismember(`workers:skill:${order.service}`, wId),
      redis.zscore('workers:alive', wId),
    ]);

    const freshnessThreshold = Date.now() - 8 * 60 * 1000;
    const isFresh = !alive || Number(alive) >= freshnessThreshold;

    if (avail === '1' && hasSkill === 1 && isFresh) {
      // Final KYC + rating guard
      const w = await WorkerModel.findOne({
        _id: wId,
        isBlocked: false,
        'kyc.status': 'approved',
        rating: { $gte: config.dispatch.minWorkerRating ?? 3.0 },
      }).select('_id').lean();
      return w ? wId : null;
    }
    return null;
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Preferred worker lookup failed');
    return null;
  }
}

/* Offer to a single worker and wait for their response */

async function offerToWorker(order, workerId, windowMs) {
  const expiresAt = new Date(Date.now() + windowMs);
  await redis.publish('worker:offer', JSON.stringify({
    workerId,
    order: {
      _id:           String(order._id),
      service:       order.service,
      pickupAddress: order.pickupLocation.address,
      pickupCoords:  order.pickupLocation.coordinates,
      price:         order.pricing.total,
      expiresAt:     expiresAt.toISOString(),
      preferred:     true,
    },
  }));

  const result = await waitForBatchWindow(String(order._id), [workerId], windowMs);
  return { accepted: !!result.acceptedBy };
}

/* Force-assign: skill-matched only, no bypass */

async function attemptForceAssign(order, radiusKm) {
  const orderId = String(order._id);
  const [lng, lat] = order.pickupLocation.coordinates;

  // SKILL FILTER IS ALWAYS ON — we never assign a wrong-service worker.
  // Radius is wider (up to forceAssignRadiusKm) to cast a larger net.
  const candidates = await geoService.findCandidates({
    lng, lat,
    skill:      order.service,
    excludeIds: [],
    radiusKm,
    skipSkillFilter: false,           // hard: never skip skill filter
    shopId:     order.preferredShopId || undefined,
  });

  logger.info({ orderId, found: candidates.length, radiusKm }, '[DISPATCH] Force-assign skilled candidates');

  for (const workerId of candidates.slice(0, 5)) {
    const locked = await lockOrderToWorker(order._id, workerId, order.service);
    if (locked) {
      await onForceAssigned(order, workerId);
      return { ok: true, workerId, forceAssigned: true };
    }
  }

  return { ok: false, reason: 'no_lockable_skilled_workers' };
}

/* Shared post-assignment actions */

async function onOrderAssigned(order, workerId, losers = []) {
  const orderId = String(order._id);

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId });

  // Push worker's current GPS position immediately so the customer map shows
  // the worker dot without waiting for the next periodic location broadcast.
  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  for (const wId of losers) {
    redis.publish('worker:offer_cancel', JSON.stringify({ workerId: wId, orderId })).catch(() => {});
  }

  try {
    const notificationService = require('../../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type:      'worker_assigned',
      title:     '✅ Worker assigned!',
      body:      worker
        ? `${worker.name} (⭐ ${worker.rating?.toFixed(1) ?? '5.0'}) is on the way`
        : 'A worker is on the way',
      deepLink: `/orders/${orderId}`,
      data:     { orderId, workerId },
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Assignment user notification failed');
  }

  // If team order, enqueue additional worker slots
  enqueueTeamSlots(order, workerId).catch(err =>
    logger.warn({ err: err.message, orderId }, '[DISPATCH] Team slot enqueue failed')
  );
}

async function onForceAssigned(order, workerId) {
  const orderId = String(order._id);

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId, forceAssigned: true });

  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  await redis.publish('worker:assigned', JSON.stringify({
    workerId,
    orderId,
    service:       order.service,
    pickupAddress: order.pickupLocation.address,
    price:         order.pricing.total,
    forceAssigned: true,
  })).catch(() => {});

  // Force-assign bonus — amount set by admin in pricing config (default ₹15)
  let FORCE_ASSIGN_BONUS_PAISE = 1500;
  try {
    const PricingConfig = require('../../modules/pricing/pricing-config.model');
    const cfg = await PricingConfig.findOne({ isActive: true }).select('forceAssignBonusPaise').lean();
    if (cfg?.forceAssignBonusPaise != null) FORCE_ASSIGN_BONUS_PAISE = cfg.forceAssignBonusPaise;
  } catch { /* keep default */ }
  try {
    const walletService  = require('../../modules/wallet/wallet.service');
    const Transaction    = require('../../modules/payment/transaction.model');
    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: FORCE_ASSIGN_BONUS_PAISE,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `forceassign:bonus:${orderId}`,
      refs: { orderId },
      description: 'Force-assign bonus — job auto-routed to you',
    });
  } catch (err) {
    logger.warn({ err: err.message, workerId, orderId }, '[DISPATCH] Force-assign bonus credit failed');
  }

  try {
    const notificationService = require('../../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();

    await Promise.all([
      notificationService.notify({
        recipient: { kind: 'user', id: order.userId },
        type:  'worker_assigned',
        title: 'Worker assigned',
        body:  worker
          ? `${worker.name} (${(worker.rating || 5).toFixed(1)} stars) is on the way`
          : 'A worker is on the way',
        deepLink: `/orders/${orderId}`,
        data: { orderId, workerId },
      }),
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type:  'job_assigned',
        title: 'Job auto-routed to you + ₹15 bonus',
        body:  `${order.service.replace(/_/g, ' ')} — ₹${order.pricing.total}. A ₹15 priority bonus has been added to your wallet. Please start your trip promptly.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId, forceAssigned: 'true', bonusPaise: String(FORCE_ASSIGN_BONUS_PAISE) },
      }),
    ]);
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Force-assign notifications failed');
  }

  enqueueTeamSlots(order, workerId).catch(err =>
    logger.warn({ err: err.message, orderId }, '[DISPATCH] Team slot enqueue failed (force-assign)')
  );
}

/* Shared pub/sub subscriber for all concurrent dispatch batches
   One connection handles all in-flight batches instead of one per job.
   Saves up to concurrency (10) connections simultaneously.            */

let _batchSub = null;
const _batchHandlers = new Map(); // channel → (message: string) => void

function getBatchSub() {
  if (_batchSub) return _batchSub;
  _batchSub = createBullConnection();
  _batchSub.on('message', (ch, msg) => {
    const handler = _batchHandlers.get(ch);
    if (handler) handler(msg);
  });
  _batchSub.on('error', () => {
    // On connection error drop and recreate next call
    _batchSub = null;
    _batchHandlers.clear();
  });
  return _batchSub;
}

/* Wait for any worker in the batch to accept within the window */

function waitForBatchWindow(orderId, workerIds, windowMs) {
  return new Promise((resolve) => {
    const acceptCh = `dispatch:accepted:${orderId}`;
    const rejectCh = `dispatch:rejected:${orderId}`;
    const sub = getBatchSub();

    const remaining = new Set(workerIds.map(String));
    const rejected  = [];

    const cleanup = () => {
      clearTimeout(timer);
      _batchHandlers.delete(acceptCh);
      _batchHandlers.delete(rejectCh);
      sub.unsubscribe(acceptCh, rejectCh).catch(() => {});
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ acceptedBy: null, rejected, ignored: [...remaining] });
    }, windowMs);

    const onMessage = (ch, raw) => {
      try {
        const data = JSON.parse(raw);
        const wId  = String(data.workerId);
        if (!remaining.has(wId)) return;
        if (ch === acceptCh) {
          cleanup();
          remaining.delete(wId);
          resolve({ acceptedBy: wId, rejected, ignored: [...remaining] });
        } else if (ch === rejectCh) {
          remaining.delete(wId);
          rejected.push(wId);
          if (remaining.size === 0) {
            cleanup();
            resolve({ acceptedBy: null, rejected, ignored: [] });
          }
        }
      } catch { /* ignore */ }
    };

    _batchHandlers.set(acceptCh, (msg) => onMessage(acceptCh, msg));
    _batchHandlers.set(rejectCh, (msg) => onMessage(rejectCh, msg));

    sub.subscribe(acceptCh, rejectCh).catch(() => {
      cleanup();
      resolve({ acceptedBy: null, rejected: [], ignored: [...workerIds] });
    });
  });
}

module.exports = {
  getPreferredWorker,
  offerToWorker,
  attemptForceAssign,
  onOrderAssigned,
  onForceAssigned,
  getBatchSub,
  waitForBatchWindow,
};
