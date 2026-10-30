const Dispute = require('./dispute.model');
const Order = require('../order/order.model');
const Transaction = require('../payment/transaction.model');
const walletService = require('../wallet/wallet.service');
const notificationService = require('../notification/notification.service');
const auditService = require('../admin/audit.service');
const cancellationService = require('../order/cancellation.service');

const SLA_HOURS = 24;
const MAX_DISPUTES_PER_30_DAYS = 3; // max claims per user in a rolling 30-day window

async function open({ orderId, raisedBy, category, description, evidenceUrls = [] }) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  // Verify the raiser is a party to this order
  const isUser = String(order.userId) === String(raisedBy.id) && raisedBy.kind === 'user';
  const isWorker = String(order.workerId || '') === String(raisedBy.id) && raisedBy.kind === 'worker';
  if (!isUser && !isWorker) {
    throw Object.assign(new Error('You are not a party to this order'), { status: 403, code: 'NOT_PARTY' });
  }
  // Disputes only on completed/cancelled within last 7 days
  if (!['completed', 'cancelled', 'failed'].includes(order.status)) {
    throw Object.assign(new Error('Disputes can only be raised on completed or cancelled orders'), {
      status: 409, code: 'BAD_ORDER_STATUS',
    });
  }
  const ageDays = (Date.now() - new Date(order.completedAt || order.cancelledAt || order.createdAt).getTime())
    / 86400000;
  if (ageDays > 7) {
    throw Object.assign(new Error('Dispute window is 7 days from completion'), {
      status: 409, code: 'DISPUTE_WINDOW_EXPIRED',
    });
  }

  // One active dispute per order per raiser — blocks opening 10 disputes on same order.
  const existingOnOrder = await Dispute.findOne({
    orderId,
    'raisedBy.id': raisedBy.id,
    status: { $in: ['open', 'under_review'] },
  }).lean();
  if (existingOnOrder) {
    throw Object.assign(
      new Error('You already have an open dispute on this order.'),
      { status: 409, code: 'DISPUTE_ALREADY_OPEN', disputeId: String(existingOnOrder._id) }
    );
  }

  // Rolling 30-day rate limit per claimant — blocks mass fake refund campaigns.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const recentCount = await Dispute.countDocuments({
    'raisedBy.id': raisedBy.id,
    createdAt: { $gte: thirtyDaysAgo },
  });
  if (recentCount >= MAX_DISPUTES_PER_30_DAYS) {
    throw Object.assign(
      new Error(`Maximum ${MAX_DISPUTES_PER_30_DAYS} disputes per 30 days. Contact support for urgent matters.`),
      { status: 429, code: 'DISPUTE_RATE_LIMIT' }
    );
  }

  // Increment lifetime dispute counter on user model for admin risk scoring
  if (raisedBy.kind === 'user') {
    const User = require('../user/user.model');
    User.updateOne({ _id: raisedBy.id }, { $inc: { 'abuse.totalDisputes': 1 } }).catch(() => {});
  }

  // The other party
  const against = isUser
    ? (order.workerId ? { kind: 'worker', id: order.workerId } : null)
    : { kind: 'user', id: order.userId };

  const dispute = await Dispute.create({
    orderId,
    raisedBy,
    against,
    category,
    description,
    evidenceUrls,
    status: 'open',
    slaDeadline: new Date(Date.now() + SLA_HOURS * 3600 * 1000),
    messages: [{ from: raisedBy.kind, fromId: raisedBy.id, text: description }],
  });

  // Notify the other party + assign to admin queue (admins poll)
  if (against) {
    await notificationService.notify({
      recipient: against,
      type: 'dispute_response',
      title: 'A dispute was raised against your order',
      body: 'Our team is reviewing it. We may reach out for more info.',
      deepLink: `/disputes/${dispute._id}`,
    });
  }

  return dispute;
}

async function addMessage({ disputeId, from, fromId, text }) {
  const dispute = await Dispute.findByIdAndUpdate(
    disputeId,
    { $push: { messages: { from, fromId, text } } },
    { new: true }
  );
  if (!dispute) throw Object.assign(new Error('Dispute not found'), { status: 404 });
  return dispute;
}

/**
 * Admin resolves a dispute. Wires the resolution into wallet ops.
 *
 * Resolution types:
 *   refund_full      → credit user the full order amount
 *   refund_partial   → credit user the specified amount
 *   no_action        → just close
 *   worker_penalty   → debit worker the specified amount, credit user the same
 *   worker_warning   → no money movement, just a warning record
 *   split_decision   → both refundAmountPaise and penaltyAmountPaise can be set
 */
async function resolve({ disputeId, resolution, req }) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw Object.assign(new Error('Dispute not found'), { status: 404 });
  if (dispute.status === 'resolved' || dispute.status === 'closed') {
    throw Object.assign(new Error('Dispute already resolved'), { status: 409 });
  }

  const order = await Order.findById(dispute.orderId).lean();
  if (!order) throw Object.assign(new Error('Order vanished'), { status: 500 });

  // Apply money movements based on resolution type
  if (['refund_full', 'refund_partial', 'split_decision'].includes(resolution.type)) {
    const refundPaise = resolution.type === 'refund_full'
      ? order.pricing.total * 100
      : (resolution.refundAmountPaise || 0);
    if (refundPaise > 0) {
      await walletService.apply({
        kind: 'user',
        id: order.userId,
        type: 'credit',
        amountPaise: refundPaise,
        reason: Transaction.REASONS.REFUND,
        idempotencyKey: `dispute:refund:${disputeId}`,
        refs: { orderId: order._id },
        description: `Refund — dispute ${dispute.category}`,
      });
      resolution.refundAmountPaise = refundPaise;
    }
  }

  if (['worker_penalty', 'split_decision'].includes(resolution.type)) {
    let penaltyPaise = resolution.penaltyAmountPaise;
    if (!penaltyPaise && resolution.type === 'worker_penalty') {
      // Default no-show penalty
      penaltyPaise = cancellationService.calculateNoShowPenalty(order);
    }
    if (penaltyPaise > 0 && order.workerId) {
      // Debit the worker — may overdraft if they don't have balance, in which
      // case wallet.apply throws and we record the penalty as pending. We still
      // close the dispute; admin can reconcile manually.
      try {
        await walletService.apply({
          kind: 'worker',
          id: order.workerId,
          type: 'debit',
          amountPaise: penaltyPaise,
          reason: Transaction.REASONS.ADMIN_ADJUSTMENT_DEBIT,
          idempotencyKey: `dispute:penalty:${disputeId}`,
          refs: { orderId: order._id },
          description: `Penalty — dispute ${dispute.category}`,
        });
        resolution.penaltyAmountPaise = penaltyPaise;
      } catch (err) {
        if (err.code === 'WALLET_INSUFFICIENT') {
          // Mark as pending; admin's notes capture it
          resolution.adminNotes = (resolution.adminNotes || '') +
            ` [INSUFFICIENT FUNDS — penalty of ₹${penaltyPaise / 100} pending]`;
        } else {
          throw err;
        }
      }
    }
  }

  dispute.status = 'resolved';
  dispute.resolution = {
    ...resolution,
    resolvedBy: req.auth.sub,
    resolvedAt: new Date(),
  };
  await dispute.save();

  // Notify both parties
  await notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'dispute_response',
    title: 'Your dispute has been resolved',
    body: resolutionSummary(resolution),
    deepLink: `/orders/${order._id}`,
  });
  if (order.workerId) {
    await notificationService.notify({
      recipient: { kind: 'worker', id: order.workerId },
      type: 'dispute_response',
      title: 'Dispute resolved',
      body: resolutionSummary(resolution),
      deepLink: `/worker/jobs/${order._id}`,
    });
  }

  await auditService.fromRequest(req, 'admin.dispute_resolve',
    { kind: 'order', id: order._id }, null, dispute.resolution);

  return dispute;
}

function resolutionSummary(r) {
  switch (r.type) {
    case 'refund_full': return 'Full refund issued to your wallet';
    case 'refund_partial': return `Partial refund of ₹${(r.refundAmountPaise || 0) / 100} issued`;
    case 'no_action': return 'After review, no further action will be taken';
    case 'worker_penalty': return `Penalty of ₹${(r.penaltyAmountPaise || 0) / 100} applied`;
    case 'worker_warning': return 'A formal warning was issued';
    case 'split_decision': return 'Resolution applied to both parties — see details';
    default: return 'Dispute closed';
  }
}

module.exports = { open, addMessage, resolve };
