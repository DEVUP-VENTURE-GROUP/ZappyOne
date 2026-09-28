/**
 * Calling Service — masked number proxy.
 *
 * Pool-based assignment: we maintain a small pool of rented proxy numbers
 * (Twilio/Exotel/Knowlarity). Each active call-session reserves one number
 * for ~2 hours past order completion, then it goes back in the pool.
 *
 * In production the provider config lives in env:
 *   CALL_PROVIDER=twilio|exotel|mock
 *   CALL_POOL_NUMBERS=+911800123456,+911800123457,...
 *
 * For dev / initial rollout we default to a mock that returns a fake number —
 * the API contract is identical so the frontend need not change.
 */

const CallSession = require('./call-session.model');
const Order = require('../order/order.model');
const logger = require('../../core/logger');

const POOL = (process.env.CALL_POOL_NUMBERS || '+911800123001,+911800123002,+911800123003,+911800123004')
  .split(',').map((s) => s.trim()).filter(Boolean);

async function getProxyNumber() {
  // Find a proxy number that isn't currently locked to an active session.
  const activeNumbers = await CallSession.distinct('proxyNumber', { active: true });
  const available = POOL.filter((n) => !activeNumbers.includes(n));
  if (available.length === 0) {
    throw Object.assign(new Error('No call numbers available, try again shortly'), {
      status: 503, code: 'CALL_POOL_EXHAUSTED',
    });
  }
  // Rotate — pick least-recently-used. Good enough with Math.random for small pools.
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Start a call session. Returns { proxyNumber, sessionId } that the client
 * app dials directly. The telephony provider webhook (not shown here) will
 * match the proxy number + caller CLI and bridge to the real callee number.
 */
async function startCall({ orderId, callerKind, callerId }) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

  // Only active parties can call during the order's lifecycle
  const activeStatuses = ['assigned', 'on_the_way', 'arrived', 'in_progress'];
  if (!activeStatuses.includes(order.status)) {
    throw Object.assign(new Error('Calling is only available during an active order'), {
      status: 409, code: 'CALL_WRONG_STATUS',
    });
  }

  // Identify caller and callee
  let caller, callee;
  if (callerKind === 'user' && String(order.userId) === String(callerId)) {
    caller = { kind: 'user', id: order.userId };
    callee = { kind: 'worker', id: order.workerId };
  } else if (callerKind === 'worker' && String(order.workerId) === String(callerId)) {
    caller = { kind: 'worker', id: order.workerId };
    callee = { kind: 'user', id: order.userId };
  } else {
    throw Object.assign(new Error('Not a party to this order'), { status: 403, code: 'CALL_FORBIDDEN' });
  }

  // Reuse existing active session if one exists (same direction)
  const existing = await CallSession.findOne({
    orderId, 'caller.kind': caller.kind, 'caller.id': caller.id, active: true,
  });
  if (existing) {
    return { sessionId: existing._id, proxyNumber: existing.proxyNumber, reused: true };
  }

  const proxyNumber = await getProxyNumber();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h TTL baseline

  const session = await CallSession.create({
    orderId,
    caller,
    callee,
    proxyNumber,
    provider: process.env.CALL_PROVIDER || 'mock',
    active: true,
    expiresAt,
  });

  logger.info({ orderId, caller: caller.kind, proxyNumber }, 'Call session started');
  return { sessionId: session._id, proxyNumber, reused: false };
}

/**
 * Telephony provider webhook: "call connected / ended".
 * Updates session with provider call ID, duration, recording URL.
 */
async function recordProviderEvent({ sessionId, event, providerCallId, durationSec, recordingUrl }) {
  const session = await CallSession.findById(sessionId);
  if (!session) return null;

  if (event === 'connected') {
    session.providerCallId = providerCallId;
  } else if (event === 'ended') {
    session.active = false;
    session.endedAt = new Date();
    session.durationSec = durationSec;
    if (recordingUrl) session.recordingUrl = recordingUrl;
  }
  await session.save();
  return session;
}

async function endCall({ sessionId }) {
  await CallSession.updateOne({ _id: sessionId, active: true }, {
    $set: { active: false, endedAt: new Date() },
  });
}

module.exports = {
  startCall,
  recordProviderEvent,
  endCall,
};
