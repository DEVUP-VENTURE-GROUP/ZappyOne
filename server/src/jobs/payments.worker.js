/**
 * Payments Worker — Refund + Settlement Processing
 * -------------------------------------------------------------------------
 * Handles:
 *   'refund'   — Auto-refund when dispatch fails (from DLQ worker) or admin
 *                initiates a programmatic refund. Calls Razorpay refund API
 *                and credits user wallet.
 *   'settle'   — Future: deferred settlement for marketplace payouts.
 *
 * Idempotent: safe to retry on failure; Razorpay refund uses idempotency key.
 * -------------------------------------------------------------------------
 */

require('dotenv').config();
const { Worker: BullWorker } = require('bullmq');
const { createBullConnection }  = require('../config/redis');
const { connectMongo }          = require('../config/mongo');
const Order                     = require('../modules/order/order.model');
const logger                    = require('../utils/logger');

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

  // Online payment: call Razorpay
  const PaymentIntent = require('../modules/payment/payment-intent.model');
  const walletService = require('../modules/wallet/wallet.service');
  const Transaction   = require('../modules/payment/transaction.model');

  const intent = await PaymentIntent.findOne({ orderId: order._id, status: 'captured' }).lean();
  if (!intent) {
    logger.warn({ orderId }, '[PAYMENTS] No captured intent found — cannot refund');
    // Mark for manual reconciliation
    await Order.findByIdAndUpdate(orderId, { $set: { 'payment.reconciliationRequired': true } });
    return { ok: false, reason: 'no_captured_intent' };
  }

  const refundPaise = amountPaise
    ? Math.min(Number(amountPaise), intent.amountPaise)
    : intent.amountPaise;

  const idempotencyKey = `auto_refund:${orderId}`;

  let rzpRefund;
  try {
    const razorpay = require('../modules/payment/razorpay.client');
    rzpRefund = await razorpay.refundPayment(intent.razorpayPaymentId, refundPaise);
  } catch (err) {
    logger.error({ orderId, err: err.message }, '[PAYMENTS] Razorpay refund API failed');
    throw err; // Let BullMQ retry (exponential backoff configured on paymentsQueue)
  }

  // Credit user wallet
  try {
    await walletService.apply({
      kind:           'user',
      id:             userId || order.userId,
      type:           'credit',
      amountPaise:    refundPaise,
      reason:         Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
      idempotencyKey: `wallet:${idempotencyKey}`,
      refs:           { orderId: order._id },
      description:    `Auto-refund: ${reason || 'order_failed'}`,
      metadata:       { rzpRefundId: rzpRefund.id, reason },
    });
  } catch (err) {
    // Wallet credit failed after successful gateway refund — flag for reconciliation
    logger.error({ orderId, rzpRefundId: rzpRefund.id, err: err.message }, '[PAYMENTS] Wallet credit failed after Razorpay refund — manual reconciliation required');
    await Order.findByIdAndUpdate(orderId, { $set: { 'payment.reconciliationRequired': true } });
    return { ok: false, reason: 'wallet_credit_failed', rzpRefundId: rzpRefund.id };
  }

  // Mark intent and order as refunded
  await PaymentIntent.findByIdAndUpdate(intent._id, {
    $set: { status: 'refunded' },
    $push: { events: { event: 'auto_refund', payload: { refundId: rzpRefund.id, amountPaise: refundPaise, reason } } },
  });
  await Order.findByIdAndUpdate(orderId, { $set: { 'payment.status': 'refunded' } });

  // Notify user
  try {
    const notificationService = require('../modules/notification/notification.service');
    const rupees = Math.round(refundPaise / 100);
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'refund_processed',
      title: '₹' + rupees + ' refunded',
      body: 'Your refund has been processed and credited to your Zappy wallet.',
      deepLink: '/wallet',
      data: { orderId: String(orderId), amountRupees: rupees },
    });
  } catch { /* notification failure is non-fatal */ }

  logger.info({ orderId, refundPaise, rzpRefundId: rzpRefund.id }, '[PAYMENTS] Refund complete');
  return { ok: true, rzpRefundId: rzpRefund.id, refundPaise };
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
