/**
 * Ledger Service
 * ----------------------------------------------------------------------------
 * Convenience wrappers around Transaction.create for order-level bookkeeping.
 * All writes use the canonical Transaction schema (owner/amountPaise/reason).
 * Idempotency keys prevent double-writes on retries.
 */

const Transaction = require('../payment/transaction.model');
const logger = require('../../core/logger');

/**
 * Write a refund row when an order is cancelled after payment was captured.
 */
async function recordRefund(order, reason) {
  if (!order.pricing?.total) return;
  const amountPaise = Math.round(order.pricing.total * 100);
  if (amountPaise <= 0) return;

  try {
    await Transaction.create({
      type: 'credit',
      owner: { kind: 'user', id: order.userId },
      amountPaise,
      reason: Transaction.REASONS.REFUND,
      refOrderId: order._id,
      idempotencyKey: `refund:${order._id}`,
      description: `Refund: ${reason || 'cancellation'}`,
      status: 'succeeded',
    });
  } catch (err) {
    if (err.code === 11000) return; // already recorded
    logger.error({ err: err.message, orderId: order._id }, 'Refund ledger write failed');
  }
}

/**
 * Compute running balance for a principal from the ledger.
 * Used for reconciliation and admin reporting.
 */
async function getBalance({ kind, id, since }) {
  const match = { 'owner.kind': kind, status: 'succeeded' };
  if (id) match['owner.id'] = id;
  if (since) match.createdAt = { $gte: since };

  const agg = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: '$reason', totalPaise: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
  ]);

  const byReason = Object.fromEntries(agg.map((r) => [r._id, { totalPaise: r.totalPaise, count: r.count }]));
  const netPaise = agg.reduce((s, r) => s + r.totalPaise, 0);
  return { netPaise, netRupees: Math.round(netPaise / 100), byReason };
}

module.exports = { recordRefund, getBalance };
