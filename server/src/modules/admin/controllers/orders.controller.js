const Order = require('../../order/order.model');
const Worker = require('../../worker/worker.model');
const auditService = require('../audit.service');
const logger = require('../../../utils/logger');

// Allowed admin-forced status transitions. `any` means from ANY current status.
const FORCE_TRANSITIONS = {
  any: ['cancelled', 'completed'],
  searching: ['assigned'],
  assigned: ['on_the_way'],
  on_the_way: ['arrived'],
  arrived: ['in_progress'],
  in_progress: ['completed'],
};

function isTransitionAllowed(from, to) {
  if (FORCE_TRANSITIONS.any.includes(to)) return true;
  return (FORCE_TRANSITIONS[from] || []).includes(to);
}

async function listOrders(req, res, next) {
  try {
    const { status, service, city, from, to, reconciliationRequired, page = 1, limit = 50 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (service) q.service = service;
    // Reconciliation filter: ops queue for payment issues needing manual review
    if (reconciliationRequired === 'true' || reconciliationRequired === true) {
      q['payment.reconciliationRequired'] = true;
    }
    // Date range filter
    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(from);
      if (to) q.createdAt.$lte = new Date(to);
    }
    // City filter via pickup address substring (case-insensitive, no RegExp injection).
    if (city) {
      // Escape special regex chars to prevent ReDoS.
      const safeCity = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q['pickupLocation.address'] = { $regex: safeCity, $options: 'i' };
    }
    const [orders, total] = await Promise.all([
      Order.find(q)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .populate('userId', 'name phone')
        .populate('workerId', 'name phone rating')
        .populate('workerIds', 'name phone rating')
        .lean(),
      Order.countDocuments(q),
    ]);
    res.json({
      orders,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
}

async function refundOrder(req, res, next) {
  try {
    const PaymentIntent = require('../../payment/payment-intent.model');
    const Transaction = require('../../payment/transaction.model');
    const walletService = require('../../wallet/wallet.service');
    const cashfree = require('../../payment/cashfree.client');

    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    /* Only refund online-paid orders */
    if (order.payment?.method === 'cash') {
      return res
        .status(400)
        .json({
          error: 'Cash orders cannot be refunded through this endpoint',
        });
    }
    if (order.payment?.status !== 'paid') {
      return res
        .status(400)
        .json({ error: 'Order has not been paid — nothing to refund' });
    }

    const intent = await PaymentIntent.findOne({
      orderId: order._id,
      status: 'captured',
    }).lean();

    if (!intent) {
      return res
        .status(404)
        .json({ error: 'No captured payment found for this order' });
    }

    const refundPaise = req.body.amountPaise
      ? Math.min(Number(req.body.amountPaise), intent.amountPaise)
      : intent.amountPaise;

    /* Trigger Cashfree refund */
    let cfRefund;
    try {
      cfRefund = await cashfree.createRefund({
        orderId:     intent.cfOrderId,
        amountPaise: refundPaise,
        refundId:    `admin_refund_${order._id}_${Date.now()}`,
        note:        `Admin refund for order ${order._id}`,
      });
    } catch (err) {
      return res.status(502).json({ error: `Cashfree refund failed: ${err.message}` });
    }

    /* Credit user wallet with the refund amount */
    await walletService.apply({
      kind: 'user',
      id: order.userId,
      type: 'credit',
      amountPaise: refundPaise,
      reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
      idempotencyKey: `refund:${cfRefund.cf_refund_id || intent.cfOrderId}`,
      refs: { orderId: order._id, paymentIntentId: intent._id },
      description: `Refund for order ${order._id} — admin initiated`,
      metadata: { adminId: req.auth.sub, cfRefundId: cfRefund.cf_refund_id },
    });

    /* Mark payment intent refunded */
    await PaymentIntent.findByIdAndUpdate(intent._id, {
      $set: { status: 'refunded' },
      $push: {
        events: {
          event: 'admin.refund',
          payload: { cfRefundId: cfRefund.cf_refund_id, amountPaise: refundPaise, adminId: req.auth.sub },
        },
      },
    });

    /* Update order payment status */
    await Order.findByIdAndUpdate(order._id, { $set: { 'payment.status': 'refunded' } });

    await auditService.fromRequest(
      req,
      'admin.order_refund',
      { kind: 'order', id: req.params.id },
      { paymentStatus: 'paid' },
      { refundPaise, cfRefundId: cfRefund.cf_refund_id },
    );

    logger.info({ orderId: order._id, refundPaise, cfRefundId: cfRefund.cf_refund_id, admin: req.auth.sub }, '[Admin] Order refunded');

    res.json({
      ok: true,
      refundPaise,
      refundRupees: Math.round(refundPaise / 100),
      cfRefundId: cfRefund.cf_refund_id,
    });
  } catch (err) {
    next(err);
  }
}

/* Manual Order Intervention */

const REASSIGNABLE_STATUSES = ['searching', 'assigned', 'on_the_way'];

/**
 * GET /orders/:id/nearby-workers — online workers within 10km with required skill.
 */
async function nearbyWorkers(req, res, next) {
  try {
    const order = await Order.findById(req.params.id).select('service pickupLocation').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const [lng, lat] = order.pickupLocation?.coordinates || [];
    if (lng == null || lat == null) return res.status(400).json({ error: 'Order has no pickup coordinates' });

    const workers = await Worker.find({
      isOnline: true,
      isAvailable: true,
      isBlocked: false,
      'kyc.status': 'approved',
      skills: order.service,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 10000, // 10km in metres
        },
      },
    })
      .select('name phone rating skills isOnline isAvailable currentLocation')
      .limit(25)
      .lean();

    // Compute straight-line distance (km) for display.
    const R = 6371;
    const items = workers.map((w) => {
      const [wlng, wlat] = w.currentLocation?.coordinates || [];
      let distanceKm = null;
      if (wlng != null && wlat != null) {
        const dLat = (wlat - lat) * Math.PI / 180;
        const dLng = (wlng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(wlat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
      }
      return {
        _id: w._id,
        name: w.name,
        phone: w.phone,
        rating: w.rating,
        skills: w.skills,
        isOnline: w.isOnline,
        isAvailable: w.isAvailable,
        distanceKm,
      };
    });

    res.json({ orderId: req.params.id, service: order.service, workers: items });
  } catch (err) { next(err); }
}

/**
 * POST /orders/:id/reassign — assign the order to a different worker.
 */
async function reassignOrder(req, res, next) {
  try {
    const { getIo } = require('../../../sockets');
    const { workerId } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!REASSIGNABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: `Cannot reassign from status: ${order.status}` });
    }

    const worker = await Worker.findById(workerId).select('name phone rating skills isOnline isBlocked').lean();
    if (!worker) return res.status(404).json({ error: 'Target worker not found' });
    if (worker.isBlocked || !worker.isOnline) {
      return res.status(409).json({ error: 'Target worker is offline or blocked' });
    }
    if (!worker.skills?.includes(order.service)) {
      return res.status(409).json({ error: 'Target worker lacks the required skill for this order' });
    }

    const previousWorkerId = order.workerId;
    const previousStatus = order.status;

    order.workerId = worker._id;
    order.status = 'assigned';
    order.statusHistory.push({ status: 'assigned', at: new Date(), meta: { reassignedBy: req.auth?.sub } });
    order.reassignHistory.push({
      fromWorkerId: previousWorkerId || null,
      toWorkerId: worker._id,
      by: req.auth?.email || req.auth?.sub,
      reason: 'admin_reassigned',
      at: new Date(),
    });
    await order.save();

    const io = getIo();
    if (io) {
      // Old worker (if any): order taken away
      if (previousWorkerId) {
        io.to(`worker:${previousWorkerId}`).emit('order.cancelled', {
          orderId: String(order._id),
          reason: 'admin_reassigned',
        });
      }
      // New worker: direct assignment (no accept needed). MUST be 'job.assigned' —
      // that is the only event the worker client listens for on a direct assign
      // (see useWorkerOfferSocket). Emitting 'offer.new' went nowhere, so the
      // worker got no popup and no alert sound on an admin reassign.
      io.to(`worker:${worker._id}`).emit('job.assigned', {
        workerId:      String(worker._id),
        orderId:       String(order._id),
        service:       order.service,
        pickupAddress: order.pickupLocation?.address || '',
        price:         order.pricing?.total ?? null,
        adminAssigned: true,
      });
      // User: new worker info
      io.to(`order:${order._id}`).emit('order.assigned', {
        orderId: String(order._id),
        worker: { id: worker._id, name: worker.name, phone: worker.phone, rating: worker.rating },
      });
    }

    // Push notification to new worker — socket alone is silently dropped when app is backgrounded
    const notificationService = require('../../../modules/notification/notification.service');
    const svcLabel = order.service.replace(/_/g, ' ');
    const totalRs  = order.pricing?.total != null ? `₹${Math.round(order.pricing.total / 100)}` : '';
    notificationService.notify({
      recipient: { kind: 'worker', id: worker._id },
      type:      'job_assigned',
      title:     'New job assigned to you',
      body:      `${svcLabel}${totalRs ? ` — ${totalRs}` : ''}. Admin has assigned this order directly to you. Please start your trip.`,
      deepLink:  `/worker/jobs/${String(order._id)}`,
      data:      { orderId: String(order._id), adminAssigned: 'true' },
    }).catch(() => {});

    await auditService.fromRequest(
      req,
      'admin.order_reassign',
      { kind: 'order', id: req.params.id },
      { workerId: previousWorkerId, status: previousStatus },
      { workerId: String(worker._id), status: 'assigned' },
    );

    logger.info({ orderId: order._id, fromWorker: previousWorkerId, toWorker: worker._id, admin: req.auth?.sub }, '[Admin] Order reassigned');
    res.json({ ok: true, order });
  } catch (err) { next(err); }
}

/**
 * POST /orders/:id/force-status — force a status transition (safe map enforced).
 */
async function forceStatus(req, res, next) {
  try {
    const { getIo } = require('../../../sockets');
    const { status, reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const previousStatus = order.status;
    if (previousStatus === status) {
      return res.status(409).json({ error: `Order is already ${status}` });
    }
    if (!isTransitionAllowed(previousStatus, status)) {
      return res.status(409).json({ error: `Transition not allowed: ${previousStatus} → ${status}` });
    }

    order.status = status;
    order.statusHistory.push({ status, at: new Date(), meta: { forcedBy: req.auth?.sub, reason } });
    order.adminOverride = {
      by: req.auth?.email || req.auth?.sub,
      reason,
      previousStatus,
      at: new Date(),
    };
    if (status === 'completed') order.completedAt = order.completedAt || new Date();
    if (status === 'cancelled') {
      order.cancelledAt = new Date();
      order.cancellationReason = reason;
    }
    await order.save();

    // Settlement on forced completion / refund on forced cancel.
    let settlement = null;
    if (status === 'completed') {
      settlement = await settleOnForceComplete(order, req).catch((e) => {
        logger.error({ err: e.message, orderId: order._id }, '[Admin] force-complete settlement failed');
        return { error: e.message };
      });
    } else if (status === 'cancelled') {
      settlement = await refundOnForceCancel(order, true, req).catch((e) => {
        logger.error({ err: e.message, orderId: order._id }, '[Admin] force-cancel refund failed');
        return { error: e.message };
      });
    }

    const io = getIo();
    if (io) {
      io.to(`order:${order._id}`).emit('order.status', {
        orderId: String(order._id),
        status,
        adminForced: true,
        reason,
      });
    }

    await auditService.fromRequest(
      req,
      'admin.order_force_status',
      { kind: 'order', id: req.params.id },
      { status: previousStatus },
      { status, reason, settlement },
    );

    logger.info({ orderId: order._id, from: previousStatus, to: status, admin: req.auth?.sub }, '[Admin] Order status forced');
    res.json({ ok: true, order, settlement });
  } catch (err) { next(err); }
}

/**
 * POST /orders/:id/force-cancel — cancel regardless of current status.
 */
async function forceCancel(req, res, next) {
  try {
    const { getIo } = require('../../../sockets');
    const { reason, refundFull } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'Order is already cancelled' });
    }

    const previousStatus = order.status;
    const previousWorkerId = order.workerId;

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    order.statusHistory.push({ status: 'cancelled', at: new Date(), meta: { forcedBy: req.auth?.sub, reason } });
    order.adminOverride = {
      by: req.auth?.email || req.auth?.sub,
      reason,
      previousStatus,
      at: new Date(),
    };
    await order.save();

    let refund = null;
    if (refundFull) {
      refund = await refundOnForceCancel(order, true, req).catch((e) => {
        logger.error({ err: e.message, orderId: order._id }, '[Admin] force-cancel refund failed');
        return { error: e.message };
      });
    }

    const io = getIo();
    if (io) {
      io.to(`order:${order._id}`).emit('order.status', {
        orderId: String(order._id),
        status: 'cancelled',
        adminForced: true,
        reason,
      });
      if (previousWorkerId) {
        io.to(`worker:${previousWorkerId}`).emit('order.cancelled', {
          orderId: String(order._id),
          reason: 'admin_cancelled',
        });
      }
    }

    await auditService.fromRequest(
      req,
      'admin.order_force_cancel',
      { kind: 'order', id: req.params.id },
      { status: previousStatus },
      { status: 'cancelled', reason, refundFull: !!refundFull, refund },
    );

    logger.info({ orderId: order._id, from: previousStatus, admin: req.auth?.sub, refundFull: !!refundFull }, '[Admin] Order force-cancelled');
    res.json({ ok: true, order, refund });
  } catch (err) { next(err); }
}

/**
 * POST /orders/:id/note — append an admin note.
 */
async function addAdminNote(req, res, next) {
  try {
    const { note } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $push: { adminNotes: { text: note, by: req.auth?.email || req.auth?.sub, at: new Date() } } },
      { new: true },
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await auditService.fromRequest(
      req,
      'admin.order_note',
      { kind: 'order', id: req.params.id },
      null,
      { note },
    );

    res.json({ ok: true, adminNotes: order.adminNotes });
  } catch (err) { next(err); }
}

/* Settlement helpers */

/**
 * Settle worker earnings on an admin-forced completion. Idempotent via
 * idempotency keys — safe if a partial settlement already ran.
 */
async function settleOnForceComplete(order, req) {
  if (order.earnings?.settledAt) {
    return { alreadySettled: true };
  }
  const pricingService = require('../../pricing/pricing.service');
  const walletService = require('../../wallet/wallet.service');
  const Transaction = require('../../payment/transaction.model');

  if (!order.workerId) {
    return { skipped: 'no_worker_assigned' };
  }

  const totalPaise = order.pricing?.totalPaise ?? Math.round((order.pricing?.total || 0) * 100);
  const earnings = await pricingService.calculateEarnings({
    totalPaise,
    workerId: order.workerId,
    snapshotCommissionRate: order.pricing?.snapshotCommissionRate,
  });

  await Order.findByIdAndUpdate(order._id, {
    $set: {
      earnings: {
        workerPaise: earnings.workerPaise,
        platformPaise: earnings.platformPaise,
        commissionRate: earnings.commissionRate,
        settledAt: new Date(),
      },
    },
  });

  // Online order: credit worker their share. Cash order: worker already has cash,
  // recover commission. Mirror the standard completion path.
  const isCash = (order.payment?.method || 'upi') === 'cash';
  if (isCash) {
    await walletService.apply({
      kind: 'worker',
      id: order.workerId,
      type: 'debit',
      amountPaise: earnings.platformPaise,
      reason: Transaction.REASONS.PLATFORM_COMMISSION,
      idempotencyKey: `commission:${order._id}`,
      refs: { orderId: order._id },
      description: `Admin force-complete commission @ ${(earnings.commissionRate * 100).toFixed(1)}%`,
    }).catch((e) => { if (e.code !== 'WALLET_HARD_LIMIT') throw e; });
  } else if (earnings.workerPaise > 0) {
    await walletService.apply({
      kind: 'worker',
      id: order.workerId,
      type: 'credit',
      amountPaise: earnings.workerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `earning:${order._id}`,
      refs: { orderId: order._id },
      description: `Admin force-complete earning for order ${order._id}`,
    });
  }

  return { settled: true, workerPaise: earnings.workerPaise, platformPaise: earnings.platformPaise };
}

/**
 * Issue a full Cashfree refund for a paid online order on forced cancellation.
 * Cash orders / unpaid orders are no-ops.
 */
async function refundOnForceCancel(order, refundFull, req) {
  if (!refundFull) return { refunded: false, reason: 'refund_not_requested' };
  if ((order.payment?.method || 'upi') === 'cash') return { refunded: false, reason: 'cash_order' };
  if (order.payment?.status !== 'paid') return { refunded: false, reason: 'not_paid' };

  const PaymentIntent = require('../../payment/payment-intent.model');
  const Transaction = require('../../payment/transaction.model');
  const walletService = require('../../wallet/wallet.service');
  const cashfree = require('../../payment/cashfree.client');

  const intent = await PaymentIntent.findOne({ orderId: order._id, status: 'captured' }).lean();
  if (!intent) return { refunded: false, reason: 'no_captured_intent' };

  const cfRefund = await cashfree.createRefund({
    orderId: intent.cfOrderId,
    amountPaise: intent.amountPaise,
    refundId: `admin_cancel_refund_${order._id}_${Date.now()}`,
    note: `Admin force-cancel refund for order ${order._id}`,
  });

  await walletService.apply({
    kind: 'user',
    id: order.userId,
    type: 'credit',
    amountPaise: intent.amountPaise,
    reason: Transaction.REASONS.ADMIN_ADJUSTMENT_CREDIT,
    idempotencyKey: `refund:${cfRefund.cf_refund_id || intent.cfOrderId}`,
    refs: { orderId: order._id, paymentIntentId: intent._id },
    description: `Full refund — admin force-cancelled order ${order._id}`,
    metadata: { adminId: req.auth?.sub, cfRefundId: cfRefund.cf_refund_id },
  });

  await Promise.all([
    PaymentIntent.findByIdAndUpdate(intent._id, { $set: { status: 'refunded' } }),
    Order.findByIdAndUpdate(order._id, { $set: { 'payment.status': 'refunded' } }),
  ]);

  return { refunded: true, amountPaise: intent.amountPaise, cfRefundId: cfRefund.cf_refund_id };
}

module.exports = {
  listOrders,
  refundOrder,
  nearbyWorkers,
  reassignOrder,
  forceStatus,
  forceCancel,
  addAdminNote,
};
