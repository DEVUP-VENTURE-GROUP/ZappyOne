/**
 * Fraud Detection Service
 * ----------------------------------------------------------------------------
 * Detection functions create FraudEvent rows when suspicious patterns are seen.
 * Each detector is idempotency-aware: it avoids spamming duplicate open events
 * for the same actor within a short window so the ops queue stays signal-rich.
 *
 * All detectors are best-effort and MUST NOT throw into the caller's hot path —
 * order creation / GPS updates call these fire-and-forget. Errors are logged.
 * ----------------------------------------------------------------------------
 */

const FraudEvent = require('./fraud.model');
const Order = require('../order/order.model');
const User = require('../user/user.model');
const Worker = require('../worker/worker.model');
const logger = require('../../utils/logger');

const MIN = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Create a fraud event unless an equivalent OPEN event already exists for this
 * actor + type within `dedupeWindowMs`. Returns the created (or existing) doc.
 */
async function createOrDedupe({ type, severity, actorKind, actorId, actorName, actorPhone, details, orderId }, dedupeWindowMs = 30 * MIN) {
  const since = new Date(Date.now() - dedupeWindowMs);
  const existing = await FraudEvent.findOne({
    type,
    actorId,
    status: 'open',
    createdAt: { $gte: since },
  }).lean();
  if (existing) return existing;

  return FraudEvent.create({
    type, severity, actorKind, actorId, actorName, actorPhone, details, orderId: orderId || null,
  });
}

async function resolveActorIdentity(actorKind, actorId) {
  try {
    const Model = actorKind === 'worker' ? Worker : User;
    const doc = await Model.findById(actorId).select('name phone').lean();
    return { actorName: doc?.name || null, actorPhone: doc?.phone || null };
  } catch {
    return { actorName: null, actorPhone: null };
  }
}

/* 1. Velocity abuse — >5 orders in last 60 min */
async function detectVelocityAbuse(userId) {
  try {
    if (!userId) return null;
    const since = new Date(Date.now() - 60 * MIN);
    const count = await Order.countDocuments({ userId, createdAt: { $gte: since } });
    if (count <= 5) return null;

    const id = await resolveActorIdentity('user', userId);
    return createOrDedupe({
      type: 'velocity_abuse',
      severity: 'high',
      actorKind: 'user',
      actorId: userId,
      ...id,
      details: { ordersInLast60Min: count, threshold: 5 },
    });
  } catch (err) {
    logger.error({ err: err.message, userId }, '[FRAUD] detectVelocityAbuse failed');
    return null;
  }
}

/* 2. Refund abuse — >3 refunds in 30d AND refund rate >40% */
async function detectRefundAbuse(userId) {
  try {
    if (!userId) return null;
    const since = new Date(Date.now() - 30 * DAY);
    const [refundCount, totalOrders] = await Promise.all([
      Order.countDocuments({ userId, 'payment.status': 'refunded', updatedAt: { $gte: since } }),
      Order.countDocuments({ userId, createdAt: { $gte: since } }),
    ]);
    if (refundCount <= 3) return null;
    const refundRate = totalOrders > 0 ? refundCount / totalOrders : 0;
    if (refundRate <= 0.4) return null;

    const id = await resolveActorIdentity('user', userId);
    return createOrDedupe({
      type: 'refund_abuse',
      severity: 'high',
      actorKind: 'user',
      actorId: userId,
      ...id,
      details: {
        refundsLast30d: refundCount,
        ordersLast30d: totalOrders,
        refundRatePct: Math.round(refundRate * 100),
      },
    }, DAY);
  } catch (err) {
    logger.error({ err: err.message, userId }, '[FRAUD] detectRefundAbuse failed');
    return null;
  }
}

/* 3. Duplicate accounts — same phone (>1 user) or shared deviceId */
async function detectDuplicateAccounts(phone, deviceId) {
  try {
    const flagged = [];

    if (phone) {
      const samePhone = await User.find({ phone }).select('_id name phone').lean();
      if (samePhone.length > 1) {
        for (const u of samePhone) {
          const ev = await createOrDedupe({
            type: 'duplicate_account',
            severity: 'critical',
            actorKind: 'user',
            actorId: u._id,
            actorName: u.name,
            actorPhone: u.phone,
            details: { reason: 'shared_phone', phone, accountCount: samePhone.length, accountIds: samePhone.map((x) => String(x._id)) },
          }, DAY);
          flagged.push(ev);
        }
      }
    }

    if (deviceId) {
      // deviceId appears on multiple worker accounts (hardware fingerprints).
      const sharedWorkers = await Worker.find({ deviceIds: deviceId }).select('_id name phone').lean();
      if (sharedWorkers.length > 1) {
        for (const w of sharedWorkers) {
          const ev = await createOrDedupe({
            type: 'duplicate_account',
            severity: 'critical',
            actorKind: 'worker',
            actorId: w._id,
            actorName: w.name,
            actorPhone: w.phone,
            details: { reason: 'shared_device', deviceId, accountCount: sharedWorkers.length, accountIds: sharedWorkers.map((x) => String(x._id)) },
          }, DAY);
          flagged.push(ev);
        }
      }
    }

    return flagged;
  } catch (err) {
    logger.error({ err: err.message, phone, deviceId }, '[FRAUD] detectDuplicateAccounts failed');
    return [];
  }
}

/* 4. Rating manipulation — same user-worker pair 5 >3 times in 7d */
async function detectRatingManipulation(orderId, rating) {
  try {
    if (Number(rating) !== 5 || !orderId) return null;
    const order = await Order.findById(orderId).select('userId workerId').lean();
    if (!order || !order.userId || !order.workerId) return null;

    const since = new Date(Date.now() - 7 * DAY);
    const pairFiveStars = await Order.countDocuments({
      userId: order.userId,
      workerId: order.workerId,
      userRating: 5,
      ratingSubmittedAt: { $gte: since },
    });
    if (pairFiveStars <= 3) return null;

    const id = await resolveActorIdentity('user', order.userId);
    return createOrDedupe({
      type: 'rating_manipulation',
      severity: 'high',
      actorKind: 'user',
      actorId: order.userId,
      ...id,
      orderId,
      details: { workerId: String(order.workerId), fiveStarPairCount7d: pairFiveStars, threshold: 3 },
    }, DAY);
  } catch (err) {
    logger.error({ err: err.message, orderId }, '[FRAUD] detectRatingManipulation failed');
    return null;
  }
}

/* 5. GPS spoof — called by socket spoof detection */
async function logGpsSpoofEvent(workerId, details = {}) {
  try {
    if (!workerId) return null;
    const id = await resolveActorIdentity('worker', workerId);
    return createOrDedupe({
      type: 'gps_spoof',
      severity: 'medium',
      actorKind: 'worker',
      actorId: workerId,
      ...id,
      details: {
        speedMps: details.speedMps != null ? Math.round(details.speedMps) : null,
        distMetres: details.distMetres != null ? Math.round(details.distMetres) : null,
      },
    }, 10 * MIN);
  } catch (err) {
    logger.error({ err: err.message, workerId }, '[FRAUD] logGpsSpoofEvent failed');
    return null;
  }
}

/* 6. Summary — counts by type/severity/status for last 30 days */
async function getFraudSummary() {
  const since = new Date(Date.now() - 30 * DAY);
  const weekAgo = new Date(Date.now() - 7 * DAY);

  const [byType, bySeverity, byStatus, openCount, criticalOpen, thisWeek, blockedActors] = await Promise.all([
    FraudEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    FraudEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    FraudEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    FraudEvent.countDocuments({ status: 'open', createdAt: { $gte: since } }),
    FraudEvent.countDocuments({ status: 'open', severity: 'critical', createdAt: { $gte: since } }),
    FraudEvent.countDocuments({ createdAt: { $gte: weekAgo } }),
    FraudEvent.distinct('actorId', { status: 'blocked', createdAt: { $gte: since } }),
  ]);

  const toMap = (rows) => rows.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});

  return {
    windowDays: 30,
    byType: toMap(byType),
    bySeverity: toMap(bySeverity),
    byStatus: toMap(byStatus),
    openCount,
    criticalOpen,
    thisWeek,
    blockedActors: blockedActors.length,
  };
}

/* 7. Paginated list with filters */
async function listEvents({ status, severity, type, page = 1, limit = 50 } = {}) {
  const q = {};
  if (status) q.status = status;
  if (severity) q.severity = severity;
  if (type) q.type = type;

  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));

  const [events, total] = await Promise.all([
    FraudEvent.find(q)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean(),
    FraudEvent.countDocuments(q),
  ]);

  return { events, total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) };
}

async function listEventsForActor(actorKind, actorId) {
  const events = await FraudEvent.find({ actorKind, actorId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return { events, total: events.length };
}

/* 8. Resolve an event */
async function resolveEvent(id, { status, adminNote, adminId }) {
  const event = await FraudEvent.findById(id);
  if (!event) {
    throw Object.assign(new Error('Fraud event not found'), { status: 404 });
  }

  event.status = status;
  if (adminNote != null) event.adminNote = adminNote;
  event.resolvedBy = adminId ? String(adminId) : event.resolvedBy;
  event.resolvedAt = new Date();
  await event.save();

  // If blocking, also block the underlying actor.
  let actorBlocked = false;
  if (status === 'blocked') {
    const Model = event.actorKind === 'worker' ? Worker : User;
    const updated = await Model.findByIdAndUpdate(event.actorId, { $set: { isBlocked: true } }, { new: true });
    actorBlocked = !!updated;
  }

  return { event: event.toObject(), actorBlocked };
}

module.exports = {
  detectVelocityAbuse,
  detectRefundAbuse,
  detectDuplicateAccounts,
  detectRatingManipulation,
  logGpsSpoofEvent,
  getFraudSummary,
  listEvents,
  listEventsForActor,
  resolveEvent,
};
