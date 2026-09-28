const orderRepo = require('../order.repository');
const geoService = require('../../worker/geo.service');
const abuseService = require('../abuse.service');
const ledgerService = require('../../wallet/ledger.service');
const Worker = require('../../worker/worker.model');
const { dispatchQueue } = require('../../../jobs');
const { redis } = require('../../../config/redis');
const logger = require('../../../core/logger');

/** Every way an order is cancelled: by the customer, by the worker, for no response, for a missing part. */

async function cancelByUser({ orderId, userId, reason }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  // Users can cancel up to and including 'arrived' (with the maximum fee applied).
  // Once service is 'in_progress' or later, cancellation is blocked.
  if (!['created', 'searching', 'assigned', 'on_the_way', 'arrived'].includes(order.status)) {
    throw Object.assign(new Error('Too late to cancel — service is already in progress'), { status: 409 });
  }

  // Worker Cancellation Shield Fund — assess fee, collect or defer, add to weekly pool.
  // Replaces the old direct worker compensation flow; workers now get paid every Monday.
  const shieldService = require('../shield.service');
  const { feePaise, isGrace, collectionStatus } = await shieldService.handleUserCancellation(order, userId).catch((err) => {
    logger.error({ orderId, userId, err: err.message }, 'Shield fee assessment failed — continuing');
    return { feePaise: 0, isGrace: false, collectionStatus: 'zero_fee' };
  });
  const feeReason = isGrace ? 'grace_period' : collectionStatus === 'zero_fee' ? 'no_fee' : 'cancellation_fee';
  const workerCompensationPaise = 0; // workers receive compensation via the Monday fund payout, not directly

  const updated = await orderRepo.transitionStatus(
    orderId,
    ['created', 'searching', 'assigned', 'on_the_way', 'arrived'],
    'cancelled',
    { cancelledAt: new Date(), cancellationReason: reason || 'user_cancelled' }
  );

  // Track cancel in abuse service — split by whether a worker was involved.
  // Pre-assignment cancels (searching/created) catch bot patterns (test 41).
  // Post-assignment cancels trigger escalating freezes (test 42).
  const neverHadWorker = ['created', 'searching'].includes(order.status);
  if (neverHadWorker) {
    abuseService.recordPreAssignmentCancel(userId).catch(() => {});
  }

  // Free the worker — mark available again in both Mongo + Redis
  if (updated.workerId) {
    await Worker.updateOne(
      { _id: updated.workerId },
      { $set: { isAvailable: true, currentOrderId: null } }
    );
    await geoService.setAvailability(updated.workerId, true);
    // Refresh alive timestamp so worker stays discoverable immediately
    await redis.zadd('workers:alive', Date.now(), String(updated.workerId));

    const hadWorker = ['assigned', 'on_the_way', 'arrived'].includes(order.status);
    if (hadWorker) {
      await abuseService.recordCancelAfterAssignment(userId);
      // Notify worker their assignment was cancelled
      const notificationService = require('../../notification/notification.service');
      notificationService.notify({
        recipient: { kind: 'worker', id: updated.workerId },
        type:  'order_cancelled',
        title: '❌ Order cancelled by customer',
        body:  feePaise > 0
          ? `A cancellation fee was charged. You'll receive your Shield Fund payout this Monday.`
          : 'The customer cancelled before you arrived. Monday Shield Fund payout still applies.',
        deepLink: '/worker',
        data:  { orderId: String(orderId) },
      }).catch(() => {});
    }
  }

  if (order.payment?.status === 'paid') {
    ledgerService.recordRefund(updated, reason).catch((err) =>
      logger.error({ err: err.message, orderId }, 'Refund ledger write failed')
    );
  }

  // Remove any pending dispatch jobs for this order
  const dispatchJobIds = [
    `order_${orderId}`,
    `order_${orderId}_retry_1`,
    `order_${orderId}_retry_2`,
  ];
  await Promise.all(
    dispatchJobIds.map((jid) =>
      dispatchQueue.getJob(jid).then((j) => j?.remove().catch(() => {})).catch(() => {})
    )
  );

  redis.publish(
    'order:event',
    JSON.stringify({
      orderId: String(orderId),
      event: 'order.cancelled',
      payload: { reason: reason || 'user_cancelled', feePaise },
    })
  ).catch(() => {});

  return {
    order: updated,
    feePaise,
    feeRupees: Math.round(feePaise / 100),
    feeReason,
    workerCompensationPaise: workerCompensationPaise || 0,
  };
}

/**
 * Worker-initiated cancellation.
 * Allowed from: assigned, on_the_way, arrived.
 * Penalty: base or late (on_the_way/arrived = base × multiplier), debited from worker wallet.
 * Re-dispatches if the order was still assignable, otherwise marks it failed.
 */
async function workerCancel({ orderId, workerId, reason }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (!['assigned', 'on_the_way', 'arrived'].includes(order.status)) {
    throw Object.assign(new Error(`Cannot cancel from status: ${order.status}`), { status: 409 });
  }

  const cancellationService = require('../cancellation.service');
  const { penaltyPaise, reason: penaltyReason, isLate, counts } = await cancellationService.calculateWorkerCancelPenalty(order, reason);

  const walletService = require('../../wallet/wallet.service');
  const Transaction = require('../../payment/transaction.model');

  // Debit penalty from worker wallet (best-effort — cancellation proceeds regardless)
  if (penaltyPaise > 0) {
    try {
      await walletService.apply({
        kind: 'worker',
        id: workerId,
        type: 'debit',
        amountPaise: penaltyPaise,
        reason: Transaction.REASONS.ADMIN_ADJUSTMENT_DEBIT,
        idempotencyKey: `workercancel:${orderId}`,
        refs: { orderId },
        description: `Worker cancellation penalty — ${penaltyReason}`,
      });
    } catch (err) {
      if (err.code !== 'WALLET_HARD_LIMIT') throw err;
      logger.error({ workerId, orderId }, 'Worker cancel penalty blocked by hard limit — proceeding anyway');
    }
  }

  // Increment persistent cancel counter
  await Worker.updateOne(
    { _id: workerId },
    {
      $set: { isAvailable: true, currentOrderId: null, 'penalties.lastPenaltyAt': new Date() },
      $inc: { 'penalties.totalCancels': 1 },
    }
  );
  await geoService.setAvailability(workerId, true);

  // Atomically transition from assigned/on_the_way/arrived directly to searching
  // (bypassing the transient 'cancelled' state avoids a race window where the
  // dispatch worker or another process could see the order as permanently cancelled).
  const existingAttempted = (order.dispatch?.attemptedWorkerIds || []).map(String);
  if (!existingAttempted.includes(String(workerId))) {
    existingAttempted.push(String(workerId));
  }

  const updated = await orderRepo.model().findOneAndUpdate(
    { _id: orderId, status: { $in: ['assigned', 'on_the_way', 'arrived'] } },
    {
      $set: {
        status: 'searching',
        workerId: null,
        'dispatch.currentOfferWorkerId': null,
        'dispatch.offerExpiresAt': null,
        'dispatch.attemptedWorkerIds': existingAttempted,
      },
      $push: {
        statusHistory: {
          $each: [
            { status: 'searching', at: new Date(), meta: { requeued: true, workerCancelled: true } },
          ],
        },
      },
    },
    { new: true }
  );

  if (!updated) {
    // Another process already changed status — safe no-op.
    return { ok: true, penaltyPaise, penaltyReason };
  }

  // Broadcast worker-cancelled event so the user's tracking page updates immediately.
  redis.publish(
    'order:event',
    JSON.stringify({
      orderId: String(orderId),
      event: 'order.worker_cancelled',
      payload: { reason: reason || 'worker_cancelled', cancelledBy: 'worker', isLate },
    })
  ).catch(() => {});

  // Notify user
  const notificationService = require('../../notification/notification.service');
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_cancelled',
    title: '😔 Worker cancelled',
    body: isLate
      ? 'Your worker cancelled after being on the way. Finding another for you now.'
      : 'Your assigned worker cancelled. Finding another for you now.',
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});

  await dispatchQueue.add(
    'dispatch',
    { orderId: String(orderId) },
    { jobId: `order_${orderId}_redispatch_${Date.now()}` }
  );

  // Escalation: too many PENALISED cancels within the window → auto-offline
  // Genuine reasons (breakdown/emergency/…) are free and do NOT count here.
  let escalated = false;
  if (counts) {
    try {
      const cfg = await cancellationService.getConfig();
      // Admin-editable threshold (the Cancellation page saves `maxDailyWorkerCancels`).
      const limit = cfg.maxDailyWorkerCancels ?? cfg.workerCancelLimit ?? 3;
      const key = `worker:cancelwin:${workerId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, cfg.workerCancelWindowSec || 86400);
      if (count >= limit) {
        escalated = true;
        await Worker.updateOne({ _id: workerId }, { $set: { isOnline: false, isAvailable: false } });
        await geoService.markOffline(String(workerId)); // full pool removal
        notificationService.notify({
          recipient: { kind: 'worker', id: workerId },
          type: 'account_warning',
          title: '⚠️ Taken offline — too many cancellations',
          body: `You cancelled ${count} jobs recently. To protect service quality you've been set offline. You can go back online later.`,
          deepLink: '/worker',
          data: { orderId: String(orderId), cancels: count, limit },
        }).catch(() => {});
        logger.warn({ workerId, count, limit }, '[WORKER-CANCEL] Escalation — worker auto-offlined for repeated cancels');
      }
    } catch (err) {
      logger.warn({ err: err.message, workerId }, '[WORKER-CANCEL] Escalation check failed');
    }
  }

  // ZeroWait anti-abuse
  // Ghosting a job you PRE-ACCEPTED is the one thing that can break instant match:
  // the customer was promised a pro with no accept step. So cancelling an
  // instant-matched job costs Ready Mode for a cooling-off period (on top of the
  // normal penalty). Genuine reasons still pay no cash penalty, but Ready Mode is
  // a trust privilege — it is suspended either way.
  if (order.dispatch?.instantMatch) {
    try {
      const pricingService = require('../../pricing/pricing.service');
      const pcfg = await pricingService.getActiveConfig();
      const banHours = pcfg.readyCancelBanHours ?? 24;
      await geoService.exitReady(String(workerId)).catch(() => {});
      await redis.set(`worker:ready:ban:${workerId}`, '1', 'EX', banHours * 3600);
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type: 'account_warning',
        title: 'Ready Mode paused',
        body: `You cancelled a job you had pre-accepted. Ready Mode is paused for ${banHours}h — customers are promised an instant match on those jobs.`,
        deepLink: '/worker',
        data: { orderId: String(orderId), banHours },
      }).catch(() => {});
      logger.warn({ workerId, orderId: String(orderId), banHours }, '[ZEROWAIT] Ready Mode banned — cancelled a pre-accepted job');
    } catch (err) {
      logger.warn({ err: err.message, workerId }, '[ZEROWAIT] Ready ban failed');
    }
  }

  return { ok: true, penaltyPaise, penaltyReason, escalated };
}

/**
 * Preview what a worker cancellation would cost/mean BEFORE they confirm:
 * penalty for the chosen reason, whether it's late, and whether this cancel
 * would trip the escalation threshold (auto-offline).
 */
async function workerCancelPreview({ orderId, workerId, reason }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  const cancellable = ['assigned', 'on_the_way', 'arrived'].includes(order.status);

  const cancellationService = require('../cancellation.service');
  const { penaltyPaise, isLate, isGenuine, counts } = await cancellationService.calculateWorkerCancelPenalty(order, reason);
  const cfg = await cancellationService.getConfig();
  const limit = cfg.maxDailyWorkerCancels ?? cfg.workerCancelLimit ?? 3;
  const cancelsInWindow = Number(await redis.get(`worker:cancelwin:${workerId}`)) || 0;

  return {
    cancellable,
    status: order.status,
    isLate,
    isGenuine,
    penaltyPaise,
    penaltyRupees: Math.round(penaltyPaise / 100),
    cancelsInWindow,
    limit,
    willEscalate: counts && (cancelsInWindow + 1) >= limit,
    reasons: cancellationService.WORKER_CANCEL_REASONS,
  };
}

/**
 * Worker arrived but customer didn't respond after waiting.
 * Penalty-free for worker. Customer charged arrived-cancellation fee.
 * Worker receives arrival compensation. Support ticket auto-created.
 */
async function workerNoResponseCancel({ orderId, workerId }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.status !== 'arrived') {
    throw Object.assign(new Error('Can only report no-response after arriving'), { status: 409 });
  }

  const cancellationService = require('../cancellation.service');
  const walletService   = require('../../wallet/wallet.service');
  const Transaction     = require('../../payment/transaction.model');

  const cfg = await cancellationService.getConfig();
  const feePaise = cfg.userCancelFeeArrivedPaise ?? 5000; // ₹50 — same as user-arrived-cancel fee
  const workerCompPaise = Math.round(feePaise * 0.70);   // 70% to worker

  // Charge customer the arrived-cancel fee (best-effort)
  try {
    await walletService.apply({
      kind: 'user', id: order.userId, type: 'debit',
      amountPaise: feePaise,
      reason: Transaction.REASONS.ADMIN_ADJUSTMENT_DEBIT,
      idempotencyKey: `noresponse:user:${orderId}`,
      refs: { orderId },
      description: 'No-response fee — worker arrived but customer unreachable',
    });
  } catch (err) {
    logger.warn({ orderId, err: err.message }, '[NO_RESPONSE] Fee collection failed — proceeding');
  }

  // Credit worker for showing up (no penalty)
  if (workerCompPaise > 0) {
    await walletService.apply({
      kind: 'worker', id: workerId, type: 'credit',
      amountPaise: workerCompPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `noresponse:worker:${orderId}`,
      refs: { orderId },
      description: 'Arrival compensation — customer didn\'t respond',
    }).catch(() => {});
  }

  // Free the worker immediately (no penalty flag, no counter increment)
  await Worker.updateOne({ _id: workerId }, { $set: { isAvailable: true, currentOrderId: null } });
  await geoService.setAvailability(workerId, true);

  await orderRepo.transitionStatus(orderId, ['arrived'], 'cancelled', {
    cancelledAt: new Date(),
    cancellationReason: 'customer_no_response',
  });

  // Notify customer
  const notificationService = require('../../notification/notification.service');
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_cancelled',
    title: '❌ Order cancelled — No response',
    body: 'Your worker arrived but could not reach you. A ₹50 arrival fee was charged.',
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});

  // Auto-create support ticket for admin review
  try {
    const SupportTicket = require('../../engagement/support-ticket.model');
    await SupportTicket.create({
      orderId: order._id,
      userId: order.userId,
      workerId,
      subject: 'Customer no-response — worker cancelled',
      body: `Worker arrived for order ${order._id} but customer did not respond. Arrival fee of ₹${feePaise / 100} charged. Worker compensated ₹${workerCompPaise / 100}.`,
      source: 'system',
      status: 'open',
    });
  } catch (_) { /* non-fatal */ }

  return { ok: true, feePaise, workerCompPaise, reason: 'customer_no_response' };
}

/**
 * Worker cannot complete job because required spare part is unavailable.
 * Worker receives a diagnostic fee. Customer refunded minus diagnostic fee.
 * Part request logged for admin to source.
 */
async function workerPartUnavailableCancel({ orderId, workerId, partName, notes }) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (!['arrived', 'in_progress'].includes(order.status)) {
    throw Object.assign(new Error('Part unavailable report only valid during active service'), { status: 409 });
  }

  const DIAGNOSTIC_FEE_PAISE = 15000; // ₹150 — worker visited and diagnosed
  const walletService   = require('../../wallet/wallet.service');
  const Transaction     = require('../../payment/transaction.model');
  const pricingService  = require('../../pricing/pricing.service');

  // Credit diagnostic fee to worker
  await walletService.apply({
    kind: 'worker', id: workerId, type: 'credit',
    amountPaise: DIAGNOSTIC_FEE_PAISE,
    reason: Transaction.REASONS.WORKER_EARNING,
    idempotencyKey: `partunav:worker:${orderId}`,
    refs: { orderId },
    description: `Diagnostic fee — spare part (${partName}) unavailable`,
  }).catch(() => {});

  // Deduct diagnostic fee from customer refund — charge partial
  const orderTotalPaise = order.pricing?.totalPaise ?? Math.round((order.pricing?.total ?? 0) * 100);
  const refundPaise = Math.max(0, orderTotalPaise - DIAGNOSTIC_FEE_PAISE);
  if (refundPaise > 0 && order.payment?.transactionId) {
    try {
      const paymentService = require('../../payment/payment.service');
      await paymentService.refund({ orderId: String(order._id), amountPaise: refundPaise, reason: 'part_unavailable' });
    } catch (err) {
      logger.warn({ orderId, err: err.message }, '[PART_UNAVAILABLE] Refund failed — admin review needed');
    }
  }

  // Cancel order — no worker penalty counter
  await Worker.updateOne({ _id: workerId }, { $set: { isAvailable: true, currentOrderId: null } });
  await geoService.setAvailability(workerId, true);

  await orderRepo.transitionStatus(orderId, ['arrived', 'in_progress'], 'cancelled', {
    cancelledAt: new Date(),
    cancellationReason: 'part_unavailable',
    cancellationNotes: `Part: ${partName}. ${notes || ''}`,
  });

  // Log unfulfilable part for admin sourcing
  try {
    const SupportTicket = require('../../engagement/support-ticket.model');
    await SupportTicket.create({
      orderId: order._id,
      userId: order.userId,
      workerId,
      subject: `Spare part unavailable: ${partName}`,
      body: `Order ${order._id} (${order.service}) could not be completed. Part "${partName}" unavailable. Notes: ${notes || 'none'}. Diagnostic fee ₹${DIAGNOSTIC_FEE_PAISE / 100} retained. Refund ₹${refundPaise / 100} issued.`,
      source: 'system',
      status: 'open',
    });
  } catch (_) { /* non-fatal */ }

  const notificationService = require('../../notification/notification.service');
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_cancelled',
    title: '🔧 Part unavailable — order closed',
    body: `Worker couldn't complete the job — ${partName} is out of stock. Refund of ₹${Math.round(refundPaise / 100)} is on its way.`,
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});

  return { ok: true, diagnosticFeePaise: DIAGNOSTIC_FEE_PAISE, refundPaise, partName };
}

module.exports = {
  cancelByUser,
  workerCancel,
  workerCancelPreview,
  workerNoResponseCancel,
  workerPartUnavailableCancel,
};
