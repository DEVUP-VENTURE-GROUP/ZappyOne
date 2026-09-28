/**
 * Warranty Service — Issue, Track, and Claim
 */
const Warranty = require('./warranty.model');
const Order    = require('../order/order.model');
const { redis } = require('../../config/redis');
const logger   = require('../../core/logger');

async function issueWarranty({ order, warrantyDays }) {
  if (!warrantyDays || warrantyDays <= 0) return null;
  const issuedAt  = new Date();
  const expiresAt = new Date(issuedAt.getTime() + warrantyDays * 86400000);
  try {
    const warranty = await Warranty.create({
      orderId:   order._id,
      userId:    order.userId,
      workerId:  order.workerId,
      service:   order.service,
      warrantyDays,
      issuedAt,
      expiresAt,
      status: 'active',
    });
    logger.info({ orderId: order._id, warrantyDays, expiresAt }, '[Warranty] Issued');
    return warranty;
  } catch (err) {
    if (err.code === 11000) return null; // already issued (idempotent)
    throw err;
  }
}

async function getMyWarranties(userId) {
  return Warranty.find({ userId })
    .sort({ issuedAt: -1 })
    .populate('workerId', 'name rating')
    .lean();
}

async function claimWarranty({ warrantyId, userId, reason, photoUrls = [] }) {
  const warranty = await Warranty.findById(warrantyId);
  if (!warranty) throw Object.assign(new Error('Warranty not found'), { status: 404 });
  if (String(warranty.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your warranty'), { status: 403 });
  }
  if (warranty.status !== 'active') {
    throw Object.assign(new Error(`Warranty is ${warranty.status}`), { status: 409 });
  }
  if (warranty.expiresAt < new Date()) {
    warranty.status = 'expired';
    await warranty.save();
    throw Object.assign(new Error('Warranty has expired'), { status: 410 });
  }

  warranty.status      = 'claimed';
  warranty.claimReason = reason;
  warranty.claimPhotos = photoUrls;
  warranty.claimAt     = new Date();
  await warranty.save();

  /* Create a follow-up revisit order (free) */
  const originalOrder = await Order.findById(warranty.orderId)
    .select('pickupLocation service description paymentMethod priority')
    .lean();

  if (originalOrder) {
    const dispatchQueue = require('../../jobs').dispatchQueue;
    const crypto = require('crypto');
    const revisitOrder = await Order.create({
      userId:    warranty.userId,
      workerId:  null,
      service:   warranty.service,
      description: `WARRANTY REVISIT: ${reason}`,
      images:    photoUrls,
      pickupLocation: originalOrder.pickupLocation,
      pricing: { total: 0, baseFee: 0, distanceKm: 0, distanceFee: 0, platformFee: 0, subtotal: 0, currency: 'INR' },
      status: 'created',
      statusHistory: [{ status: 'created', meta: { warrantyRevisit: true } }],
      payment: { method: 'cash', status: 'paid' },
      otp: crypto.randomInt(1000, 9999).toString(),
      priority: 'normal',
    });

    warranty.revisitOrderId = revisitOrder._id;
    await warranty.save();

    /* Prefer original worker */
    await dispatchQueue.add('dispatch', { orderId: String(revisitOrder._id) }, {
      jobId:    `warranty:${revisitOrder._id}`,
      priority: 2,
    });

    /* Notify original worker */
    const notifService = require('../notification/notification.service');
    notifService.notify({
      recipient: { kind: 'worker', id: warranty.workerId },
      type:      'worker_wellness',
      title:     '🔧 Warranty revisit requested',
      body:      `Customer has raised a warranty claim for your ${warranty.service} service. Please revisit.`,
      deepLink:  `/worker/jobs/${revisitOrder._id}`,
    }).catch(() => {});

    return { warranty, revisitOrderId: revisitOrder._id };
  }

  return { warranty };
}

async function getWarrantyForOrder(orderId) {
  return Warranty.findOne({ orderId }).lean();
}

module.exports = { issueWarranty, getMyWarranties, claimWarranty, getWarrantyForOrder };
