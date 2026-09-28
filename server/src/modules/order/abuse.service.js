/**
 * Abuse detection — Redis-backed (fast path) + Mongo (lifetime record).
 *
 * Signals:
 *  1. Booking rate cap per user (5 per 10 min)
 *  2. IP-level booking rate cap (10 per 10 min)
 *  3. ALL cancels tracked (not just after-assignment):
 *       - Pre-assignment cancels: 10/day before freeze
 *       - Post-assignment cancels: 3 strikes → escalating freeze
 *  4. Escalating freeze durations (1h → 4h → 24h → 7 days)
 *  5. Lifetime counters persisted to Mongo (survive Redis TTL)
 *  6. Worker reject-rate monitoring (sliding window)
 */

const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const BOOKING_WINDOW_SEC = 600; // 10 min
const BOOKING_MAX = 5;

// Pre-assignment cancel tracking — catches bots that spam create+cancel during searching
const PRE_ASSIGN_CANCEL_WINDOW_SEC = 60 * 60 * 24; // 24 h
const PRE_ASSIGN_CANCEL_MAX = 10; // 10 pre-assignment cancels per day before freeze

const CANCEL_WINDOW_SEC = 60 * 60 * 24; // 24 h
const CANCEL_STRIKE_LIMIT = 3; // 3 post-assignment cancels → freeze

// Escalating freeze: index = freezeCount (0-based), duration in seconds
// 1st freeze: 1h, 2nd: 4h, 3rd: 24h, 4th+: 7 days
const ESCALATING_FREEZE_SEC = [
  1 * 60 * 60,       // 1 hour
  4 * 60 * 60,       // 4 hours
  24 * 60 * 60,      // 24 hours
  7 * 24 * 60 * 60,  // 7 days
];

const REJECT_WINDOW_SIZE = 20; // last N offers
const REJECT_THRESHOLD = 0.7; // 70%

const IP_BOOKING_WINDOW_SEC = 600; // 10 min
const IP_BOOKING_MAX = 10; // max bookings from same IP per window

// ---- 0. IP-level rate cap (cross-account fraud detection) ----
async function assertIpCanBook(ip) {
  if (!ip) return; // no IP available — skip (e.g. internal calls)
  // Sanitise: strip IPv6 prefix so ::ffff:1.2.3.4 == 1.2.3.4
  const cleanIp = ip.replace(/^::ffff:/, '');
  const key = `book:ip:${cleanIp}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, IP_BOOKING_WINDOW_SEC);
  if (count > IP_BOOKING_MAX) {
    logger.warn({ ip: cleanIp, count }, 'IP-level booking rate cap hit');
    throw Object.assign(new Error('Too many booking attempts from this network. Try again later.'), {
      status: 429, code: 'IP_BOOKING_RATE_CAP',
    });
  }
}

// ---- 1. Booking rate cap ----
async function assertCanBook(userId) {
  // Check freeze (from rapid cancels — escalating duration)
  const [frozen, frozenTtl] = await Promise.all([
    redis.get(`user:frozen:${userId}`),
    redis.ttl(`user:frozen:${userId}`),
  ]);
  if (frozen) {
    const hours = frozenTtl > 3600
      ? `${Math.ceil(frozenTtl / 3600)} hour(s)`
      : `${Math.ceil(frozenTtl / 60)} minute(s)`;
    throw Object.assign(
      new Error(`Bookings are paused due to repeated cancellations. Try again in ${hours}.`),
      { status: 429, code: 'USER_BOOKING_FROZEN', retryAfterSec: frozenTtl }
    );
  }

  const key = `book:rate:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, BOOKING_WINDOW_SEC);
  if (count > BOOKING_MAX) {
    throw Object.assign(new Error(`Too many bookings — max ${BOOKING_MAX} per 10 minutes`), {
      status: 429, code: 'BOOKING_RATE_CAP',
    });
  }
}

// Revert the counter if an order ends up not being created for validation reasons.
async function releaseBookingSlot(userId) {
  await redis.decr(`book:rate:${userId}`);
}

// ---- 2a. Pre-assignment cancel tracking (catches bots, test 41) ----
// Every cancel while order is in 'searching' or 'created' increments this.
// No fee, but 10 in 24h triggers a freeze.
async function recordPreAssignmentCancel(userId) {
  const key = `cancel:pre:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, PRE_ASSIGN_CANCEL_WINDOW_SEC);

  // Persist to Mongo (non-blocking)
  const User = require('../user/user.model');
  User.updateOne({ _id: userId }, { $inc: { 'abuse.totalCancels': 1 } }).catch(() => {});

  if (count >= PRE_ASSIGN_CANCEL_MAX) {
    await applyEscalatingFreeze(userId, 'bot_cancel_pattern');
  }
  return count;
}

// ---- 2b. Post-assignment cancel strikes (test 42) ----
// Called when user cancels after worker was assigned.
// 3 strikes → escalating freeze. Freeze duration doubles each time.
async function recordCancelAfterAssignment(userId) {
  const strikeKey = `cancel:strikes:${userId}`;
  const count = await redis.incr(strikeKey);
  if (count === 1) await redis.expire(strikeKey, CANCEL_WINDOW_SEC);

  // Persist BOTH counters to Mongo
  const User = require('../user/user.model');
  User.updateOne(
    { _id: userId },
    { $inc: { 'abuse.totalCancels': 1, 'abuse.cancelAfterAssignment': 1 } }
  ).catch(() => {});

  if (count >= CANCEL_STRIKE_LIMIT) {
    await applyEscalatingFreeze(userId, 'rapid_cancels_after_assignment');
    await redis.del(strikeKey); // reset strike counter; freeze duration already escalated
  }
  return count;
}

// Compute the appropriate freeze duration based on how many times this user
// has been frozen before (read from Mongo for persistence across Redis restarts).
async function applyEscalatingFreeze(userId, reason) {
  const User = require('../user/user.model');
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { 'abuse.freezeCount': 1 }, $set: { 'abuse.lastFreezeAt': new Date() } },
    { new: true }
  ).select('abuse.freezeCount').lean();

  const freezeCount = (user?.abuse?.freezeCount ?? 1) - 1; // 0-based index
  const durationSec = ESCALATING_FREEZE_SEC[Math.min(freezeCount, ESCALATING_FREEZE_SEC.length - 1)];

  await redis.setex(`user:frozen:${userId}`, durationSec, reason);
  logger.warn(
    { userId, reason, freezeCount, durationSec, hours: Math.round(durationSec / 3600) },
    `User booking frozen (escalation level ${freezeCount + 1}) — ${Math.round(durationSec / 3600)}h`
  );

  // Notify user
  const notificationService = require('../notification/notification.service');
  const hours = durationSec >= 86400
    ? `${Math.round(durationSec / 86400)} day(s)`
    : `${Math.round(durationSec / 3600)} hour(s)`;
  notificationService.notify({
    recipient: { kind: 'user', id: userId },
    type: 'account_warning',
    title: 'Booking temporarily paused',
    body: `Due to repeated cancellations, bookings are paused for ${hours}. Continued abuse may result in a permanent ban.`,
    deepLink: '/profile',
    data: { reason, durationSec: String(durationSec) },
  }).catch(() => {});

  return durationSec;
}

// ---- 3. Worker reject rate (sliding window via Redis + Mongo persistence) ----
async function recordWorkerOutcome(workerId, outcome /* 'accept' | 'reject' | 'timeout' */) {
  const key = `worker:offers:${workerId}`;
  await redis.multi().lpush(key, outcome).ltrim(key, 0, REJECT_WINDOW_SIZE - 1).exec();

  // Persist lifetime counters to Mongo (non-blocking)
  const Worker = require('../worker/worker.model');
  const inc = { 'penalties.totalOffers': 1 };
  if (outcome === 'reject' || outcome === 'timeout') inc['penalties.totalRejects'] = 1;
  Worker.updateOne({ _id: workerId }, { $inc: inc }).catch(() => {});

  // Check reject rate after any rejection/timeout
  if (outcome === 'reject' || outcome === 'timeout') {
    const items = await redis.lrange(key, 0, -1);
    const notificationService = require('../notification/notification.service');

    if (items.length >= REJECT_WINDOW_SIZE) {
      const rejects = items.filter((i) => i === 'reject' || i === 'timeout').length;
      const rate = rejects / items.length;

      if (rate >= REJECT_THRESHOLD) {
        const geoService = require('../worker/geo.service');
        await Worker.updateOne(
          { _id: workerId, isAvailable: true },
          { $set: { isAvailable: false } }
        );
        await geoService.setAvailability(workerId, false);
        logger.warn({ workerId, rate }, 'Worker auto-marked unavailable: high reject rate');
        await redis.del(key);

        // Tell the worker WHY they were taken offline
        notificationService.notify({
          recipient: { kind: 'worker', id: workerId },
          type: 'account_warning',
          title: 'You have been taken offline',
          body: `You missed or rejected ${Math.round(rate * 100)}% of recent job offers. You have been marked offline. Go online again when ready to accept jobs.`,
          deepLink: '/worker',
          data: { reason: 'high_reject_rate', rejectRate: String(Math.round(rate * 100)) },
        }).catch(() => {});

        return { autoUnavailable: true };
      }

      // Early warning at 50% reject rate — before the hard block
      const WARN_THRESHOLD = 0.5;
      if (rate >= WARN_THRESHOLD && items.length >= 10) {
        const warnKey = `worker:reject:warned:${workerId}`;
        const alreadyWarned = await redis.get(warnKey);
        if (!alreadyWarned) {
          await redis.setex(warnKey, 300, '1'); // warn at most once per 5 minutes
          notificationService.notify({
            recipient: { kind: 'worker', id: workerId },
            type: 'account_warning',
            title: 'Missing too many job offers',
            body: `You are missing ${Math.round(rate * 100)}% of offers. If this continues you will be taken offline and your dispatch priority reduced.`,
            deepLink: '/worker',
            data: { reason: 'high_reject_rate_warning', rejectRate: String(Math.round(rate * 100)) },
          }).catch(() => {});
        }
      }
    }

    // 3+ consecutive ignores in a row — nudge dispatch deprioritisation
    const last3 = items.slice(0, 3);
    if (last3.length === 3 && last3.every((i) => i === 'timeout' || i === 'reject')) {
      const streakKey = `worker:streak:nudge:${workerId}`;
      const nudged = await redis.get(streakKey);
      if (!nudged) {
        await redis.setex(streakKey, 600, '1');
        notificationService.notify({
          recipient: { kind: 'worker', id: workerId },
          type: 'account_warning',
          title: 'Your dispatch priority has been reduced',
          body: 'You have missed 3 consecutive job offers. Accept or clearly reject offers to maintain your ranking.',
          deepLink: '/worker',
          data: { reason: 'dispatch_deprioritised' },
        }).catch(() => {});
      }
    }
  }
  return {};
}

module.exports = {
  assertIpCanBook,
  assertCanBook,
  releaseBookingSlot,
  recordPreAssignmentCancel,
  recordCancelAfterAssignment,
  recordWorkerOutcome,
};
