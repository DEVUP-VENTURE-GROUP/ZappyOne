/**
 * Worker SOS — Emergency Safety System
 * ---------------------------------------------------------------------------
 * Workers are alone in strangers' homes. One 3-second hold sends:
 *   1. GPS location + order details to their emergency contact via SMS
 *   2. Alert to platform operations (admin socket room)
 *   3. Notification to customer: "Worker has raised a safety flag" + 112 CTA
 *   4. Redis incident record with acknowledgment tracking (24h TTL)
 *   5. Auto-support ticket marked URGENT
 *   6. Re-escalation if admin doesn't acknowledge within 5 minutes (#90)
 * ---------------------------------------------------------------------------
 */

const Worker  = require('./worker.model');
const Order   = require('../order/order.model');
const { redis } = require('../../config/redis');
const logger  = require('../../utils/logger');

// ── SOS acknowledgment keys ───────────────────────────────────────────────
const ACK_KEY = (incidentKey) => `sos:ack:${incidentKey}`;
const ESCALATION_DELAY_MS = 5 * 60 * 1000; // 5 min before re-alert

async function triggerSOS({ workerId, lat, lng, orderId, message, type = 'worker_sos' }) {
  const [worker, order] = await Promise.all([
    Worker.findById(workerId).select('name phone emergencyContact currentLocation').lean(),
    orderId ? Order.findById(orderId).select('userId service pickupLocation').lean() : null,
  ]);

  if (!worker) throw Object.assign(new Error('Worker not found'), { status: 404 });

  const now      = Date.now();
  const incident = {
    workerId:    String(workerId),
    workerName:  worker.name,
    workerPhone: worker.phone,
    lat, lng,
    orderId:     orderId ? String(orderId) : null,
    service:     order?.service || null,
    address:     order?.pickupLocation?.address || null,
    message:     message || 'SOS triggered — worker needs assistance',
    type,        // 'worker_sos' | 'pet_emergency' (extensible)
    triggeredAt: new Date(now).toISOString(),
    acknowledged: false,
    acknowledgedBy: null,
  };

  /* 1. Store incident with acknowledgment status (24h TTL) */
  const incidentKey = `sos:${workerId}:${now}`;
  await redis.setex(incidentKey, 86400, JSON.stringify(incident));
  await redis.lpush('sos:active', incidentKey);
  await redis.expire('sos:active', 86400);

  /* 2. SMS emergency contact */
  const ec = worker.emergencyContact;
  if (ec?.phone) {
    const msg = [
      `URGENT: ${worker.name} (Zappy worker) has triggered an emergency.`,
      lat && lng ? `Location: https://maps.google.com/?q=${lat},${lng}` : '',
      order ? `Address: ${incident.address || 'customer location'}` : '',
      `Call them NOW: ${worker.phone}`,
      'If unreachable, call 112.',
    ].filter(Boolean).join(' ');

    const { notificationsQueue } = require('../../jobs');
    notificationsQueue.add('sms', {
      recipient:     { kind: 'worker', id: workerId },
      overridePhone: ec.phone,
      body:          msg,
    }).catch(() => {});
  }

  /* 3. Broadcast to admin ops room */
  await redis.publish('notification:admin:ops', JSON.stringify({
    type:  'worker_sos',
    title: `🆘 SOS: ${worker.name}`,
    body:  `${incident.address || 'Unknown address'} · ${lat?.toFixed(4)},${lng?.toFixed(4)}`,
    data:  { ...incident, incidentKey },
    urgent: true,
  }));

  /* 4. Notify customer with 112 CTA */
  if (order) {
    const notifService = require('../notification/notification.service');
    notifService.notify({
      recipient: { kind: 'user', id: order.userId },
      type:  'worker_wellness',
      title: '🆘 Safety alert — your worker needs help',
      body:  'Your service provider has flagged an emergency. If you can, call 112 and help. Support has been notified.',
      deepLink: `/orders/${orderId}`,
      data: { callEmergency: true, workerPhone: worker.phone },
    }).catch(() => {});
  }

  /* 5. Auto-create URGENT support ticket (#90) */
  try {
    const SupportTicket = require('../support/support-ticket.model');
    await SupportTicket.create({
      orderId:  order ? order._id : undefined,
      workerId: worker._id,
      userId:   order?.userId,
      subject:  `🆘 URGENT SOS — ${worker.name}`,
      body: [
        `Worker ${worker.name} (${worker.phone}) triggered SOS at ${new Date(now).toISOString()}.`,
        lat && lng ? `Location: https://maps.google.com/?q=${lat},${lng}` : '',
        order ? `Order: ${orderId} · Service: ${order.service} · ${incident.address}` : 'No active order.',
        `Incident key: ${incidentKey}`,
      ].filter(Boolean).join('\n'),
      source:   'sos',
      priority: 'urgent',
      status:   'open',
    });
  } catch (err) {
    logger.error({ err: err.message }, '[SOS] Failed to create support ticket');
  }

  /* 6. Schedule re-escalation if admin doesn't acknowledge in 5 min (#90) */
  setTimeout(async () => {
    try {
      const raw = await redis.get(incidentKey);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (!stored.acknowledged) {
        logger.error({ incidentKey, workerName: worker.name }, '[SOS] UNACKNOWLEDGED — RE-ESCALATING');
        await redis.publish('notification:admin:ops', JSON.stringify({
          type:  'worker_sos_unacknowledged',
          title: `🆘🔁 UNACKNOWLEDGED SOS: ${worker.name}`,
          body:  'No admin acknowledged this SOS in 5 minutes. Immediate action required.',
          data:  { ...stored, incidentKey },
          urgent: true,
        }));
      }
    } catch { /* non-fatal */ }
  }, ESCALATION_DELAY_MS);

  logger.warn({ workerId, lat, lng, orderId, type }, '[SOS] WORKER SOS TRIGGERED');
  return { ok: true, incidentKey, incident };
}

/**
 * A CUSTOMER in trouble during a job.
 *
 * Reported from production: the customer's SOS button posted to
 * `/api/orders/:id/sos`, which did not exist. The fetch was wrapped in
 * `.catch(() => {})`, so the 404 vanished, the phone dialled 112 and the screen
 * said "SOS triggered — emergency services notified". Zappy recorded nothing.
 * Someone frightened enough to press it was told help was coming from us, and
 * ops never knew the incident happened.
 *
 * It rides the SAME rails as the worker SOS deliberately — the same redis
 * incident keys, the same ops broadcast, the same urgent ticket, the same
 * 5-minute re-escalation — so it appears in the existing admin SOS queue with
 * no second dashboard to watch. The `type` distinguishes who is in danger,
 * which is the one thing that genuinely differs.
 */
async function triggerCustomerSOS({ userId, orderId, lat, lng, message }) {
  const User = require('../user/user.model');

  const [user, order] = await Promise.all([
    User.findById(userId).select('name phone').lean(),
    orderId ? Order.findById(orderId).select('userId workerId service pickupLocation').lean() : null,
  ]);

  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  // Object-level authorisation: never let one customer raise an alarm on
  // another customer's order, which would put a stranger's address on an
  // incident report.
  if (order && String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('This is not your order'), { status: 403 });
  }

  const worker = order?.workerId
    ? await Worker.findById(order.workerId).select('name phone').lean()
    : null;

  const now = Date.now();
  const incident = {
    type: 'customer_sos',
    userId: String(userId),
    customerName: user.name,
    customerPhone: user.phone,
    // Who is ON SITE with them — the first thing ops needs to know.
    workerId: order?.workerId ? String(order.workerId) : null,
    workerName: worker?.name || null,
    workerPhone: worker?.phone || null,
    lat,
    lng,
    orderId: orderId ? String(orderId) : null,
    service: order?.service || null,
    address: order?.pickupLocation?.address || null,
    message: message || 'SOS triggered — customer needs assistance',
    triggeredAt: new Date(now).toISOString(),
    acknowledged: false,
    acknowledgedBy: null,
  };

  /* 1. Same store, same queue the admin console already reads. */
  const incidentKey = `sos:customer:${userId}:${now}`;
  await redis.setex(incidentKey, 86400, JSON.stringify(incident));
  await redis.lpush('sos:active', incidentKey);
  await redis.expire('sos:active', 86400);

  /* 2. Ops room, marked urgent. */
  await redis.publish('notification:admin:ops', JSON.stringify({
    type: 'customer_sos',
    title: `🆘 CUSTOMER SOS: ${user.name}`,
    body: `${incident.address || 'Unknown address'}${worker ? ` · worker on site: ${worker.name}` : ''}`,
    data: { ...incident, incidentKey },
    urgent: true,
  }));

  /* 3. Urgent ticket, so it survives a dropped socket. */
  try {
    const SupportTicket = require('../support/support-ticket.model');
    await SupportTicket.create({
      orderId: order ? order._id : undefined,
      userId: user._id,
      workerId: order?.workerId || undefined,
      subject: `🆘 URGENT CUSTOMER SOS — ${user.name}`,
      body: [
        `Customer ${user.name} (${user.phone}) triggered SOS at ${new Date(now).toISOString()}.`,
        lat && lng ? `Location: https://maps.google.com/?q=${lat},${lng}` : '',
        order ? `Order: ${orderId} · Service: ${order.service} · ${incident.address}` : 'No active order.',
        worker ? `Worker on site: ${worker.name} (${worker.phone})` : 'No worker assigned.',
        `Incident key: ${incidentKey}`,
      ].filter(Boolean).join('
'),
      source: 'sos',
      priority: 'urgent',
      status: 'open',
    });
  } catch (err) {
    logger.error({ err: err.message }, '[SOS] Failed to create customer support ticket');
  }

  /* 4. Re-escalate if nobody picks it up. */
  setTimeout(async () => {
    try {
      const raw = await redis.get(incidentKey);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (!stored.acknowledged) {
        logger.error({ incidentKey, customerName: user.name }, '[SOS] CUSTOMER SOS UNACKNOWLEDGED — RE-ESCALATING');
        await redis.publish('notification:admin:ops', JSON.stringify({
          type: 'customer_sos_unacknowledged',
          title: `🆘🔁 UNACKNOWLEDGED CUSTOMER SOS: ${user.name}`,
          body: 'No admin acknowledged this SOS in 5 minutes. Immediate action required.',
          data: { ...stored, incidentKey },
          urgent: true,
        }));
      }
    } catch { /* non-fatal */ }
  }, ESCALATION_DELAY_MS);

  logger.warn({ userId, lat, lng, orderId }, '[SOS] CUSTOMER SOS TRIGGERED');
  return { ok: true, incidentKey, incident };
}

async function updateEmergencyContact({ workerId, name, phone }) {
  const cleaned = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
  if (cleaned.length !== 10) {
    throw Object.assign(new Error('Invalid phone number'), { status: 400 });
  }
  await Worker.findByIdAndUpdate(workerId, {
    $set: { emergencyContact: { name, phone: cleaned } },
  });
  return { ok: true };
}

/**
 * Admin acknowledges an SOS — marks it handled, stops re-escalation. (#90)
 */
async function acknowledgeSOS({ incidentKey, adminId }) {
  const raw = await redis.get(incidentKey);
  if (!raw) throw Object.assign(new Error('SOS incident not found or expired'), { status: 404 });
  const incident = JSON.parse(raw);
  incident.acknowledged   = true;
  incident.acknowledgedBy = String(adminId);
  incident.acknowledgedAt = new Date().toISOString();
  await redis.setex(incidentKey, 86400, JSON.stringify(incident));
  logger.info({ incidentKey, adminId }, '[SOS] Incident acknowledged by admin');
  return { ok: true, incident };
}

async function getActiveSOSAlerts() {
  const keys = await redis.lrange('sos:active', 0, 49);
  const incidents = await Promise.all(
    keys.map((k) =>
      redis.get(k)
        .then((v) => v ? { ...JSON.parse(v), incidentKey: k } : null)
        .catch(() => null)
    )
  );
  const active = incidents.filter(Boolean);
  return {
    total: active.length,
    unacknowledged: active.filter((i) => !i.acknowledged).length,
    incidents: active,
  };
}

module.exports = {
  triggerSOS, triggerCustomerSOS, updateEmergencyContact, acknowledgeSOS, getActiveSOSAlerts,
};
