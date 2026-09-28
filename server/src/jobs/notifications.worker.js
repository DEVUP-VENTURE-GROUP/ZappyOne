/**
 * Notifications Worker
 * ----------------------------------------------------------------------------
 * Handles three BullMQ job types:
 *
 *   worker_offer  — push alert for a new job request
 *   push          — generic push notification to any recipient
 *   sms           — SMS alert for high-stakes events
 *
 * FCM: Firebase Admin SDK (HTTP v1 API) — production-grade, no legacy key needed.
 *   Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 *   If unset, push jobs are logged but not sent (safe for dev).
 *
 * SMS: 2Factor.in (Indian OTP/transactional SMS).
 *   Requires SMS_PROVIDER_KEY env var.
 * ----------------------------------------------------------------------------
 */

require('dotenv').config();
const { Worker: BullWorker } = require('bullmq');
const { createBullConnection } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const WorkerModel = require('../modules/worker/worker.model');
const UserModel = require('../modules/user/user.model');
const Notification = require('../modules/notification/notification.model');
const Order = require('../modules/order/order.model');
const config = require('../config');
const logger = require('../utils/logger');
const { QUEUES } = require('./index');

const SMS_URL = 'https://2factor.in/API/V1';

/* Firebase Admin SDK (lazy-initialised once) */

let _firebaseApp = null;

function getFirebaseApp() {
  if (_firebaseApp) return _firebaseApp;
  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) return null;
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      _firebaseApp = admin.apps[0];
    } else {
      _firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          // env stores \n as literal \n — unescape back to newlines
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    logger.info('[FCM] Firebase Admin SDK initialised');
    return _firebaseApp;
  } catch (err) {
    logger.error({ err: err.message }, '[FCM] Firebase Admin init failed');
    return null;
  }
}

/* FCM */

async function sendFcm({ tokens, title, body, data = {}, imageUrl } = {}) {
  if (!tokens?.length) return { skipped: true, reason: 'no_tokens' };

  const app = getFirebaseApp();
  if (!app) {
    logger.info({ tokens: tokens.length, title }, '[FCM] Firebase not configured — skipping push');
    return { skipped: true, reason: 'firebase_not_configured' };
  }

  const admin = require('firebase-admin');
  const messaging = admin.messaging(app);

  // Stringify all data values — FCM requires string values. `data` carries
  // routing info (type, deepLink, orderId) for the notification click handler.
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const uniqueTokens = [...new Set(tokens)].filter(Boolean);
  const BATCH_SIZE = 500; // FCM max per sendEachForMulticast call
  let successCount = 0;
  let failureCount = 0;
  const staleTokens = [];

  for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
    const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
    try {
      // A `notification` payload makes FCM render the notification itself (reliable,
      // even if the SW is asleep). All web styling lives in webpush.notification.
      // The service worker must NOT also call showNotification() or you get a
      // duplicate — that's why onBackgroundMessage was removed from the SW.
      const message = {
        tokens: batch,
        notification: { title, body: body || '' },
        data: stringData,
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'zappy_alerts' },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        webpush: {
          headers: { Urgency: 'high', TTL: '86400' },
          notification: {
            icon:  '/branding/zappylogo.png',
            badge: '/branding/zappylogo.png',
            vibrate: [200, 100, 200],
            requireInteraction: data.type === 'new_job_request' || data.type === 'sos',
            ...(imageUrl ? { image: imageUrl } : {}),
            actions: [{ action: 'open', title: data.type === 'promotional' ? 'Book Now' : 'Open' }],
          },
          fcmOptions: { link: data.deepLink || '/' },
        },
      };
      if (imageUrl) message.notification.imageUrl = imageUrl;

      const result = await messaging.sendEachForMulticast(message);
      successCount += result.successCount;
      failureCount += result.failureCount;

      // Collect invalid tokens for cleanup
      result.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token') {
            staleTokens.push(batch[idx]);
          }
        }
      });
    } catch (err) {
      logger.error({ err: err.message, batchSize: batch.length }, '[FCM] Batch send error');
      failureCount += batch.length;
    }
  }

  // Prune stale tokens from Mongo — fire-and-forget
  if (staleTokens.length) {
    Promise.all([
      WorkerModel.updateMany(
        { deviceTokens: { $in: staleTokens } },
        { $pull: { deviceTokens: { $in: staleTokens } } }
      ),
      UserModel.updateMany(
        { deviceTokens: { $in: staleTokens } },
        { $pull: { deviceTokens: { $in: staleTokens } } }
      ),
    ]).catch(() => {});
    logger.info({ count: staleTokens.length }, '[FCM] Pruned stale tokens');
  }

  logger.info({ success: successCount, failure: failureCount, title }, '[FCM] Push sent');
  return { ok: successCount > 0, success: successCount, failure: failureCount };
}

/* SMS (2Factor.in) */

async function sendSms({ phone, message }) {
  if (!phone) return { skipped: true, reason: 'no_phone' };

  if (!config.sms.providerKey) {
    logger.info({ phone, message: message?.slice(0, 60) }, '[SMS] No provider key — skipping');
    return { skipped: true, reason: 'no_provider_key' };
  }

  // Normalise phone: strip +91, leading 0, keep 10 digits
  const digits = phone.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '').slice(-10);
  if (digits.length !== 10) {
    logger.warn({ phone }, '[SMS] Invalid phone number');
    return { skipped: true, reason: 'invalid_phone' };
  }

  try {
    const url =
      `${SMS_URL}/${config.sms.providerKey}/ADDON_SERVICES/SEND/TSMS` +
      `?From=${encodeURIComponent(config.sms.from)}` +
      `&To=${digits}` +
      `&Msg=${encodeURIComponent(message)}`;

    const res = await fetch(url);
    const text = await res.text().catch(() => '');
    const ok = res.ok && text.includes('Success');

    if (ok) {
      logger.info({ digits, preview: message.slice(0, 40) }, '[SMS] Sent');
    } else {
      logger.warn({ digits, status: res.status, text: text.slice(0, 100) }, '[SMS] Send failed');
    }
    return { ok };
  } catch (err) {
    logger.error({ err: err.message, phone }, '[SMS] Network error');
    return { ok: false, error: err.message };
  }
}

/* Token lookup helpers */

async function getTokens({ kind, id }) {
  if (kind === 'worker') {
    const w = await WorkerModel.findById(id).select('deviceTokens').lean();
    return w?.deviceTokens || [];
  }
  if (kind === 'user') {
    const u = await UserModel.findById(id).select('deviceTokens phone').lean();
    return { tokens: u?.deviceTokens || [], phone: u?.phone };
  }
  return [];
}

/* Job processor */

async function processJob(job) {
  /* Worker job offer push */
  if (job.name === 'worker_offer') {
    const { workerId, orderId } = job.data;
    const [worker, order] = await Promise.all([
      WorkerModel.findById(workerId).select('deviceTokens').lean(),
      Order.findById(orderId).select('service pricing pickupLocation').lean(),
    ]);
    if (!worker?.deviceTokens?.length) return { skipped: true, reason: 'no_tokens' };
    if (!order) return { skipped: true, reason: 'no_order' };

    return sendFcm({
      tokens: worker.deviceTokens,
      title: '🔔 New Job Offer',
      body: `${order.service.replace(/_/g, ' ')} · ₹${order.pricing.total} · ${order.pickupLocation.address?.slice(0, 60)}`,
      data: { type: 'new_job_request', orderId: String(orderId) },
    });
  }

  /* Generic push notification */
  if (job.name === 'push') {
    const { notificationId, recipient, title, body, data, bulkTokens } = job.data;

    // Admin broadcast: tokens provided directly as bulk array
    if (bulkTokens?.length) {
      const fcmResult = await sendFcm({ tokens: bulkTokens, title, body, data });
      logger.info({ title, recipients: bulkTokens.length, ...fcmResult }, '[Push] Broadcast complete');
      return fcmResult;
    }

    // Standard per-recipient push
    const result = await getTokens({ kind: recipient.kind, id: recipient.id });
    const tokens = Array.isArray(result) ? result : result.tokens;
    if (!tokens?.length) {
      logger.info({ recipient, title }, '[Push] No device tokens — skipping');
      return { skipped: true, reason: 'no_tokens' };
    }

    const fcmResult = await sendFcm({ tokens, title, body, data });

    /* Update notification doc with push delivery status */
    if (notificationId) {
      Notification.findByIdAndUpdate(notificationId, {
        $set: {
          'channels.push.sent': fcmResult.ok === true,
          'channels.push.sentAt': new Date(),
          'channels.push.detail': fcmResult,
        },
      }).catch(() => {});
    }

    return fcmResult;
  }

  /* SMS notification */
  if (job.name === 'sms') {
    const { notificationId, recipient, body: message } = job.data;
    const result = await getTokens({ kind: recipient.kind, id: recipient.id });
    const phone = typeof result === 'object' && !Array.isArray(result)
      ? result.phone
      : null;

    const smsResult = await sendSms({ phone, message });

    /* Update notification doc */
    if (notificationId) {
      Notification.findByIdAndUpdate(notificationId, {
        $set: {
          'channels.sms.sent': smsResult.ok === true,
          'channels.sms.sentAt': new Date(),
        },
      }).catch(() => {});
    }

    return smsResult;
  }

  /* Legacy order_status (no-op now, handled by socket) */
  if (job.name === 'order_status') {
    logger.debug({ data: job.data }, '[Notif] order_status job (socket-handled, no push needed)');
    return { ok: true, skipped: true };
  }

  /* Event booking reminder (24h before event) */
  if (job.name === 'event_reminder') {
    const { bookingId, userId, partnerId } = job.data;
    try {
      const EventBooking = require('../modules/events/event-booking.model');
      const booking = await EventBooking.findById(bookingId).select('status themeId eventDate eventTimeSlot').populate('themeId', 'title').lean();
      if (!booking || !['confirmed', 'partner_assigned'].includes(booking.status)) {
        return { ok: true, skipped: true, reason: 'booking_not_active' };
      }
      const ns = require('../modules/notification/notification.service');
      const dateStr = new Date(booking.eventDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
      await Promise.all([
        ns.notify({
          recipient: { kind: 'user', id: userId },
          type: 'event_booking_reminder',
          title: '🎉 Your event is tomorrow!',
          body: `${booking.themeId?.title || 'Your decoration'} is scheduled for ${dateStr} at ${booking.eventTimeSlot}. Get ready!`,
          deepLink: `/events/bookings/${bookingId}`,
          data: { bookingId },
        }),
        ns.notify({
          recipient: { kind: 'event_partner', id: partnerId },
          type: 'event_booking_reminder',
          title: '📋 Event reminder: Tomorrow',
          body: `You have a decoration event tomorrow — ${dateStr} at ${booking.eventTimeSlot}. Confirm all materials are ready.`,
          deepLink: `/partner`,
          data: { bookingId },
        }),
      ]);
    } catch (err) {
      logger.warn({ err: err.message, bookingId }, '[Notif] Event reminder failed');
    }
    return { ok: true };
  }

  logger.warn({ name: job.name }, '[Notif] Unknown job type');
  return { ok: false, reason: 'unknown_job' };
}

/* Main */

async function main() {
  await connectMongo();

  const bullWorker = new BullWorker(QUEUES.NOTIFICATIONS, processJob, {
    connection: createBullConnection(),
    concurrency: 20,
  });

  bullWorker.on('completed', (job, result) =>
    logger.debug({ jobId: job.id, name: job.name, result }, '[Notif] Job completed')
  );
  bullWorker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, name: job?.name, err: err.message }, '[Notif] Job failed')
  );

  logger.info('[Notif] Notifications worker started');
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '[Notif] Worker crashed');
    process.exit(1);
  });
}

module.exports = { processJob };
