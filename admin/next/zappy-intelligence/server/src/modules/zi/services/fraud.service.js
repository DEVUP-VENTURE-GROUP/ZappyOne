'use strict';

/**
 * ZI Fraud Detection Service.
 * Signal-based composite risk scoring — no external ML library.
 * Covers velocity, location, device, behaviour, and OTP signals.
 */

const ZIFraudEvent = require('../models/ZIFraudEvent');
const { redis }    = require('../../../config/redis');
const logger       = require('../../../utils/logger');

function getUser()   { return require('../../user/user.model'); }
function getWorker() { return require('../../worker/worker.model'); }
function getOrder()  { return require('../../order/order.model'); }

// ─── Signal Scorers ───────────────────────────────────────────────────────────

/**
 * Velocity scorer: checks recent event rates using Redis counters.
 * Returns 0-100 (higher = more suspicious).
 */
async function velocityScorer(entityId, entityType) {
  const keyBase  = `fraud:velocity:${entityType}:${entityId}`;
  const orderKey = `${keyBase}:orders:1h`;
  const otpKey   = `${keyBase}:otp:30m`;

  // Atomic INCR + EXPIRY — the counts are incremented by auth/order creation paths;
  // here we just READ the existing counters (defaulting to 0 if absent).
  const [ordersRaw, otpRaw] = await Promise.all([
    redis.get(orderKey),
    redis.get(otpKey),
  ]);

  const ordersIn1h = parseInt(ordersRaw || '0', 10);
  const otpIn30m   = parseInt(otpRaw   || '0', 10);

  // Cross-reference MongoDB for baseline (last 7d average)
  let baseline7dAvgPerHour = 0;
  try {
    const Order  = getOrder();
    const since7 = new Date(Date.now() - 7 * 86400 * 1000);
    const field  = entityType === 'user' ? 'userId' : 'workerId';
    const count  = await Order.countDocuments({ [field]: entityId, createdAt: { $gte: since7 } });
    baseline7dAvgPerHour = count / (7 * 24);
  } catch {
    baseline7dAvgPerHour = 0.5;
  }

  let score = 0;

  // Orders per hour
  if (ordersIn1h >= 10) score = Math.max(score, 95);
  else if (ordersIn1h >= 7) score = Math.max(score, 85);
  else if (ordersIn1h >= 5) score = Math.max(score, 70);
  else if (ordersIn1h > 0 && baseline7dAvgPerHour > 0) {
    const ratio = ordersIn1h / baseline7dAvgPerHour;
    if (ratio > 5) score = Math.max(score, 60);
    else if (ratio > 3) score = Math.max(score, 40);
  }

  // OTP requests per 30 min
  if (otpIn30m >= 8) score = Math.max(score, 90);
  else if (otpIn30m >= 5) score = Math.max(score, 75);
  else if (otpIn30m >= 3) score = Math.max(score, 50);

  return Math.min(100, score);
}

/**
 * Register an event for velocity tracking (call from order/auth code).
 * @param {string} entityId
 * @param {string} entityType  'user'|'worker'
 * @param {string} eventType   'order'|'otp'
 */
async function recordVelocityEvent(entityId, entityType, eventType) {
  const keyBase = `fraud:velocity:${entityType}:${entityId}`;
  if (eventType === 'order') {
    const key = `${keyBase}:orders:1h`;
    await redis.multi().incr(key).expire(key, 3600).exec();
  } else if (eventType === 'otp') {
    const key = `${keyBase}:otp:30m`;
    await redis.multi().incr(key).expire(key, 1800).exec();
  }
}

/**
 * Haversine distance between two lat/lng points (returns km).
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Location scorer: impossible travel + fake location patterns.
 * @param {string}   entityId
 * @param {Object[]} events   [{lat, lng, at}] recent GPS events, newest last
 */
async function locationScorer(entityId, events) {
  if (!events || events.length < 2) return 0;

  let score = 0;

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (!prev.lat || !curr.lat) continue;

    const distKm  = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    const timeDiff = (new Date(curr.at) - new Date(prev.at)) / 3600000; // hours

    if (timeDiff <= 0) {
      score = Math.max(score, 80); // simultaneous events from different locations
      continue;
    }

    const speedKph = distKm / timeDiff;
    // Impossible travel: >800 km/h (faster than commercial flight)
    if (speedKph > 800) {
      score = Math.max(score, 95);
    } else if (speedKph > 400) {
      score = Math.max(score, 70);
    } else if (speedKph > 150) {
      score = Math.max(score, 40);
    }
  }

  // Check for cluster of orders from same tight area (potential fake demand)
  // If all coordinates are within 0.01 degree (≈1km) but entity is supposedly mobile
  const lats = events.map(e => e.lat).filter(Boolean);
  const lngs = events.map(e => e.lng).filter(Boolean);
  if (lats.length >= 3) {
    const latRange = Math.max(...lats) - Math.min(...lats);
    const lngRange = Math.max(...lngs) - Math.min(...lngs);
    // Suspiciously static location over many events
    if (latRange < 0.001 && lngRange < 0.001 && events.length >= 5) {
      score = Math.max(score, 45);
    }
  }

  return Math.min(100, score);
}

/**
 * Device scorer: emulator, rooted, new device, multi-account detection.
 * @param {Object} deviceInfo { deviceId, isEmulator, isRooted, deviceAgeDays, accountsOnDevice }
 */
function deviceScorer(deviceInfo) {
  if (!deviceInfo) return 0;

  let score = 0;

  if (deviceInfo.isEmulator) score += 40;
  if (deviceInfo.isRooted)   score += 30;

  // Brand-new device with immediate activity
  if (typeof deviceInfo.deviceAgeDays === 'number') {
    if (deviceInfo.deviceAgeDays < 1)  score += 20;
    else if (deviceInfo.deviceAgeDays < 7) score += 10;
  }

  // Multiple accounts on same hardware
  if (typeof deviceInfo.accountsOnDevice === 'number') {
    if (deviceInfo.accountsOnDevice >= 5)  score += 30;
    else if (deviceInfo.accountsOnDevice >= 3) score += 20;
    else if (deviceInfo.accountsOnDevice >= 2) score += 10;
  }

  return Math.min(100, score);
}

/**
 * Behaviour scorer: cancellation patterns, fake completions.
 * @param {string} entityId
 * @param {string} entityType 'user'|'worker'
 */
async function behaviorScorer(entityId, entityType) {
  const Order = getOrder();
  const since = new Date(Date.now() - 7 * 86400 * 1000);
  let score   = 0;

  try {
    if (entityType === 'user') {
      const [totalOrders, cancelledOrders] = await Promise.all([
        Order.countDocuments({ userId: entityId, createdAt: { $gte: since } }),
        Order.countDocuments({ userId: entityId, status: 'cancelled', cancelledAt: { $gte: since } }),
      ]);

      if (totalOrders > 0) {
        const cancelRate = cancelledOrders / totalOrders;
        if (cancelRate >= 0.6) score = Math.max(score, 80);
        else if (cancelRate >= 0.4) score = Math.max(score, 55);
        else if (cancelRate >= 0.25) score = Math.max(score, 30);
      }

      // Book-then-cancel pattern: all orders within 5 min of placement
      if (cancelledOrders >= 3) {
        const rapidCancels = await Order.countDocuments({
          userId:       entityId,
          status:       'cancelled',
          cancelledAt:  { $gte: since },
          $expr: {
            $lte: [
              { $subtract: ['$cancelledAt', '$createdAt'] },
              300000, // 5 minutes in ms
            ],
          },
        });
        if (rapidCancels >= 3) score = Math.max(score, 65);
      }
    } else if (entityType === 'worker') {
      // Worker: 0 rating + high job count = potential fake completions
      const Worker = getWorker();
      const worker = await Worker.findById(entityId).select('rating completedJobs totalJobs').lean();
      if (worker) {
        if (worker.rating === 0 && worker.completedJobs > 10) score = Math.max(score, 70);
        if (worker.completedJobs > 0 && worker.totalJobs > 0) {
          const completionRate = worker.completedJobs / worker.totalJobs;
          if (completionRate > 0.99 && worker.completedJobs > 50) {
            // Suspiciously perfect completion rate with high volume
            score = Math.max(score, 35);
          }
        }
      }

      // Worker cancellation pattern
      const [workerTotal, workerCancelled] = await Promise.all([
        Order.countDocuments({ workerId: entityId, createdAt: { $gte: since } }),
        Order.countDocuments({ workerId: entityId, status: 'cancelled', cancelledAt: { $gte: since } }),
      ]);
      if (workerTotal > 0 && workerCancelled / workerTotal > 0.4) {
        score = Math.max(score, 50);
      }
    }
  } catch (err) {
    logger.warn({ err, entityId }, 'behaviorScorer DB query failed');
  }

  return Math.min(100, score);
}

/**
 * OTP scorer: excessive OTP requests from phone or IP.
 * @param {string} phone
 * @param {string} [ip]
 */
async function otpScorer(phone, ip) {
  let score = 0;

  if (phone) {
    const count = parseInt(await redis.get(`fraud:otp:phone:${phone}:day`) || '0', 10);
    if (count >= 15) score = Math.max(score, 95);
    else if (count >= 10) score = Math.max(score, 80);
    else if (count >= 6)  score = Math.max(score, 50);
  }

  if (ip) {
    const count = parseInt(await redis.get(`fraud:otp:ip:${ip}:day`) || '0', 10);
    if (count >= 30) score = Math.max(score, 95);
    else if (count >= 20) score = Math.max(score, 80);
    else if (count >= 10) score = Math.max(score, 50);
  }

  return Math.min(100, score);
}

/**
 * Record an OTP request for rate tracking.
 */
async function recordOtpEvent(phone, ip) {
  const pipeline = redis.multi();
  if (phone) {
    const key = `fraud:otp:phone:${phone}:day`;
    pipeline.incr(key).expire(key, 86400);
  }
  if (ip) {
    const key = `fraud:otp:ip:${ip}:day`;
    pipeline.incr(key).expire(key, 86400);
  }
  await pipeline.exec();
}

// ─── Composite Risk ────────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  velocity: 0.25,
  location: 0.20,
  device:   0.20,
  behavior: 0.25,
  otp:      0.10,
};

function computeCompositeRisk(signals) {
  return Math.min(100, Math.round(
    (signals.velocity || 0) * SIGNAL_WEIGHTS.velocity +
    (signals.location || 0) * SIGNAL_WEIGHTS.location +
    (signals.device   || 0) * SIGNAL_WEIGHTS.device   +
    (signals.behavior || 0) * SIGNAL_WEIGHTS.behavior +
    (signals.otp      || 0) * SIGNAL_WEIGHTS.otp
  ));
}

/**
 * Map composite risk score to action.
 */
function riskToAction(compositeRisk) {
  if (compositeRisk >= 71) return 'hard_block';
  if (compositeRisk >= 51) return 'soft_block';
  if (compositeRisk >= 31) return 'flag';
  return 'none';
}

/**
 * Map composite risk to severity label.
 */
function riskToSeverity(compositeRisk) {
  if (compositeRisk >= 71) return 'critical';
  if (compositeRisk >= 51) return 'high';
  if (compositeRisk >= 31) return 'medium';
  return 'low';
}

// ─── Core Assessment ──────────────────────────────────────────────────────────

/**
 * Run all scorers, save ZIFraudEvent, take auto-action.
 * @param {string} entityType  'user'|'worker'
 * @param {string} entityId
 * @param {Object} eventData   { deviceInfo, locationEvents, phone, ip, orderId }
 */
async function assessRisk(entityType, entityId, eventData = {}) {
  const {
    deviceInfo,
    locationEvents,
    phone,
    ip,
  } = eventData;

  // Run all scorers concurrently
  const [velocityScore, locationScore, behaviorScore, otpScore] = await Promise.all([
    velocityScorer(entityId, entityType),
    locationScorer(entityId, locationEvents || []),
    behaviorScorer(entityId, entityType),
    otpScorer(phone, ip),
  ]);

  const deviceScore = deviceScorer(deviceInfo);

  const signals = {
    velocityScore,
    locationScore,
    deviceScore,
    behaviorScore,
    otpScore,
  };

  const compositeRisk = computeCompositeRisk({
    velocity: velocityScore,
    location: locationScore,
    device:   deviceScore,
    behavior: behaviorScore,
    otp:      otpScore,
  });

  const action       = riskToAction(compositeRisk);
  const triggeredRules = [];
  if (velocityScore >= 70) triggeredRules.push('high_velocity');
  if (locationScore >= 70) triggeredRules.push('impossible_travel');
  if (deviceScore   >= 50) triggeredRules.push('suspicious_device');
  if (behaviorScore >= 55) triggeredRules.push('cancellation_abuse');
  if (otpScore      >= 50) triggeredRules.push('otp_flooding');

  // Persist fraud event (only if score > 0)
  let fraudEvent = null;
  if (compositeRisk > 0) {
    fraudEvent = await ZIFraudEvent.create({
      entityType,
      entityId: String(entityId),
      phone:    phone || null,
      signals,
      compositeRisk,
      triggeredRules,
      action,
      status: action === 'none' ? 'resolved' : 'pending',
    });
  }

  // Take auto-action
  if (action === 'hard_block' || action === 'soft_block') {
    await blockEntity(entityType, entityId, `Auto-block: composite risk ${compositeRisk}%`);
  }

  logger.info({ entityType, entityId, compositeRisk, action }, 'Fraud assessment complete');

  return {
    compositeRisk,
    signals,
    action,
    triggeredRules,
    severity:    riskToSeverity(compositeRisk),
    fraudEventId: fraudEvent ? fraudEvent._id : null,
  };
}

// ─── Queue & Review ───────────────────────────────────────────────────────────

/**
 * Get pending fraud review queue.
 * @param {Object} filters { status, riskLevel, limit }
 */
async function getFraudQueue(filters = {}) {
  const query = {};
  if (filters.status) {
    query.status = filters.status;
  } else {
    query.status = 'pending';
  }

  if (filters.riskLevel) {
    const thresholds = { low: [0, 30], medium: [31, 50], high: [51, 70], critical: [71, 100] };
    const range = thresholds[filters.riskLevel];
    if (range) query.compositeRisk = { $gte: range[0], $lte: range[1] };
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);

  const events = await ZIFraudEvent.find(query)
    .sort({ compositeRisk: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return events;
}

/**
 * Mark a fraud event as reviewed.
 * @param {string} id         ZIFraudEvent _id
 * @param {string} action     'dismiss'|'confirm_block'|'escalate'
 * @param {string} notes
 * @param {string} reviewerId ZIUser _id
 */
async function reviewFraudEvent(id, action, notes, reviewerId) {
  const validActions = ['dismiss', 'confirm_block', 'escalate'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid review action: ${action}. Must be one of ${validActions.join(', ')}`);
  }

  const statusMap = {
    dismiss:       'resolved',
    confirm_block: 'resolved',
    escalate:      'pending',
  };

  const event = await ZIFraudEvent.findByIdAndUpdate(
    id,
    {
      $set: {
        status:      statusMap[action],
        reviewedBy:  reviewerId,
        reviewNotes: notes || '',
        resolvedAt:  action !== 'escalate' ? new Date() : null,
        action:      action === 'confirm_block' ? 'hard_block' : action === 'dismiss' ? 'none' : undefined,
      },
    },
    { new: true }
  );

  if (!event) throw new Error('Fraud event not found');

  // If confirming block, ensure entity is actually blocked
  if (action === 'confirm_block') {
    await blockEntity(event.entityType, event.entityId, `Confirmed block by reviewer: ${notes || ''}`);
  }

  return event;
}

/**
 * Get fraud statistics.
 */
async function getFraudStats() {
  const [
    totalEvents,
    pendingReview,
    autoBlocked,
    byEntityType,
    byAction,
    highRisk,
  ] = await Promise.all([
    ZIFraudEvent.countDocuments(),
    ZIFraudEvent.countDocuments({ status: 'pending' }),
    ZIFraudEvent.countDocuments({ action: { $in: ['hard_block', 'soft_block'] } }),
    ZIFraudEvent.aggregate([{ $group: { _id: '$entityType', count: { $sum: 1 } } }]),
    ZIFraudEvent.aggregate([{ $group: { _id: '$action', count: { $sum: 1 } } }]),
    ZIFraudEvent.countDocuments({ compositeRisk: { $gte: 71 } }),
  ]);

  // Saved revenue estimate: assume avg order = ₹400, blocked fraudsters would have cost ~₹400 × 5 orders
  const savedRevenuePaise = autoBlocked * 5 * 40000;

  return {
    totalEvents,
    pendingReview,
    autoBlocked,
    highRiskEvents:     highRisk,
    byEntityType:       Object.fromEntries(byEntityType.map(r => [r._id, r.count])),
    byAction:           Object.fromEntries(byAction.map(r => [r._id, r.count])),
    savedRevenueRupees: Math.round(savedRevenuePaise / 100),
    savedRevenuePaise,
  };
}

/**
 * Block a user or worker in the main DB.
 * @param {string} entityType 'user'|'worker'
 * @param {string} entityId
 * @param {string} reason
 */
async function blockEntity(entityType, entityId, reason) {
  try {
    if (entityType === 'user') {
      const User = getUser();
      await User.findByIdAndUpdate(entityId, { $set: { isBlocked: true } });
    } else if (entityType === 'worker') {
      const Worker = getWorker();
      await Worker.findByIdAndUpdate(entityId, { $set: { isBlocked: true } });
    }

    // Cache the block status in Redis for fast lookups (24h TTL)
    await redis.set(`block:${entityType}:${entityId}`, '1', 'EX', 86400).catch(() => {});

    logger.info({ entityType, entityId, reason }, 'Entity blocked by fraud service');
    return { success: true, entityType, entityId, reason };
  } catch (err) {
    logger.error({ err, entityType, entityId }, 'blockEntity failed');
    throw err;
  }
}

module.exports = {
  assessRisk,
  getFraudQueue,
  reviewFraudEvent,
  getFraudStats,
  blockEntity,
  // Internal helpers exposed for middleware integration
  recordVelocityEvent,
  recordOtpEvent,
  computeCompositeRisk,
  velocityScorer,
  locationScorer,
  deviceScorer,
  behaviorScorer,
  otpScorer,
};
