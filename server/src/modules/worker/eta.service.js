/**
 * ETA Service — production cost/accuracy model
 * ----------------------------------------------------------------------------
 * Strategy (mirrors Uber/Rapido far/near split):
 *   - FAR field (> ETA_NEAR_KM): pure Haversine ÷ the worker's own smoothed
 *     speed (EWMA). Zero Google calls — and more personalised than a constant.
 *   - NEAR field (≤ ETA_NEAR_KM): traffic-aware Google Distance Matrix, cached
 *     ~30s by rounded coordinates (see google-maps.service). Accuracy matters
 *     here because this is where "arriving" fires.
 *   - Δ-SUPPRESSION: only broadcast when ETA changes ≥ 30s, the arriving-soon
 *     edge flips, or it's the first fix. Kills redundant socket + Google traffic.
 *
 * Net effect vs the old "Google every 5s": ~90% fewer Distance Matrix calls.
 * ----------------------------------------------------------------------------
 */

const { redis } = require('../../config/redis');
const logger = require('../../core/logger');
const gmaps  = require('../maps/google-maps.service');
const { haversineKm } = require('../../core/geo/distance');

const PICKUP_KEY        = (orderId) => `order:pickup:${orderId}`;
const ARRIVING_SOON_KEY = (orderId) => `order:arriving_soon_sent:${orderId}`;
const ETA_THROTTLE_KEY  = (orderId) => `eta:throttle:${orderId}`;
const ETA_LAST_KEY      = (orderId) => `eta:last:${orderId}`;
const SPEED_KEY         = (workerId) => `eta:spd:${workerId}`;
const LASTPOS_KEY       = (orderId) => `order:lastpos:${orderId}`; // resync read-model

const ETA_THROTTLE_SEC = 5;     // compute at most every 5s/order
const ETA_NEAR_KM      = 2.0;   // within this, use Google; beyond, haversine÷speed
const ETA_MIN_DELTA_SEC = 30;   // suppress broadcasts smaller than this

// EWMA speed bounds (m/s): 5.4 km/h floor (crawling) .. 57.6 km/h ceiling.
const SPEED_FLOOR_MPS = 1.5;
const SPEED_CEIL_MPS  = 16.0;
const DEFAULT_SPEED_MPS = 25 / 3.6; // 25 km/h urban default
const EWMA_ALPHA = 0.4;


async function cacheOrderPickup(orderId, lat, lng) {
  await redis.set(PICKUP_KEY(orderId), JSON.stringify({ lat, lng }), 'EX', 86400);
}

/** Update + read the worker's smoothed speed (m/s). */
async function updateSpeedEwma(workerId, observedMps) {
  let smoothed = DEFAULT_SPEED_MPS;
  try {
    const prev = await redis.get(SPEED_KEY(workerId));
    if (typeof observedMps === 'number' && observedMps > 0 && observedMps < SPEED_CEIL_MPS * 2) {
      const clamped = Math.min(SPEED_CEIL_MPS, Math.max(SPEED_FLOOR_MPS, observedMps));
      smoothed = prev ? EWMA_ALPHA * clamped + (1 - EWMA_ALPHA) * Number(prev) : clamped;
    } else if (prev) {
      smoothed = Number(prev);
    }
    await redis.set(SPEED_KEY(workerId), String(smoothed), 'EX', 1800);
  } catch { /* best-effort */ }
  return smoothed;
}

/**
 * Compute ETA and broadcast to the order room (Δ-suppressed). Fire the
 * "arriving soon" notification once when within threshold.
 *
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.workerId
 * @param {number} p.workerLat
 * @param {number} p.workerLng
 * @param {string} p.orderUserId
 * @param {number} [p.observedSpeedMps]  server-computed instantaneous speed
 */
async function computeAndBroadcast({ orderId, workerId, workerLat, workerLng, orderUserId, observedSpeedMps }) {
  // Compute at most every 5s/order.
  const throttled = await redis.set(ETA_THROTTLE_KEY(orderId), '1', 'EX', ETA_THROTTLE_SEC, 'NX');
  if (throttled !== 'OK') return;

  const raw = await redis.get(PICKUP_KEY(orderId));
  if (!raw) return; // not in on_the_way state yet
  let pickup;
  try { pickup = JSON.parse(raw); } catch { return; }

  const speedMps = await updateSpeedEwma(workerId, observedSpeedMps);
  const distKm = haversineKm(workerLat, workerLng, pickup.lat, pickup.lng);

  let etaMinutes, source;
  if (distKm > ETA_NEAR_KM) {
    // FAR: no Google — haversine ÷ personalised smoothed speed
    etaMinutes = Math.max(1, Math.ceil((distKm * 1000) / speedMps / 60));
    source = 'ewma';
  } else {
    // NEAR: traffic-aware Google (cached ~30s by rounded coords in gmaps layer)
    try {
      const matrix = await gmaps.getDistanceMatrix(workerLat, workerLng, pickup.lat, pickup.lng);
      etaMinutes = Math.max(1, Math.ceil(matrix.durationInTrafficSeconds / 60));
      source = 'google';
    } catch {
      etaMinutes = Math.max(1, Math.ceil((distKm * 1000) / speedMps / 60));
      source = 'haversine';
    }
  }

  const isArrivingSoon = distKm <= 0.5;

  // Δ-suppression: broadcast only on first fix, ≥30s change, or arriving-soon flip.
  let shouldBroadcast = true;
  try {
    const lastRaw = await redis.get(ETA_LAST_KEY(orderId));
    if (lastRaw) {
      const last = JSON.parse(lastRaw);
      const deltaSec = Math.abs((etaMinutes - last.etaMinutes) * 60);
      if (deltaSec < ETA_MIN_DELTA_SEC && last.isArrivingSoon === isArrivingSoon) {
        shouldBroadcast = false;
      }
    }
  } catch { /* broadcast */ }

  if (shouldBroadcast) {
    const payload = { distKm: Number(distKm.toFixed(3)), etaMinutes, isArrivingSoon, source, at: Date.now() };
    await redis.set(ETA_LAST_KEY(orderId), JSON.stringify(payload), 'EX', 3600);
    // Read-model for fast reconnect/resync
    redis.set(LASTPOS_KEY(orderId), JSON.stringify({ lat: workerLat, lng: workerLng, ...payload }), 'EX', 3600).catch(() => {});
    /**
     * `eta.update` is the name every client actually listens for.
     *
     * This published `order.eta`, and the socket gateway forwards the event
     * name verbatim — so no listener has ever matched it and the ETA has never
     * reached a customer, on orders OR repairs. The clients are right and the
     * publisher was wrong: the name is not order-specific, and repairs share
     * this exact rail.
     */
    await redis.publish('order:event', JSON.stringify({
      orderId: String(orderId),
      event: 'eta.update',
      payload,
    }));
  }

  // One-time "arriving soon" push.
  if (isArrivingSoon && orderUserId) {
    const already = await redis.set(ARRIVING_SOON_KEY(orderId), '1', 'EX', 3600, 'NX');
    if (already === 'OK') {
      const notificationService = require('../notification/notification.service');
      notificationService.notify({
        recipient: { kind: 'user', id: orderUserId },
        type: 'worker_arriving_soon',
        title: '📍 Worker is almost there',
        body: 'Your worker is less than 500m away — get ready!',
        deepLink: `/orders/${orderId}`,
        data: { orderId: String(orderId), distKm, etaMinutes },
        sms: false,
      }).catch(() => {});
    }
  }
}

module.exports = { cacheOrderPickup, computeAndBroadcast, haversineKm };
