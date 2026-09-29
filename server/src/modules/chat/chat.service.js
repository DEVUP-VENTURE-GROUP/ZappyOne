/**
 * Chat Service — per-order messaging.
 *
 * Socket delivery: we publish to `order:event` pub/sub channel with a
 * `chat.message` event type so the existing socket bridge relays it to all
 * parties subscribed to the order room.
 *
 * Permissions: only the customer and the assigned worker can post.
 * Chat is disabled before assignment and after 7 days past completion.
 */

const ChatMessage = require('./chat-message.model');
const Order = require('../order/order.model');
const notificationService = require('../notification/notification.service');
const { redis } = require('../../config/redis');

const CHAT_ENABLED_STATUSES = new Set(['assigned', 'on_the_way', 'arrived', 'in_progress']);
const CHAT_DISABLED_AFTER_COMPLETION_DAYS = 7;

async function canChat(order, participantKind, participantId) {
  if (!order) return false;
  const isParty =
    (participantKind === 'user' && String(order.userId) === String(participantId)) ||
    (participantKind === 'worker' && String(order.workerId || '') === String(participantId));
  if (!isParty) return false;

  if (CHAT_ENABLED_STATUSES.has(order.status)) return true;

  if (order.status === 'completed' && order.completedAt) {
    const daysSince = (Date.now() - new Date(order.completedAt).getTime()) / 86400000;
    return daysSince < CHAT_DISABLED_AFTER_COMPLETION_DAYS;
  }
  return false;
}

async function sendMessage({ orderId, fromKind, fromId, text, cannedCode }) {
  await require('../feature-flags/feature-flag.service').assertEnabled('chat');
  const order = await Order.findById(orderId).lean();
  const allowed = await canChat(order, fromKind, fromId);
  if (!allowed) {
    throw Object.assign(new Error('Chat not available for this order'), {
      status: 403, code: 'CHAT_FORBIDDEN',
    });
  }

  const msg = await ChatMessage.create({
    orderId,
    from: { kind: fromKind, id: fromId },
    text,
    cannedCode,
  });

  // Fan out via the existing order-room pub/sub (sockets bridge relays it)
  const recipient = fromKind === 'user'
    ? { kind: 'worker', id: order.workerId }
    : { kind: 'user', id: order.userId };

  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event: 'chat.message',
    payload: {
      _id: String(msg._id),
      from: { kind: fromKind, id: String(fromId) },
      text,
      cannedCode,
      createdAt: msg.createdAt,
    },
  }));

  // If recipient isn't actively on this screen, a notification wakes them up
  notificationService.notify({
    recipient,
    type: 'chat_message',
    title: fromKind === 'user' ? 'Customer sent a message' : 'Worker sent a message',
    body: text.slice(0, 120),
    deepLink: `/orders/${orderId}`,
    data: { orderId: String(orderId), chatMessageId: String(msg._id) },
  }).catch(() => {});

  return msg;
}

async function listMessages({ orderId, participantKind, participantId, before, limit = 50 }) {
  const order = await Order.findById(orderId).lean();
  const allowed = await canChat(order, participantKind, participantId);
  if (!allowed) {
    throw Object.assign(new Error('Chat not available for this order'), {
      status: 403, code: 'CHAT_FORBIDDEN',
    });
  }

  const filter = { orderId };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const messages = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  // Mark anything from the OTHER party as read
  const otherKind = participantKind === 'user' ? 'worker' : 'user';
  await ChatMessage.updateMany(
    { orderId, 'from.kind': otherKind, readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );

  return messages.reverse(); // return in chronological order
}

/**
 * Unread count for this participant — used for badge on chat icon.
 */
async function unreadCount({ orderId, participantKind, participantId }) {
  const otherKind = participantKind === 'user' ? 'worker' : 'user';
  return ChatMessage.countDocuments({
    orderId,
    'from.kind': otherKind,
    readAt: { $exists: false },
  });
}

module.exports = { sendMessage, listMessages, unreadCount, canChat };
