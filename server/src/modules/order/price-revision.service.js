/**
 * Mid-Service Price Revision
 * ---------------------------------------------------------------------------
 * Worker discovers a bigger problem mid-service (e.g., pipe burst is worse
 * than expected). Instead of abandoning the job or arguing:
 *   1. Worker submits revision request with photo evidence + new price
 *   2. Customer sees the request in real-time on tracking page
 *   3. Customer has 5 minutes to approve or reject
 *   4. If approved → order pricing updated, service continues
 *   5. If rejected → worker can complete at original price or cancel gracefully
 *   6. Auto-approved if no response within 5 min (configurable)
 *
 * This solves the single biggest cause of mid-service disputes in India.
 * No competitor has this workflow.
 * ---------------------------------------------------------------------------
 */

const PriceRevision = require('./price-revision.model');
const Order         = require('./order.model');
const { redis }     = require('../../config/redis');
const logger        = require('../../core/logger');

const REVISION_TTL_MS    = 5 * 60 * 1000;  // 5 minutes
const AUTO_APPROVE_MS    = 5 * 60 * 1000;  // auto-approve if no response

async function requestRevision({ orderId, workerId, requestedTotal, reason, evidenceUrls = [] }) {
  const order = await Order.findById(orderId).select('workerId userId status pricing').lean();
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.status !== 'in_progress') {
    throw Object.assign(new Error('Can only request revision during active service'), { status: 409 });
  }

  /* Max 2× original price revision to prevent abuse */
  const originalTotal = order.pricing.total;
  if (requestedTotal > originalTotal * 2.5) {
    throw Object.assign(new Error('Revision cannot exceed 2.5× original price'), { status: 400 });
  }
  if (requestedTotal <= originalTotal) {
    throw Object.assign(new Error('Revised price must be higher than original'), { status: 400 });
  }

  /* Only one pending revision at a time */
  const existing = await PriceRevision.findOne({ orderId, status: 'pending' }).lean();
  if (existing) {
    throw Object.assign(new Error('A revision request is already pending'), { status: 409 });
  }

  const expiresAt = new Date(Date.now() + REVISION_TTL_MS);
  const revision  = await PriceRevision.create({
    orderId, workerId, originalTotal, requestedTotal, reason, evidenceUrls, expiresAt,
  });

  /* Real-time push to customer */
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event:   'price.revision.requested',
    payload: {
      revisionId:     String(revision._id),
      originalTotal,
      requestedTotal,
      increase:       requestedTotal - originalTotal,
      reason,
      evidenceUrls,
      expiresAt:      expiresAt.toISOString(),
      expiresInSec:   Math.round(REVISION_TTL_MS / 1000),
    },
  }));

  const notifService = require('../notification/notification.service');
  notifService.notify({
    recipient: { kind: 'user', id: order.userId },
    type:  'order_update',
    title: '📋 Price revision requested',
    body:  `Worker found additional work. New price: ₹${requestedTotal} (was ₹${originalTotal}). Tap to review.`,
    deepLink: `/orders/${orderId}`,
    data:  { orderId: String(orderId), revisionId: String(revision._id) },
    sms:   true,  // SMS because this is urgent
  }).catch(() => {});

  /* Schedule auto-approval if no response */
  setTimeout(() => autoExpireRevision(String(revision._id), String(orderId), String(order.userId)), AUTO_APPROVE_MS + 5000);

  logger.info({ orderId, workerId, requestedTotal, originalTotal }, '[PriceRevision] Revision requested');
  return revision;
}

async function respondRevision({ revisionId, orderId, userId, approved }) {
  /* Ownership check first — before the atomic write */
  const order = await Order.findById(orderId).select('userId workerId pricing').lean();
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }

  /* Atomic findOneAndUpdate with status:'pending' filter — prevents race with autoExpireRevision */
  const revision = await PriceRevision.findOneAndUpdate(
    { _id: revisionId, orderId, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: approved ? 'approved' : 'rejected', resolvedAt: new Date(), resolvedBy: 'customer' } },
    { new: true }
  );
  if (!revision) throw Object.assign(new Error('Revision not found, already resolved, or expired'), { status: 404 });

  if (approved) {
    /* Update order pricing */
    await Order.findByIdAndUpdate(orderId, {
      $set: { 'pricing.total': revision.requestedTotal },
      $push: { statusHistory: { status: order.status, at: new Date(), meta: { priceRevision: revision.requestedTotal } } },
    });
  }

  const event = approved ? 'price.revision.approved' : 'price.revision.rejected';
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event,
    payload: {
      revisionId:     String(revision._id),
      approved,
      newTotal:       approved ? revision.requestedTotal : revision.originalTotal,
      originalTotal:  revision.originalTotal,
      requestedTotal: revision.requestedTotal,
    },
  }));

  logger.info({ orderId, revisionId, approved }, '[PriceRevision] Revision resolved');
  return { revision, approved };
}

async function autoExpireRevision(revisionId, orderId, userId) {
  try {
    /* Atomic: only one of respondRevision or autoExpireRevision can win */
    const revision = await PriceRevision.findOneAndUpdate(
      { _id: revisionId, status: 'pending' },
      { $set: { status: 'approved', resolvedAt: new Date(), resolvedBy: 'auto_approved' } },
      { new: true }
    );
    if (!revision) return; // already resolved by customer

    await Order.findByIdAndUpdate(orderId, {
      $set: { 'pricing.total': revision.requestedTotal },
    });

    await redis.publish('order:event', JSON.stringify({
      orderId, event: 'price.revision.approved',
      payload: { revisionId, approved: true, autoApproved: true, newTotal: revision.requestedTotal },
    }));

    logger.info({ revisionId, orderId }, '[PriceRevision] Auto-approved after timeout');
  } catch (err) {
    logger.warn({ err: err.message, revisionId }, '[PriceRevision] Auto-expire failed');
  }
}

async function getPendingRevision(orderId) {
  return PriceRevision.findOne({ orderId, status: 'pending' }).lean();
}

module.exports = { requestRevision, respondRevision, getPendingRevision };
