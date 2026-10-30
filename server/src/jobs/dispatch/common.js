const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

/** Dispatch tuning and small helpers shared by every dispatch step. */

const MAX_BATCH_SIZE     = 10;
const MAX_RETRIES        = 2;
const RETRY_DELAY_MS     = 90_000;     // 90s between retry attempts
const MIN_STEP_WAIT_MS   = 3_000;      // wait per later empty step (was 10s)
// Steps below this index (50m, 100m, 250m, 500m) are skipped instantly when empty
// — in dense cities nobody is within 500m, burning 4×10s here was wasteful.
const INSTANT_SKIP_STEPS = 4;

/* Record abuse-service outcomes (fire-and-forget) */

function recordOutcomes(acceptedBy, acceptOutcome, rejected, ignored) {
  const abuseService = require('../../modules/order/abuse.service');
  if (acceptedBy && acceptOutcome) {
    abuseService.recordWorkerOutcome(acceptedBy, acceptOutcome).catch(() => {});
  }
  for (const wId of rejected) abuseService.recordWorkerOutcome(wId, 'reject').catch(() => {});
  for (const wId of ignored)  abuseService.recordWorkerOutcome(wId, 'timeout').catch(() => {});
}

/* Helpers */

function sleep(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

async function markOrderFailed(order, reason) {
  order.status = 'failed';
  order.cancellationReason = reason;
  order.statusHistory.push({ status: 'failed', meta: { reason } });
  await order.save();
  await emitToOrderRoom(order._id, 'order.failed', { reason });
  logger.info({ orderId: order._id, reason }, '[DISPATCH] Order marked failed');

  // Auto-refund: if the user had already paid online, issue a full refund.
  // Cash orders need no refund (money never reached platform).
  if (order.payment?.status === 'paid' && order.payment?.method !== 'cash') {
    try {
      const result = await require('../../modules/payment/payment.service')
        .refundOrderPayment({ orderId: order._id, reason: `Order failed: ${reason}` });
      logger.info({ orderId: order._id, result }, '[DISPATCH] Auto-refund on order failure');
    } catch (refundErr) {
      // Non-blocking — admin can manually refund if this fails.
      logger.error({ err: refundErr.message, orderId: order._id }, '[DISPATCH] Auto-refund failed — manual action required');
    }
  }

  // Notify user of failure + refund status
  const notificationService = require('../../modules/notification/notification.service');
  const wasPaid = order.payment?.status === 'paid' && order.payment?.method !== 'cash';
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_failed',
    title: 'No workers available',
    body: wasPaid
      ? 'We could not find a worker for your request. A full refund has been initiated.'
      : 'We could not find a worker for your request. No charge was applied.',
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});
}

async function emitToOrderRoom(orderId, event, payload) {
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event,
    payload,
  }));
}

module.exports = {
  MAX_BATCH_SIZE,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  MIN_STEP_WAIT_MS,
  INSTANT_SKIP_STEPS,
  recordOutcomes,
  sleep,
  markOrderFailed,
  emitToOrderRoom,
};
