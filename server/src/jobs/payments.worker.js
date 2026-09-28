/**
 * Payments Worker — Refund + Settlement Processing
 * -------------------------------------------------------------------------
 * Handles:
 *   'refund'   — Auto-refund when dispatch fails (from DLQ worker) or admin
 *                initiates a programmatic refund, through Cashfree to the
 *                customer's original payment method.
 *
 * Idempotent: the refund id is derived from the payment, so a retry never refunds twice.
 * -------------------------------------------------------------------------
 */

require('dotenv').config();
const { Worker: BullWorker } = require('bullmq');
const { createBullConnection }  = require('../config/redis');
const { connectMongo }          = require('../config/mongo');
const Order                     = require('../modules/order/order.model');
const logger                    = require('../core/logger');

async function processPaymentsJob(job) {
  const { name, data } = job;

  if (name === 'refund') return handleRefund(data);
  logger.warn({ name }, '[PAYMENTS] Unknown job name — skipping');
  return { skipped: true };
}

async function handleRefund({ orderId, userId, amountPaise, reason }) {
  logger.info({ orderId, amountPaise, reason }, '[PAYMENTS] Processing refund');

  const order = await Order.findById(orderId).lean();
  if (!order) {
    logger.warn({ orderId }, '[PAYMENTS] Order not found — skipping refund');
    return { skipped: true, reason: 'order_not_found' };
  }

  // Idempotency: skip if already refunded
  if (order.payment?.status === 'refunded') {
    logger.info({ orderId }, '[PAYMENTS] Already refunded — skipping');
    return { skipped: true, reason: 'already_refunded' };
  }

  // Cash orders: no gateway refund needed, just mark + notify
  if (order.payment?.method === 'cash' || !order.payment?.transactionId) {
    await Order.findByIdAndUpdate(orderId, { $set: { 'payment.status': 'refunded' } });
    logger.info({ orderId }, '[PAYMENTS] Cash/unpaid order — marked refunded, no gateway call needed');
    return { ok: true, method: 'cash_no_gateway' };
  }

  // Online payment: Cashfree returns it to the original card/UPI. It used to be
  // refunded to the source AND credited to the wallet — the customer got it twice.
  const paymentService = require('../modules/payment/payment.service');
  const result = await paymentService.refundOrderPayment({ orderId: order._id, amountPaise, reason: reason || 'order_failed' });
  if (!result.refunded) {
    logger.error({ orderId, reason: result.reason }, '[PAYMENTS] Refund not sent — flagged for ops');
    await Order.findByIdAndUpdate(orderId, { $set: { 'payment.reconciliationRequired': true } });
    return { ok: false, reason: result.reason };
  }
  const refundPaise = result.amountPaise || amountPaise;

  // Notify user
  try {
    const notificationService = require('../modules/notification/notification.service');
    const rupees = Math.round(refundPaise / 100);
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'refund_processed',
      title: '₹' + rupees + ' refunded',
      body: 'Your refund is on its way to the card or UPI you paid with. Banks usually take 5–7 working days.',
      deepLink: `/orders/${orderId}`,
      data: { orderId: String(orderId), amountRupees: rupees },
    });
  } catch { /* notification failure is non-fatal */ }

  logger.info({ orderId, refundPaise }, '[PAYMENTS] Refund requested');
  return { ok: true, refundPaise };
}

async function start() {
  await connectMongo();

  const worker = new BullWorker('payments', processPaymentsJob, {
    connection: createBullConnection(),
    concurrency: 3,
  });

  worker.on('completed', (job, result) => logger.info({ jobId: job.id, name: job.name, result }, '[PAYMENTS] Job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, name: job?.name, err: err.message }, '[PAYMENTS] Job failed'));

  logger.info('[PAYMENTS] Worker started — handling refunds and settlements');
}

start().catch((err) => { logger.error({ err }, '[PAYMENTS] Fatal startup error'); process.exit(1); });
