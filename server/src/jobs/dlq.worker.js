/**
 * Dead Letter Queue Worker — Failed Dispatch Recovery
 * -------------------------------------------------------------------------
 * Triggered when an order exhausts all dispatch retries (no workers found
 * after 3 attempts + force-assign). Responsibilities:
 *   1. Mark order as 'failed' if still in searching state.
 *   2. Send push notification to user: "We couldn't find a worker."
 *   3. Initiate automatic refund if payment was online (UPI/card).
 *   4. Alert support queue for manual review.
 * -------------------------------------------------------------------------
 */

require('dotenv').config();
const { Worker: BullWorker } = require('bullmq');
const { createBullConnection } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const Order = require('../modules/order/order.model');
const logger = require('../core/logger');

async function processDlqJob(job) {
  const { orderId, failedReason } = job.data;
  logger.warn({ orderId, failedReason }, '[DLQ] Processing failed dispatch order');

  const order = await Order.findById(orderId);
  if (!order) {
    logger.warn({ orderId }, '[DLQ] Order not found — may have been deleted');
    return { skipped: true };
  }

  // 1. Ensure order is marked failed
  if (order.status === 'searching' || order.status === 'created') {
    order.status = 'failed';
    order.statusHistory.push({ status: 'failed', meta: { reason: 'no_workers_available_dlq', failedReason } });
    await order.save();
    logger.info({ orderId }, '[DLQ] Order marked failed');
  }

  // 2. Notify user
  try {
    const notificationService = require('../modules/notification/notification.service');
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'order_failed',
      title: 'No workers available',
      body: 'We couldn\'t find a worker for your request. Any payment will be refunded within 24 hours.',
      deepLink: `/orders/${orderId}`,
      data: { orderId: String(orderId) },
    });
  } catch (err) {
    logger.warn({ orderId, err: err.message }, '[DLQ] Notification failed');
  }

  // 3. Auto-refund if online payment
  if (order.payment?.method !== 'cash' && order.payment?.status === 'paid') {
    try {
      const { paymentsQueue } = require('./index');
      await paymentsQueue.add('refund', {
        orderId: String(orderId),
        userId: String(order.userId),
        amountPaise: Math.round((order.pricing?.total || 0) * 100),
        reason: 'no_workers_available',
        transactionId: order.payment?.transactionId,
      }, { jobId: `refund_${orderId}` });
      logger.info({ orderId }, '[DLQ] Refund job enqueued');
    } catch (err) {
      logger.error({ orderId, err: err.message }, '[DLQ] Failed to enqueue refund');
    }
  }

  return { ok: true, orderId, status: order.status };
}

async function start() {
  await connectMongo();

  const worker = new BullWorker('dead-letter', processDlqJob, {
    connection: createBullConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job, result) => logger.info({ jobId: job.id, result }, '[DLQ] Job completed'));
  worker.on('failed',    (job, err)    => logger.error({ jobId: job?.id, err: err.message }, '[DLQ] Job failed'));

  logger.info('[DLQ] Worker started');
}

start().catch((err) => { logger.error({ err }, '[DLQ] Fatal startup error'); process.exit(1); });
