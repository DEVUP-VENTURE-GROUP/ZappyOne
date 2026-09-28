/**
 * Notification Service
 * ----------------------------------------------------------------------------
 * Single entry point for all outbound notifications.
 *
 *   notify({ recipient, type, title, body, data, deepLink })
 *
 * Pipeline:
 *   1. Persist a Notification doc (source of truth for in-app feed)
 *   2. Publish to the order/user socket room (instant in-app banner)
 *   3. Enqueue push (FCM) for users not currently socket-connected
 *   4. Enqueue SMS for high-priority types (worker_assigned, worker_arriving_soon)
 *      — costs money so we gate by type
 *
 * The whole thing is fire-and-forget from callers' POV. A failed push doesn't
 * fail the order completion. Logs capture failures.
 * ----------------------------------------------------------------------------
 */

const Notification = require('./notification.model');
const { redis } = require('../../config/redis');
const { notificationsQueue } = require('../../jobs');
const logger = require('../../core/logger');

// Types that warrant SMS (cost money, only critical ones)
const SMS_TYPES = new Set([
  'worker_assigned',
  'worker_arriving_soon',
  'worker_arrived',
  'order_cancelled',
]);

async function notify({ recipient, type, title, body, data = {}, deepLink, sms = false }) {
  if (!Notification.TYPES.includes(type)) {
    logger.warn({ type }, 'Unknown notification type — proceeding anyway');
  }

  // 1. Persist
  let doc;
  try {
    doc = await Notification.create({
      recipient,
      type,
      title,
      body,
      data,
      deepLink,
      channels: { socket: { sent: false }, push: { sent: false }, sms: { sent: false } },
    });
  } catch (err) {
    logger.error({ err: err.message, type }, 'Notification persist failed');
    return null;
  }

  // 2. Socket fan-out — uses the existing pub/sub bridge so any API node
  //    holding the recipient's socket relays it.
  const payload = {
    _id: String(doc._id),
    type,
    title,
    body,
    data,
    deepLink,
    createdAt: doc.createdAt,
  };
  await redis.publish(
    `notification:${recipient.kind}:${recipient.id}`,
    JSON.stringify(payload)
  );

  // 3. Push notification — skip if recipient is actively connected via socket.
  // Online users already receive the notification via the socket pub/sub above.
  // FCM costs money per send; skipping for live sessions saves ~30-60% of pushes.
  const isOnline = await redis.get(`presence:${recipient.kind}:${recipient.id}`).catch(() => null);
  if (!isOnline) {
    notificationsQueue.add('push', {
      notificationId: String(doc._id),
      recipient,
      title,
      body,
      data: { ...data, deepLink, type },
    }).catch((err) => logger.error({ err: err.message }, 'Push enqueue failed'));
  }

  // 4. SMS — only for high-stakes events
  if (sms || SMS_TYPES.has(type)) {
    notificationsQueue.add('sms', {
      notificationId: String(doc._id),
      recipient,
      body: body || title,
    }).catch((err) => logger.error({ err: err.message }, 'SMS enqueue failed'));
  }

  return doc;
}

/**
 * Batch version — useful for promotional broadcasts. Persists in bulk and
 * fans out via pub/sub (no SMS/push by default to avoid runaway cost).
 */
async function notifyMany(recipients, { type, title, body, data, deepLink }) {
  const docs = recipients.map((r) => ({
    recipient: r, type, title, body, data, deepLink,
  }));
  const inserted = await Notification.insertMany(docs);
  // Fire pub/sub events in parallel (best-effort)
  await Promise.all(
    inserted.map((doc) =>
      redis.publish(
        `notification:${doc.recipient.kind}:${doc.recipient.id}`,
        JSON.stringify({
          _id: String(doc._id), type, title, body, data, deepLink, createdAt: doc.createdAt,
        })
      )
    )
  );
  return inserted.length;
}

async function listFor({ kind, id, page = 1, limit = 20, unreadOnly = false }) {
  const filter = { 'recipient.kind': kind, 'recipient.id': id };
  if (unreadOnly) filter.readAt = { $exists: false };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments({ 'recipient.kind': kind, 'recipient.id': id, readAt: { $exists: false } }),
  ]);
  return { items, unread };
}

async function markRead({ kind, id, notificationId }) {
  return Notification.updateOne(
    { _id: notificationId, 'recipient.kind': kind, 'recipient.id': id, readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
}

async function markAllRead({ kind, id }) {
  return Notification.updateMany(
    { 'recipient.kind': kind, 'recipient.id': id, readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
}

module.exports = { notify, notifyMany, listFor, markRead, markAllRead };
