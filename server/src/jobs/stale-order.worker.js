/**
 * Stale Order Watchdog
 * ----------------------------------------------------------------------------
 * Runs every 2 minutes. For a hyperlocal <30-min service, orders should never
 * sit idle after assignment. This worker handles two failure modes:
 *
 *  1. ASSIGNED but worker never starts trip:
 *     - >15 min: nudge worker (push) + warn user
 *     - >25 min: strip the worker, re-dispatch, penalise
 *
 *  2. SEARCHING too long without a dispatch job running:
 *     - >12 min in searching with no BullMQ job: re-queue dispatch
 *     (catches dispatch worker crash/restart mid-job)
 *
 *  3. ON_THE_WAY too long (worker stuck or GPS off):
 *     - >45 min: notify admin channel, nudge worker
 * ----------------------------------------------------------------------------
 */

require('dotenv').config();
const { redis } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const Order  = require('../modules/order/order.model');
const Worker = require('../modules/worker/worker.model');
const geoService = require('../modules/worker/geo.service');
const logger = require('../utils/logger');
const { dispatchQueue } = require('./index');

// Defaults — overridden by admin pricing config at runtime
let ASSIGNED_NUDGE_MIN      = 4;
let ASSIGNED_REDISPATCH_MIN = 6;
let OTW_ALERT_MIN           = 20;
const SEARCHING_STALE_MIN   = 6;   // always fixed — dispatch restart threshold
// No worker ever found → give up and auto-cancel (system fault: no fee, refund if prepaid).
const SEARCHING_CANCEL_MIN  = parseInt(process.env.AUTO_CANCEL_NO_WORKER_MIN || '30', 10);
// Worker tapped "start trip" but is stuck / GPS off this long → strip + re-dispatch.
const OTW_REDISPATCH_MIN    = parseInt(process.env.STALE_OTW_REDISPATCH_MIN || '45', 10);
const ARRIVED_STALE_MIN     = 15;  // worker marked arrived but never entered OTP — auto-cancel after 15 min
const IN_PROGRESS_MAX_MIN      = 180;  // 3 hours → admin alert
const IN_PROGRESS_ABANDON_MIN  = 1440; // 24 hours → auto-flag for reconciliation + mark failed

async function loadThresholds() {
  try {
    const PricingConfig = require('../modules/pricing/pricing-config.model');
    const cfg = await PricingConfig.findOne({ isActive: true })
      .select('staleNudgeMinutes staleRedispatchMinutes staleOtwAlertMinutes')
      .lean();
    if (cfg) {
      if (cfg.staleNudgeMinutes)      ASSIGNED_NUDGE_MIN      = cfg.staleNudgeMinutes;
      if (cfg.staleRedispatchMinutes) ASSIGNED_REDISPATCH_MIN = cfg.staleRedispatchMinutes;
      if (cfg.staleOtwAlertMinutes)   OTW_ALERT_MIN           = cfg.staleOtwAlertMinutes;
    }
  } catch { /* keep defaults */ }
}

/* Main sweep */
// One DB round-trip fetches ALL stale orders across every active status.
// JS splits them by status — 5 queries → 1.

async function sweep() {
  const now = new Date();

  // Use the shortest threshold (ASSIGNED_NUDGE_MIN) so no doc is missed.
  const earliestThreshold = new Date(now - Math.min(
    ASSIGNED_NUDGE_MIN,
    SEARCHING_STALE_MIN,
    OTW_ALERT_MIN,
    ARRIVED_STALE_MIN,
    60 // in_progress 1-hour nudge
  ) * 60 * 1000);

  const staleOrders = await Order.find({
    status: { $in: ['created', 'assigned', 'searching', 'on_the_way', 'arrived', 'in_progress'] },
    updatedAt: { $lt: earliestThreshold },
  })
    .select('_id status userId workerId service pricing pickupLocation statusHistory dispatch updatedAt createdAt scheduledAt payment')
    .lean();

  if (!staleOrders.length) return;

  const byStatus = {
    assigned:    [],
    searching:   [],
    on_the_way:  [],
    arrived:     [],
    in_progress: [],
  };
  // A never-dispatched 'created' order is handled like a stuck 'searching' one
  // (re-queue dispatch, then auto-cancel if no worker is ever found).
  for (const o of staleOrders) byStatus[o.status === 'created' ? 'searching' : o.status]?.push(o);

  await Promise.all([
    handleStaleAssigned(now,    byStatus.assigned),
    handleStaleSearching(now,   byStatus.searching),
    handleStaleOnTheWay(now,    byStatus.on_the_way),
    handleStaleArrived(now,     byStatus.arrived),
    handleStaleInProgress(now,  byStatus.in_progress),
  ]);
}

/* 1. Assigned orders where worker never started the trip */

async function handleStaleAssigned(now, stale) {
  const nudgeThreshold      = new Date(now - ASSIGNED_NUDGE_MIN * 60 * 1000);
  const redispatchThreshold = new Date(now - ASSIGNED_REDISPATCH_MIN * 60 * 1000);
  stale = stale.filter((o) => new Date(o.updatedAt) < nudgeThreshold);

  for (const order of stale) {
    const assignedEntry = [...(order.statusHistory || [])]
      .reverse()
      .find((h) => h.status === 'assigned');
    const assignedAt = assignedEntry?.at ? new Date(assignedEntry.at) : new Date(order.updatedAt);

    const minutesSinceAssign = (now - assignedAt) / 60000;

    const alreadyNudged = await redis.get(`stale:nudged:${order._id}`);

    if (minutesSinceAssign >= ASSIGNED_REDISPATCH_MIN) {
      // Hard: re-dispatch. Worker ignored the assignment.
      await redispatchFromAssigned(order);
    } else if (minutesSinceAssign >= ASSIGNED_NUDGE_MIN && !alreadyNudged) {
      await nudgeStaleAssigned(order);
      await redis.setex(`stale:nudged:${order._id}`, 600, '1'); // don't nudge twice within 10min
    }
  }
}

async function nudgeStaleAssigned(order) {
  const notificationService = require('../modules/notification/notification.service');
  const orderId = String(order._id);

  logger.info({ orderId, workerId: order.workerId }, '[STALE] Nudging worker for slow trip start');

  // Push worker to start the trip NOW
  if (order.workerId) {
    notificationService.notify({
      recipient: { kind: 'worker', id: order.workerId },
      type: 'job_reminder',
      title: 'Please start your trip',
      body: `Customer is waiting. Tap to navigate and start the trip for your ${order.service.replace(/_/g, ' ')} job.`,
      deepLink: `/worker/jobs/${orderId}`,
      data: { orderId, urgent: 'true' },
    }).catch(() => {});
  }

  // Reassure user
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_delayed',
    title: 'Worker is on their way',
    body: 'Your worker will start shortly. We are monitoring your order.',
    deepLink: `/orders/${orderId}`,
    data: { orderId },
  }).catch(() => {});

  await redis.publish('order:event', JSON.stringify({
    orderId,
    event: 'order.dispatch_update',
    payload: { message: 'Worker confirmed — starting your service shortly' },
  }));
}

async function redispatchFromAssigned(order) {
  const orderId = String(order._id);
  const workerId = order.workerId;

  // Idempotency — only re-dispatch once per order
  const alreadyRedispatching = await redis.get(`stale:redispatch:${orderId}`);
  if (alreadyRedispatching) return;
  await redis.setex(`stale:redispatch:${orderId}`, 1800, '1');

  logger.warn({ orderId, workerId }, '[STALE] Re-dispatching assigned order — worker never started trip');

  const notificationService = require('../modules/notification/notification.service');

  // Penalise the unresponsive worker
  if (workerId) {
    await Worker.updateOne(
      { _id: workerId },
      {
        $set: { isAvailable: true, currentOrderId: null },
        $inc: { 'penalties.totalCancels': 1, 'penalties.totalOffers': 1, 'penalties.totalRejects': 1 },
      }
    );
    await geoService.setAvailability(workerId, true);

    // Tell the old worker's job page to dismiss immediately
    await redis.publish('worker:job_pulled', JSON.stringify({ workerId: String(workerId), orderId }));

    notificationService.notify({
      recipient: { kind: 'worker', id: workerId },
      type: 'job_removed',
      title: 'Job reassigned — please respond faster',
      body: 'You were assigned a job but did not start the trip in time. Your dispatch priority has been reduced.',
      deepLink: '/worker',
      data: { orderId },
    }).catch(() => {});
  }

  // Reset order to searching, exclude the unresponsive worker
  const existingAttempted = (order.dispatch?.attemptedWorkerIds || []).map(String);
  if (workerId && !existingAttempted.includes(String(workerId))) {
    existingAttempted.push(String(workerId));
  }

  await Order.findByIdAndUpdate(orderId, {
    $set: {
      status: 'searching',
      workerId: null,
      'dispatch.currentOfferWorkerId': null,
      'dispatch.offerExpiresAt': null,
      'dispatch.attemptedWorkerIds': existingAttempted,
    },
    $push: { statusHistory: { status: 'searching', at: new Date(), meta: { requeued: 'stale_assigned', prevWorkerId: workerId } } },
  });

  // Re-queue dispatch
  await dispatchQueue.add(
    'dispatch',
    { orderId, retryCount: 0 },
    { jobId: `order_${orderId}_stale_redispatch_${Date.now()}`, priority: 1 }
  );

  // Notify user
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_reassigned',
    title: 'Finding a new worker',
    body: 'Your previous worker was unresponsive. Finding the next available worker now.',
    deepLink: `/orders/${orderId}`,
    data: { orderId },
  }).catch(() => {});

  await redis.publish('order:event', JSON.stringify({
    orderId,
    event: 'order.dispatch_update',
    payload: { message: 'Reassigning — finding a new worker for you…' },
  }));

  // Inform the worker's client that the job was pulled — triggers redirect
  await redis.publish('order:event', JSON.stringify({
    orderId,
    event: 'order.status',
    payload: { status: 'searching', at: new Date().toISOString() },
  }));
}

/* Helpers: how long has this order been actively searching? */
// Measured from the last time it ENTERED 'searching' (or createdAt), but never
// before its scheduled time — so a scheduled order that sits in 'created' for
// days until dispatch fires is NOT counted as "searching for days".
function searchingMinutes(order, now) {
  const hist = (order.statusHistory || []).filter((h) => h.status === 'searching');
  let start = hist.length ? new Date(hist[hist.length - 1].at) : new Date(order.createdAt);
  if (order.scheduledAt) {
    const sched = new Date(order.scheduledAt);
    if (sched > start) start = sched; // clock starts no earlier than the scheduled time
  }
  return (now - start) / 60000;
}

/* Auto-cancel an order that never found a worker */
async function autoCancelNoWorker(order, now) {
  const orderId = String(order._id);
  // Idempotency lock — one cancel attempt per order per hour.
  const lock = await redis.set(`stale:autocancel:${orderId}`, '1', 'NX', 'EX', 3600);
  if (!lock) return;

  // Atomic + safe: only cancel if STILL unassigned (a worker may have accepted meanwhile).
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: ['created', 'searching'] }, workerId: null },
    {
      $set: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'auto_no_worker' },
      $push: { statusHistory: { status: 'cancelled', at: new Date(), meta: { reason: 'auto_no_worker', afterMin: Math.round(searchingMinutes(order, now)) } } },
    },
    { new: true }
  );
  if (!updated) return; // got assigned in the meantime — leave it

  logger.warn({ orderId, service: updated.service, minutes: Math.round(searchingMinutes(order, now)) },
    '[STALE] Auto-cancelled — no worker found within window');

  // Stop it from searching: remove any pending dispatch job.
  try { const j = await dispatchQueue.getJob(`order_${orderId}`); if (j) await j.remove(); } catch { /* noop */ }

  // System fault — no cancellation fee. Refund if the customer already paid.
  if (updated.payment?.status === 'paid') {
    try { require('../modules/wallet/ledger.service').recordRefund(updated, 'auto_no_worker'); }
    catch (e) { logger.error({ orderId, err: e.message }, '[STALE] auto-cancel refund failed'); }
  }

  const notificationService = require('../modules/notification/notification.service');
  notificationService.notify({
    recipient: { kind: 'user', id: updated.userId },
    type: 'order_cancelled',
    title: 'No worker available',
    body: `We couldn't find a ${updated.service.replace(/_/g, ' ')} pro nearby in time, so we cancelled the order`
      + (updated.payment?.status === 'paid' ? ' and started your refund.' : '.') + ' Please try again shortly.',
    deepLink: `/orders/${orderId}`,
    data: { orderId },
  }).catch(() => {});

  redis.publish('order:event', JSON.stringify({
    orderId, event: 'order.status',
    payload: { status: 'cancelled', reason: 'auto_no_worker', at: new Date().toISOString() },
  })).catch(() => {});
}

/* Strip a stuck on_the_way worker and re-dispatch the order */
async function redispatchStuckOnTheWay(order) {
  const orderId = String(order._id);
  if (!(await redis.set(`stale:otw_redispatch:${orderId}`, '1', 'NX', 'EX', 1800))) return;

  const notificationService = require('../modules/notification/notification.service');
  logger.warn({ orderId, workerId: order.workerId, minutes: OTW_REDISPATCH_MIN },
    '[STALE] Worker stuck on_the_way — stripping worker and re-dispatching');

  if (order.workerId) {
    await Worker.updateOne(
      { _id: order.workerId },
      { $set: { isAvailable: true, currentOrderId: null }, $inc: { 'penalties.totalCancels': 1, 'penalties.totalNoShows': 1 } }
    );
    await geoService.setAvailability(order.workerId, true);
    await redis.publish('worker:job_pulled', JSON.stringify({ workerId: String(order.workerId), orderId }));
    notificationService.notify({
      recipient: { kind: 'worker', id: order.workerId },
      type: 'job_removed',
      title: 'Job reassigned — you never arrived',
      body: 'You marked on the way but did not arrive in time. The job was reassigned.',
      deepLink: '/worker', data: { orderId },
    }).catch(() => {});
  }

  const attempted = (order.dispatch?.attemptedWorkerIds || []).map(String);
  if (order.workerId && !attempted.includes(String(order.workerId))) attempted.push(String(order.workerId));

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: 'on_the_way' },
    {
      $set: { status: 'searching', workerId: null, 'dispatch.currentOfferWorkerId': null, 'dispatch.offerExpiresAt': null, 'dispatch.attemptedWorkerIds': attempted },
      $push: { statusHistory: { status: 'searching', at: new Date(), meta: { requeued: 'stale_on_the_way', prevWorkerId: order.workerId } } },
    },
    { new: true }
  );
  if (!updated) return; // status changed under us

  await dispatchQueue.add('dispatch', { orderId, retryCount: 0 }, { jobId: `order_${orderId}_stale_otw_${Date.now()}`, priority: 1 });

  notificationService.notify({
    recipient: { kind: 'user', id: updated.userId },
    type: 'order_reassigned',
    title: 'Finding a new worker',
    body: 'Your worker was stuck on the way, so we are assigning someone else now.',
    deepLink: `/orders/${orderId}`, data: { orderId },
  }).catch(() => {});
  redis.publish('order:event', JSON.stringify({
    orderId, event: 'order.status', payload: { status: 'searching', at: new Date().toISOString() },
  })).catch(() => {});
}

/* 2. Orders stuck in searching (dispatch job dead/crashed) */

async function handleStaleSearching(now, stale) {
  const threshold = new Date(now - SEARCHING_STALE_MIN * 60 * 1000);
  stale = stale.filter((o) => new Date(o.updatedAt) < threshold);

  for (const order of stale) {
    const orderId = String(order._id);

    // Scheduled booking whose time hasn't arrived yet — it's waiting on purpose,
    // not stuck. Don't re-queue or cancel it; its delayed dispatch job will fire.
    if (order.scheduledAt && new Date(order.scheduledAt) > now) continue;

    // Give up: no worker found within the window → auto-cancel (no fee, refund if prepaid).
    if (searchingMinutes(order, now) >= SEARCHING_CANCEL_MIN) {
      await autoCancelNoWorker(order, now);
      continue;
    }

    // Check if there's already an active BullMQ dispatch job for this order
    const existingJob = await dispatchQueue.getJob(`order_${orderId}`).catch(() => null);
    if (existingJob) {
      const state = await existingJob.getState().catch(() => null);
      if (state === 'active' || state === 'waiting' || state === 'delayed') continue;
    }

    const alreadyRequeued = await redis.get(`stale:search_requeue:${orderId}`);
    if (alreadyRequeued) continue;

    logger.warn({ orderId }, '[STALE] Order stuck in searching — re-queuing dispatch');
    await redis.setex(`stale:search_requeue:${orderId}`, 900, '1');

    await dispatchQueue.add(
      'dispatch',
      { orderId, retryCount: 0 },
      { jobId: `order_${orderId}_stale_search_${Date.now()}`, priority: 1 }
    );
  }
}

/* 3. On-the-way too long (worker GPS off or stuck) */

async function handleStaleOnTheWay(now, stale) {
  const threshold = new Date(now - OTW_ALERT_MIN * 60 * 1000);
  stale = stale.filter((o) => new Date(o.updatedAt) < threshold);

  for (const order of stale) {
    const orderId = String(order._id);
    const minutesOtw = (now - new Date(order.updatedAt)) / 60000;

    // Worker never arrived → strip them and re-dispatch. If nobody else is found,
    // the searching-timeout backstop (SEARCHING_CANCEL_MIN) cancels it later.
    if (minutesOtw >= OTW_REDISPATCH_MIN) {
      await redispatchStuckOnTheWay(order);
      continue;
    }

    const alreadyAlerted = await redis.get(`stale:otw_alert:${orderId}`);
    if (alreadyAlerted) continue;

    logger.warn({ orderId, workerId: order.workerId, minutesOtw: OTW_ALERT_MIN }, '[STALE] Worker on_the_way too long');
    await redis.setex(`stale:otw_alert:${orderId}`, 3600, '1');

    const notificationService = require('../modules/notification/notification.service');

    if (order.workerId) {
      notificationService.notify({
        recipient: { kind: 'worker', id: order.workerId },
        type: 'job_reminder',
        title: 'Are you on the way?',
        body: 'Customer is still waiting. Tap to update your status.',
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId },
      }).catch(() => {});
    }

    notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'order_delayed',
      title: 'Worker update',
      body: 'Your worker is on the way. We have pinged them for an update.',
      deepLink: `/orders/${orderId}`,
      data: { orderId },
    }).catch(() => {});
  }
}

/* 4. Arrived but OTP never entered (worker present but service not started) */

async function handleStaleArrived(now, stale) {
  const threshold = new Date(now - ARRIVED_STALE_MIN * 60 * 1000);
  stale = stale.filter((o) => new Date(o.updatedAt) < threshold);

  for (const order of stale) {
    const orderId = String(order._id);
    const alreadyHandled = await redis.get(`stale:arrived:${orderId}`);
    if (alreadyHandled) continue;
    await redis.setex(`stale:arrived:${orderId}`, 3600, '1');

    logger.warn({ orderId, workerId: order.workerId, minutes: ARRIVED_STALE_MIN },
      '[STALE] Worker arrived but OTP never entered — cancelling and re-dispatching');

    const notificationService = require('../modules/notification/notification.service');

    // Penalise worker for no-show after arriving
    if (order.workerId) {
      await Worker.updateOne(
        { _id: order.workerId },
        {
          $set: { isAvailable: true, currentOrderId: null },
          $inc: { 'penalties.totalCancels': 1, 'penalties.totalNoShows': 1 },
        }
      );
      await geoService.setAvailability(order.workerId, true);
      notificationService.notify({
        recipient: { kind: 'worker', id: order.workerId },
        type: 'job_removed',
        title: 'Job cancelled — no-show after arriving',
        body: 'You marked arrived but did not start the service. Penalty recorded.',
        deepLink: '/worker',
        data: { orderId },
      }).catch(() => {});
    }

    const existingAttempted = (order.dispatch?.attemptedWorkerIds || []).map(String);
    if (order.workerId && !existingAttempted.includes(String(order.workerId))) {
      existingAttempted.push(String(order.workerId));
    }

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        status: 'searching',
        workerId: null,
        'dispatch.currentOfferWorkerId': null,
        'dispatch.offerExpiresAt': null,
        'dispatch.attemptedWorkerIds': existingAttempted,
      },
      $push: { statusHistory: { status: 'searching', at: new Date(), meta: { requeued: 'stale_arrived' } } },
    });

    await dispatchQueue.add('dispatch', { orderId, retryCount: 0 }, {
      jobId: `order_${orderId}_stale_arrived_${Date.now()}`, priority: 1,
    });

    notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'order_reassigned',
      title: 'Finding a new worker',
      body: 'Your worker did not start the service. We are sending someone else now.',
      deepLink: `/orders/${orderId}`,
      data: { orderId },
    }).catch(() => {});

    await redis.publish('order:event', JSON.stringify({
      orderId,
      event: 'order.dispatch_update',
      payload: { message: 'Worker did not start service — finding a replacement…' },
    }));
  }
}

/* 5. In-progress too long — worker abandoned the job */

async function handleStaleInProgress(now, stale) {
  const nudgeThreshold = new Date(now - 60 * 60 * 1000);
  const longRunning = stale.filter((o) => new Date(o.updatedAt) < nudgeThreshold);

  const notificationService = require('../modules/notification/notification.service');

  for (const order of longRunning) {
    const orderId = String(order._id);
    const minutesIn = Math.round((now - new Date(order.updatedAt)) / 60000);

    if (minutesIn >= IN_PROGRESS_ABANDON_MIN) {
      // 24+ hours: abandoned order — flag for reconciliation, do NOT auto-complete
      // (could be ongoing commercial/event job). Alert admin + mark for review.
      const alreadyFlagged = await redis.get(`stale:abandon:${orderId}`);
      if (!alreadyFlagged) {
        await redis.setex(`stale:abandon:${orderId}`, 86400, '1');
        await Order.findByIdAndUpdate(orderId, {
          $set: { 'payment.reconciliationRequired': true },
        });
        logger.error({ orderId, minutesIn }, '[STALE] IN_PROGRESS > 24h — flagged for manual reconciliation');
        await redis.publish('order:event', JSON.stringify({
          orderId,
          event: 'order.admin_alert',
          payload: { reason: 'abandoned_in_progress', minutesIn, message: 'Order stuck in_progress for 24+ hours — manual review required' },
        }));
      }
      continue;
    }

    if (minutesIn >= IN_PROGRESS_MAX_MIN) {
      // Admin alert — order has been in_progress for 3+ hours
      const alreadyAlerting = await redis.get(`stale:inprogress:admin:${orderId}`);
      if (!alreadyAlerting) {
        await redis.setex(`stale:inprogress:admin:${orderId}`, 7200, '1');
        logger.error(
          { orderId, workerId: order.workerId, minutesIn },
          '[STALE] IN_PROGRESS > 3 hours — admin alert required'
        );
        // Publish to admin channel for manual investigation
        await redis.publish('order:event', JSON.stringify({
          orderId,
          event: 'order.admin_alert',
          payload: {
            reason: 'in_progress_too_long',
            minutesIn,
            message: `Order in_progress for ${minutesIn} minutes — possible abandonment`,
          },
        }));
        // Notify user so they know to contact support
        notificationService.notify({
          recipient: { kind: 'user', id: order.userId },
          type: 'order_delayed',
          title: 'Service update',
          body: 'Your service has been running for a long time. Contact support if there is an issue.',
          deepLink: `/orders/${orderId}`,
          data: { orderId, support: 'true' },
        }).catch(() => {});
      }
      continue;
    }

    // 1-hour nudge
    const alreadyNudged = await redis.get(`stale:inprogress:nudge:${orderId}`);
    if (alreadyNudged) continue;
    await redis.setex(`stale:inprogress:nudge:${orderId}`, 3600, '1');

    logger.warn({ orderId, workerId: order.workerId, minutesIn }, '[STALE] In-progress order running long — nudging worker');

    if (order.workerId) {
      notificationService.notify({
        recipient: { kind: 'worker', id: order.workerId },
        type: 'job_reminder',
        title: 'Please complete the job',
        body: `Your ${order.service.replace(/_/g, ' ')} job has been in progress for ${minutesIn} minutes. Mark complete when done.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId },
      }).catch(() => {});
    }
  }
}

/* Worker bootstrap */

async function main() {
  await connectMongo();
  await loadThresholds();

  // Reload thresholds every 5 minutes in case admin changed them
  setInterval(() => loadThresholds().catch(() => {}), 5 * 60 * 1000);

  // Run sweep immediately on start, then every 2 minutes
  await sweep().catch((err) => logger.error({ err: err.message }, '[STALE] Initial sweep failed'));

  setInterval(() => {
    sweep().catch((err) => logger.error({ err: err.message }, '[STALE] Sweep failed'));
  }, 2 * 60 * 1000);

  logger.info('[STALE] Stale-order watchdog started (sweeps every 2 minutes)');
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '[STALE] Watchdog crashed');
    process.exit(1);
  });
}

module.exports = { sweep };
