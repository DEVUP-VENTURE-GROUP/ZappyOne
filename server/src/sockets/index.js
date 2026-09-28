/**
 * Socket.io server
 * ----------------------------------------------------------------------------
 * Responsibilities:
 *   - Authenticate socket connections via JWT (handshake auth token).
 *   - Join rooms:
 *       user:<userId>     → per-user notifications
 *       worker:<workerId> → offers, broadcasts
 *       order:<orderId>   → live tracking participants (user + worker + admin)
 *   - Bridge Redis pub/sub → socket rooms so the dispatch worker and other
 *     stateless nodes can reach the right clients regardless of which API
 *     node holds their socket.
 *   - Throttle location broadcasts to at most 1/second per order.
 * ----------------------------------------------------------------------------
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createPubSubPair, redis } = require('../config/redis');
const { socketCorsOrigin } = require('../config/origins');
const { verifyToken } = require('../modules/auth/auth.service');
const etaService = require('../modules/worker/eta.service');
const geoService = require('../modules/worker/geo.service');
const Order = require('../modules/order/order.model');
const LocationPing = require('../modules/worker/location-ping.model');
const { isInIndia } = require('../utils/geo-validate');
const logger = require('../utils/logger');

let io = null;

function initSockets(httpServer) {
  const { pubClient, subClient } = createPubSubPair();

  // When Redis reconnects after a restart, the adapter's room memberships are
  // gone. Broadcast `server:rooms_reset` so all connected clients re-emit
  // `order:subscribe` and rejoin their rooms.
  pubClient.on('ready', () => {
    if (io) {
      logger.warn('[SOCKET] Redis reconnected — broadcasting rooms_reset to all clients');
      io.emit('server:rooms_reset', { reason: 'redis_reconnect', at: Date.now() });
    }
  });

  // Origins come from config/origins.js — the SAME list Express CORS uses.
  // This was a hand-maintained copy and it drifted: rakshak/events were added to
  // Express but not here, so on rakshak.zappyone.com the REST API worked while
  // every socket was rejected — workers got no job-offer popups at all.
  io = new Server(httpServer, {
    cors: {
      origin: socketCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });
  io.adapter(createAdapter(pubClient, subClient));

  // --- JWT handshake auth ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Missing token'));
    try {
      const payload = verifyToken(token);
      socket.user = payload; // { sub, role, phone }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { sub: id, role } = socket.user;
    logger.info({ id, role, sid: socket.id }, 'Socket connected');

    // Mark this user/worker as socket-present in Redis (TTL = 65s, refreshed by socket.io
    // pings every 25s). notification.service reads this to skip FCM for online recipients.
    redis.set(`presence:${role}:${id}`, '1', 'EX', 65).catch(() => {});

    // Join role-based personal room (restored on every reconnect automatically).
    socket.join(`${role}:${id}`);

    // Multi-device eviction — done ONCE at connect time (not per location tick).
    // The most recent device wins; older worker sockets are disconnected so only
    // one device receives offers and writes location (anti credential-sharing).
    if (role === 'worker') {
      io.in(`worker:${id}`).allSockets()
        .then((sockets) => {
          for (const sid of sockets) {
            if (sid === socket.id) continue;
            const stale = io.sockets.sockets.get(sid);
            if (stale) {
              stale.emit('session:replaced', { reason: 'New login from another device' });
              stale.disconnect(true);
            }
          }
        })
        .catch(() => {});
    }

    // Restore order room membership after server restart / reconnect.
    // Workers on an active job and users with an active order need to be
    // back in `order:<id>` without waiting for the client to call order:subscribe.
    try {
      if (role === 'worker') {
        const activeOrder = await Order.findOne({
          workerId: id,
          status: { $in: ['assigned', 'on_the_way', 'arrived', 'in_progress'] },
        }).select('_id').lean();
        if (activeOrder) {
          socket.join(`order:${activeOrder._id}`);
          logger.info({ workerId: id, orderId: activeOrder._id }, '[SOCKET] Worker auto-rejoined order room on connect');
        }
      } else if (role === 'user') {
        const activeOrder = await Order.findOne({
          userId: id,
          status: { $in: ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'] },
        }).select('_id').lean();
        if (activeOrder) {
          socket.join(`order:${activeOrder._id}`);
          logger.info({ userId: id, orderId: activeOrder._id }, '[SOCKET] User auto-rejoined order room on connect');
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, id, role }, '[SOCKET] Failed to auto-restore order room');
    }

    // --- Client-driven room joins (authorization-gated) ---
    socket.on('order:subscribe', async ({ orderId }) => {
      if (!orderId) return;
      try {
        const order = await Order.findById(orderId).select('userId workerId dispatch').lean();
        if (!order) return;

        const isUser   = String(order.userId) === String(id);
        const isWorker = String(order.workerId || '') === String(id);
        // Check both the primary offer field AND the full broadcast batch.
        const offerBatch = (order.dispatch?.currentOfferWorkerIds || []).map(String);
        const isOffered  = String(order.dispatch?.currentOfferWorkerId || '') === String(id)
                        || offerBatch.includes(String(id));
        const isAdmin  = role === 'admin';

        if (!isUser && !isWorker && !isOffered && !isAdmin) {
          socket.emit('order:subscribe_denied', { orderId, reason: 'not_authorized' });
          return;
        }
        socket.join(`order:${orderId}`);
        socket.emit('order:subscribed', { orderId });
      } catch {
        // DB error — deny silently
      }
    });

    socket.on('order:unsubscribe', ({ orderId }) => {
      if (!orderId) return;
      socket.leave(`order:${orderId}`);
    });

    // --- Worker live location (WS-driven, bypasses HTTP for lower latency) ---
    // The client should throttle client-side; we throttle server-side too.
    socket.on('worker:location', async ({ lat, lng, orderId, hdg, spd, acc, mock }) => {
      if (role !== 'worker') return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      // Anti-spoofing: drop mock-provider fixes and out-of-area coordinates
      // (VPN / IP-geolocation), and log a fraud event for ops review.
      if (mock === true || !isInIndia(lat, lng)) {
        require('../modules/fraud/fraud.service')
          .logGpsSpoofEvent(id, { reason: mock === true ? 'mock_provider' : 'outside_service_area', lat, lng })
          .catch(() => {});
        return;
      }
      // Ignore garbage-accuracy fixes (desktop Wi-Fi triangulation) for tracking.
      if (typeof acc === 'number' && acc > 1000) return;

      // Server-side throttle: at most 1 broadcast/sec per worker.
      const canEmit = await redis.set(`loc:ws:${id}`, '1', 'EX', 1, 'NX');
      if (canEmit !== 'OK') return;

      // GPS spoofing velocity check — reject teleportation. Keyed by socket.id so
      // two devices don't look like one teleporting worker. Also yields the
      // instantaneous speed we feed into the ETA EWMA (no client trust needed).
      const prevKey = `loc:prev:${socket.id}`;
      const prevRaw = await redis.get(prevKey);
      let observedSpeedMps = null;
      let distMetresFromPrev = null;
      if (prevRaw) {
        try {
          const prev = JSON.parse(prevRaw);
          const R = 6371000;
          const dLat = (lat - prev.lat) * Math.PI / 180;
          const dLng = (lng - prev.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2
            + Math.cos(prev.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          distMetresFromPrev = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const elapsedSec = Math.max(1, (Date.now() - prev.ts) / 1000);
          observedSpeedMps = distMetresFromPrev / elapsedSec;
          if (observedSpeedMps > 41.7) { // > 150 km/h
            logger.warn({ workerId: id, speedMps: Math.round(observedSpeedMps) }, '[SPOOFING] Suspicious GPS jump — rejected');
            require('../modules/fraud/fraud.service')
              .logGpsSpoofEvent(id, { speedMps: observedSpeedMps, distMetres: distMetresFromPrev })
              .catch(() => {});
            return;
          }
        } catch { /* malformed prev — allow through */ }
      }
      await redis.set(prevKey, JSON.stringify({ lat, lng, ts: Date.now() }), 'EX', 300);

      // Micro-jitter gate when idle: require ≥5m movement off-order to avoid
      // waking nearby-worker map tiles on GPS noise. On an active order the 1s
      // throttle is the rate-limiter.
      const movedEnough = !(!orderId && distMetresFromPrev != null && distMetresFromPrev < 5);

      // Update geo + alive heartbeat (buffered — see geo.service).
      await geoService.updateLocation(id, lng, lat);

      if (orderId && movedEnough) {
        io.to(`order:${orderId}`).emit('worker.location', {
          lat, lng, at: Date.now(),
          hdg: (typeof hdg === 'number' && hdg >= 0 && hdg <= 360) ? hdg : null,
          spd: (typeof spd === 'number' && spd >= 0 && spd < 60)   ? spd : null,
        });

        // ETA — non-blocking, only during on_the_way. Feeds server-computed speed.
        Order.findById(orderId).select('userId status').lean().then((o) => {
          if (!o || o.status !== 'on_the_way') return;
          return etaService.computeAndBroadcast({
            orderId: String(orderId),
            workerId: String(id),
            workerLat: lat,
            workerLng: lng,
            orderUserId: o.userId,
            observedSpeedMps,
          });
        }).catch(() => {});

        // Durable, sampled trail for replay / forensics / AI (async, capped).
        LocationPing.create({
          workerId: id, orderId,
          loc: { type: 'Point', coordinates: [lng, lat] },
          hdg: typeof hdg === 'number' ? hdg : undefined,
          spd: observedSpeedMps,
          acc: typeof acc === 'number' ? acc : undefined,
          mock: mock === true,
          at: new Date(),
        }).catch(() => {});
      }
    });

    // Refresh presence TTL on every ping cycle (socket.io pings every 25s)
    socket.conn.on('packet', (packet) => {
      if (packet.type === 'ping') {
        redis.set(`presence:${role}:${id}`, '1', 'EX', 65).catch(() => {});
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info({ id, role, sid: socket.id, reason }, 'Socket disconnected');
      // Only clear presence if this was the last socket for this user/worker.
      io.in(`${role}:${id}`).fetchSockets().then((socks) => {
        if (socks.length === 0) redis.del(`presence:${role}:${id}`).catch(() => {});
      }).catch(() => {});
    });
  });

  // --- Redis pub/sub → socket room bridge ---
  // Dispatch worker publishes events; we relay them to the right rooms.
  const subscriber = subClient.duplicate();

  subscriber.subscribe('order:event', 'worker:offer', 'worker:offer_cancel', 'worker:assigned', 'surge:alert', 'order:boost', 'worker:kyc_rejected', 'worker:job_pulled', 'provider:repair', (err) => {
    if (err) logger.error({ err }, 'Pub/sub subscribe failed');
  });
  // Notifications are per-recipient — `notification:<kind>:<id>`. Use pattern sub.
  subscriber.psubscribe('notification:*', (err) => {
    if (err) logger.error({ err }, 'Pub/sub psubscribe failed');
  });

  subscriber.on('pmessage', (pattern, channel, message) => {
    if (!channel.startsWith('notification:')) return;
    try {
      const [, kind, id] = channel.split(':');
      const data = JSON.parse(message);
      io.to(`${kind}:${id}`).emit('notification', data);
    } catch (err) {
      logger.warn({ err: err.message, channel }, 'Bad notification pub/sub message');
    }
  });

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);

      if (channel === 'order:event') {
        // { orderId, event, payload }
        io.to(`order:${data.orderId}`).emit(data.event, data.payload);
        return;
      }

      if (channel === 'provider:repair') {
        // { kind: 'worker' | 'shop', id, event, payload } — repair nudges are
        // addressed to a provider rather than to an order room.
        io.to(`${data.kind}:${data.id}`).emit(data.event, data.payload);
        return;
      }

      if (channel === 'worker:offer') {
        // { workerId, order }  — broadcast model, any notified worker can accept first
        io.to(`worker:${data.workerId}`).emit('new_job_request', data.order);
        return;
      }

      if (channel === 'worker:offer_cancel') {
        // { workerId, orderId }  — order taken by another worker, dismiss the popup
        io.to(`worker:${data.workerId}`).emit('offer.cancelled', { orderId: data.orderId });
        return;
      }

      if (channel === 'worker:assigned') {
        // { workerId, orderId, service, pickupAddress, price }  — force-assigned, no accept needed
        io.to(`worker:${data.workerId}`).emit('job.assigned', data);
        return;
      }

      if (channel === 'order:boost') {
        const boostPayload = {
          orderId:     data.orderId,
          amountPaise: data.amountPaise,
          rupees:      data.rupees,
          newTotal:    data.newTotal,
        };
        if (data.workerId) {
          // Targeted: worker is still in offer-viewing state (not yet in order room)
          io.to(`worker:${data.workerId}`).emit('offer.boosted', boostPayload);
        } else {
          // Fallback: broadcast to order room (assigned/in-progress workers)
          io.to(`order:${data.orderId}`).emit('offer.boosted', boostPayload);
        }
        return;
      }

      if (channel === 'worker:kyc_rejected') {
        // Admin rejected KYC — force worker's UI offline in real-time
        // { workerId, reason, status }
        io.to(`worker:${data.workerId}`).emit('kyc.rejected', {
          status: data.status,
          reason: data.reason,
        });
        return;
      }

      if (channel === 'worker:job_pulled') {
        // { workerId, orderId } — stale-order watchdog pulled the job from this worker
        io.to(`worker:${data.workerId}`).emit('job.pulled', { orderId: data.orderId });
        return;
      }

      if (channel === 'surge:alert') {
        // { lat, lng, multiplier, service } — notify online workers within 5 km
        const { lat, lng, multiplier, service: svc } = data;
        // Fetch worker IDs from the Redis GEO set directly (lightweight, no skill filter needed)
        (async () => {
          try {
            let geoResult;
            try {
              geoResult = await redis.geosearch(
                'workers:online',
                'FROMLONLAT', lng, lat,
                'BYRADIUS', 5, 'km',
                'ASC', 'COUNT', 50,
              );
            } catch {
              geoResult = await redis.georadius(
                'workers:online',
                lng, lat, 5, 'km',
                'ASC', 'COUNT', '50',
              );
            }
            const workerIds = Array.isArray(geoResult) ? geoResult.map((r) => (Array.isArray(r) ? r[0] : r)) : [];
            for (const wid of workerIds) {
              io.to(`worker:${wid}`).emit('surge.alert', { lat, lng, multiplier, service: svc });
            }
            if (workerIds.length > 0) {
              logger.info({ lat, lng, multiplier, service: svc, notified: workerIds.length }, '[SURGE] Socket alert sent');
            }
          } catch (err) {
            logger.warn({ err: err.message }, '[SURGE] Failed to fan out surge alert');
          }
        })();
        return;
      }
    } catch (err) {
      logger.warn({ err: err.message, channel }, 'Bad pub/sub message');
    }
  });

  logger.info('Socket.io initialized with Redis adapter');
  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { initSockets, getIo };
