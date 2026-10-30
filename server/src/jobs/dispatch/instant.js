const { redis } = require('../../config/redis');
const Order = require('../../modules/order/order.model');
const WorkerModel = require('../../modules/worker/worker.model');
const geoService = require('../../modules/worker/geo.service');
const config = require('../../config');
const logger = require('../../core/logger');
const { lockOrderToWorker, enqueueTeamSlots } = require('./team');
const { recordOutcomes, emitToOrderRoom } = require('./common');

/** ZeroWait: hand the order to a worker already waiting in the Ready Pool. */

/* ZeroWait: instant match from the Ready Pool
 * Returns { ok: true, ... } when a pre-accepted worker was locked, else { ok:false }
 * so the caller falls through to normal dispatch. Never throws. */
async function tryInstantMatch(order, cfg, lng, lat, jobStartMs) {
  const orderId = String(order._id);
  try {
    if (cfg.readyPoolEnabled === false) return { ok: false, reason: 'ready_pool_disabled' };

    // Optionally restrict instant match to paid tiers (admin: readyTiersOnly).
    const tier = order.tier || 'standard';
    const tiersOnly = Array.isArray(cfg.readyTiersOnly) ? cfg.readyTiersOnly : [];
    if (tiersOnly.length && !tiersOnly.includes(tier)) {
      return { ok: false, reason: 'tier_not_eligible' };
    }

    const candidates = await geoService.findReadyCandidates({
      lng, lat,
      skill:     order.service,
      radiusKm:  config.dispatch.radiusSteps.at(-1),   // outer bound; each worker's own radius still applies
      minRating: cfg.readyMinRating ?? 4.0,
      excludeIds: (order.dispatch?.attemptedWorkerIds || []).map(String),
    });

    if (!candidates.length) return { ok: false, reason: 'no_ready_workers' };

    for (const workerId of candidates.slice(0, 5)) {
      // Same atomic, transactional lock normal dispatch uses — re-verifies skill,
      // availability and KYC inside the transaction, so no double-booking.
      const locked = await lockOrderToWorker(order._id, workerId, order.service);
      if (!locked) continue;

      const readyBonus = cfg.readyBonusPaise ?? 2000;
      const latencyMs  = Date.now() - jobStartMs;
      await Order.updateOne({ _id: order._id }, {
        $set: {
          'dispatch.instantMatch':    true,
          'dispatch.readyBonusPaise': readyBonus,
          'dispatch.matchLatencyMs':  latencyMs,
        },
      }).catch(() => {});

      logger.info({ orderId, workerId, latencyMs }, '[ZEROWAIT] Instant match — worker had pre-accepted');
      await onInstantAssigned(order, workerId, readyBonus, latencyMs);
      recordOutcomes(workerId, 'accept', [], []);
      return { ok: true, workerId, instant: true, latencyMs };
    }
    return { ok: false, reason: 'no_lockable_ready_workers' };
  } catch (err) {
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Instant match failed — falling back to normal dispatch');
    return { ok: false, reason: 'error' };
  }
}

/** Post-assignment for an instant match (worker pre-accepted — no offer was sent). */
async function onInstantAssigned(order, workerId, readyBonusPaise, latencyMs) {
  const orderId = String(order._id);

  // The worker is now busy — they must leave the Ready Pool immediately so the
  // next order can't also auto-assign to them.
  geoService.exitReady(workerId).catch(() => {});

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId, instant: true });

  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  // Drives the worker client's 'job.assigned' handler → popup + alert sound.
  redis.publish('worker:assigned', JSON.stringify({
    workerId,
    orderId,
    service:       order.service,
    pickupAddress: order.pickupLocation.address,
    price:         order.pricing.total,
    instantMatch:  true,
  })).catch(() => {});

  try {
    const notificationService = require('../../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();
    const bonusRs = Math.round((readyBonusPaise || 0) / 100);
    await Promise.all([
      notificationService.notify({
        recipient: { kind: 'user', id: order.userId },
        type:  'worker_assigned',
        title: '⚡ Pro assigned instantly',
        body:  worker
          ? `${worker.name} (${(worker.rating || 5).toFixed(1)}★) accepted before you finished checkout.`
          : 'A pro has been assigned instantly.',
        deepLink: `/orders/${orderId}`,
        data: { orderId, workerId, instant: 'true' },
      }),
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type:  'job_assigned',
        title: `⚡ Ready Mode job${bonusRs ? ` + ₹${bonusRs} bonus` : ''}`,
        body:  `${order.service.replace(/_/g, ' ')} — ₹${order.pricing.total}. You pre-accepted this, so it's yours.${bonusRs ? ` ₹${bonusRs} Ready bonus is paid on completion.` : ''} Please start your trip.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId, instantMatch: 'true', readyBonusPaise: String(readyBonusPaise || 0) },
      }),
    ]);
  } catch (err) {
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Instant-match notifications failed');
  }

  enqueueTeamSlots(order, workerId).catch((err) =>
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Team slot enqueue failed'),
  );
}

/* Persist the accept bonus in effect, so completion can credit it */
async function persistUrgencyBonus(orderId, bonusPaise) {
  if (!bonusPaise || bonusPaise <= 0) return;
  await Order.updateOne(
    { _id: orderId },
    { $set: { 'dispatch.urgencyBonusPaise': bonusPaise } },
  ).catch(() => {});
}

module.exports = {
  tryInstantMatch,
  onInstantAssigned,
  persistUrgencyBonus,
};
