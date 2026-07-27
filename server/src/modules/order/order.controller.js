const orderService = require('./order.service');
const pricingService = require('../pricing/pricing.service');
const abuseService = require('./abuse.service');

async function getQuote(req, res, next) {
  try {
    const { service, deviceBrand, deviceModel, deviceSeries, partsTier, priority, pricingModel, estimatedHours, vehicleType } = req.query;
    const pickupLat = parseFloat(req.query.pickupLat);
    const pickupLng = parseFloat(req.query.pickupLng);
    const dropLat   = req.query.dropLat  != null ? parseFloat(req.query.dropLat)  : null;
    const dropLng   = req.query.dropLng  != null ? parseFloat(req.query.dropLng)  : null;
    if (isNaN(pickupLat) || isNaN(pickupLng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    const quote = await pricingService.quote({
      origin: { lat: pickupLat, lng: pickupLng },
      dest: { lat: dropLat ?? pickupLat + 0.00045, lng: dropLng ?? pickupLng }, // ~50m nominal for home services
      service,
      userId: req.auth?.sub,
      priority: priority || 'normal',
      deviceBrand,
      deviceModel,
      deviceSeries,
      partsTier,
      pricingModel,
      vehicleType,
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
    });
    res.json({ quote });
  } catch (err) { next(err); }
}

async function createOrder(req, res, next) {
  try {
    // IP-level fraud gate: catches multi-account spammers that defeat per-user limits.
    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    await abuseService.assertIpCanBook(clientIp);

    const order = await orderService.createOrder({ userId: req.auth.sub, ...req.body });
    res.status(201).json({ order: { _id: order._id, status: order.status, service: order.service, pickupLocation: order.pickupLocation, pricing: order.pricing } });
  } catch (err) { next(err); }
}

async function listMine(req, res, next) {
  try {
    const page  = Number(req.query.page) || 1;
    const limit = 20;
    const [orders, total] = await orderService.listByUser(req.auth.sub, { page, limit });
    res.json({ orders, total, totalPages: Math.ceil(total / limit), page });
  } catch (err) { next(err); }
}

async function rebookOrder(req, res, next) {
  try {
    // Same IP-fraud gate as a fresh booking.
    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    await abuseService.assertIpCanBook(clientIp);

    const order = await orderService.rebookOrder({ userId: req.auth.sub, sourceOrderId: req.params.id });
    res.status(201).json({ order: { _id: order._id, status: order.status, service: order.service, pickupLocation: order.pickupLocation, pricing: order.pricing } });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub);
    const isAssignedWorker = String(order.workerId || '') === String(req.auth.sub);
    // Check both primary offer field AND full broadcast batch (broadcast model sends
    // to up to 10 workers simultaneously — all of them need to read the order).
    const offerBatch = (order.dispatch?.currentOfferWorkerIds || []).map(String);
    const isOfferedWorker = String(order.dispatch?.currentOfferWorkerId || '') === String(req.auth.sub)
                         || offerBatch.includes(String(req.auth.sub));
    if (!isOwner && !isAssignedWorker && !isOfferedWorker && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Show OTP to the assigned worker (enters it) AND the order owner (reads it out).
    // Admins and unrelated parties never see it.
    if (!isOwner && !isAssignedWorker && !isOfferedWorker) delete order.otp;
    // Attach display names + worker stats used by chat header and tracking UI.
    const User   = require('../user/user.model');
    const Worker = require('../worker/worker.model');
    const [user, worker] = await Promise.all([
      User.findById(order.userId).select('name').lean(),
      order.workerId ? Worker.findById(order.workerId).select('name rating completedJobs currentLocation').lean() : null,
    ]);
    if (user)   order.userName   = user.name   || null;
    if (worker) {
      order.workerName = worker.name || null;
      order.workerJobs = worker.completedJobs || 0;
      // order.workerRating on the Order schema is the rating the worker gave the user.
      // Null during active orders, so populate from the worker's own profile rating.
      if (order.workerRating == null) order.workerRating = worker.rating || null;
      // Expose worker's last known GPS position so the tracking map can be seeded on
      // page load / refresh without waiting for the first socket location event.
      const ACTIVE = ['assigned', 'on_the_way', 'arrived', 'in_progress'];
      if (ACTIVE.includes(order.status) && worker.currentLocation?.coordinates?.length === 2) {
        const [wLng, wLat] = worker.currentLocation.coordinates;
        order.workerCurrentLocation = { lat: wLat, lng: wLng };
      }
    }

    // Resolve photo keys to fresh presigned S3 GET URLs (valid 2h).
    // Applies to completionPhotos AND booking images (order-images/ keys).
    const s3Service = require('../../utils/s3.service');

    async function resolveUrls(arr) {
      if (!arr?.length) return arr;
      return Promise.all(arr.map(async (val) => {
        if (!val) return val;
        if (val.startsWith('https://')) return val;
        const key = val.startsWith('/api/uploads/download/')
          ? val.slice('/api/uploads/download/'.length)
          : val;
        try { return await s3Service.getDownloadUrl(key); } catch { return val; }
      }));
    }

    if (order.completionPhotos?.length) {
      order.completionPhotos = await resolveUrls(order.completionPhotos);
    }
    if (order.images?.length) {
      order.images = await resolveUrls(order.images);
    }

    res.json({ order });
  } catch (err) { next(err); }
}

async function getCancelPreview(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.userId) !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const cancellationService = require('./cancellation.service');
    const preview = await cancellationService.previewCancelFee(order);
    res.json(preview);
  } catch (err) { next(err); }
}

async function cancelOrder(req, res, next) {
  try {
    const result = await orderService.cancelByUser({
      orderId: req.params.id,
      userId: req.auth.sub,
      reason: req.body?.reason,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function rateOrder(req, res, next) {
  try {
    const order = await orderService.rateOrder({ orderId: req.params.id, userId: req.auth.sub, ...req.body });
    res.json({ order });
  } catch (err) { next(err); }
}

async function workerRateUser(req, res, next) {
  try {
    const order = await orderService.workerRateUser({ orderId: req.params.id, workerId: req.auth.sub, ...req.body });
    res.json({ order });
  } catch (err) { next(err); }
}

async function getTimeline(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub);
    const isAssignedWorker = String(order.workerId || '') === String(req.auth.sub);
    if (!isOwner && !isAssignedWorker && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const firstAtByStatus = {};
    for (const h of order.statusHistory || []) {
      if (!firstAtByStatus[h.status]) firstAtByStatus[h.status] = h.at;
    }
    const stages = ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'failed'].filter((s) => firstAtByStatus[s]);
    res.json({ orderId: order._id, currentStatus: order.status, timeline: stages.map((s) => ({ status: s, at: firstAtByStatus[s] })), createdAt: order.createdAt, completedAt: order.completedAt, cancelledAt: order.cancelledAt });
  } catch (err) { next(err); }
}

async function acceptOffer(req, res, next) {
  try {
    const r = await orderService.acceptOffer({ orderId: req.params.id, workerId: req.auth.sub });
    res.json(r);
  } catch (err) { next(err); }
}

async function rejectOffer(req, res, next) {
  try {
    const r = await orderService.rejectOffer({ orderId: req.params.id, workerId: req.auth.sub });
    res.json(r);
  } catch (err) { next(err); }
}

async function startTrip(req, res, next) {
  try {
    // Accept optional worker GPS from client for accurate ETA computation at trip start
    const order = await orderService.workerStartTrip({
      orderId:   req.params.id,
      workerId:  req.auth.sub,
      workerLat: req.body?.lat   != null ? parseFloat(req.body.lat)   : undefined,
      workerLng: req.body?.lng   != null ? parseFloat(req.body.lng)   : undefined,
    });
    res.json({ order });
  } catch (err) { next(err); }
}

async function arrive(req, res, next) {
  try {
    const order = await orderService.workerArrive({
      orderId: req.params.id,
      workerId: req.auth.sub,
      workerLat: req.body?.lat,
      workerLng: req.body?.lng,
    });
    res.json({ order });
  } catch (err) { next(err); }
}

async function startService(req, res, next) {
  try {
    const order = await orderService.workerStartService({ orderId: req.params.id, workerId: req.auth.sub, otp: req.body.otp });
    res.json({ order });
  } catch (err) { next(err); }
}

// Worker-choice: return the top-ranked available pros near the pickup so the
// customer can (optionally) pick one before booking. Ranking reuses the exact
// dispatch scoring (distance + rating + reliability), so "recommended" here means
// the same worker dispatch would have prioritised anyway.
async function nearbyPros(req, res, next) {
  try {
    const geoService = require('../worker/geo.service');
    const Worker = require('../worker/worker.model');
    const service = String(req.query.service || '');
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!service || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'service, lat and lng are required' });
    }

    const rankedIds = await geoService.findCandidates({
      lat, lng, skill: service, radiusKm: 8,
    });
    const topIds = rankedIds.slice(0, 8);
    if (topIds.length === 0) return res.json({ pros: [] });

    const workers = await Worker.find({ _id: { $in: topIds } })
      .select('name rating completedJobs profilePhoto avatarUrl expertise location')
      .lean();
    const byId = new Map(workers.map((w) => [String(w._id), w]));

    // Haversine distance (km) between the pickup and the worker's last known location.
    const distKm = (lat1, lng1, lat2, lng2) => {
      const R = 6371, toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Preserve dispatch rank order; #1 is the recommended match.
    const pros = topIds
      .map((id, i) => {
        const w = byId.get(String(id));
        if (!w) return null;
        // Pull the experience + specialties for THIS service from the worker's
        // configured expertise (#4) so the customer can compare like-for-like.
        const exp = (w.expertise || []).find((e) => (e.services || []).includes(service));
        // Distance + rough ETA (≈3 min/km urban + 5 min prep) for the comparison card.
        const coords = w.location?.coordinates;
        let distanceKm = null, etaMin = null;
        if (Array.isArray(coords) && coords.length === 2 && (coords[0] !== 0 || coords[1] !== 0)) {
          distanceKm = Number(distKm(lat, lng, coords[1], coords[0]).toFixed(1));
          etaMin = Math.max(5, Math.round(distanceKm * 3) + 5);
        }
        return {
          workerId:        String(id),
          name:            w.name || 'Pro',
          rating:          Number((w.rating ?? 5).toFixed(1)),
          completedJobs:   w.completedJobs || 0,
          photo:           w.profilePhoto || w.avatarUrl || null,
          yearsExperience: exp?.yearsExperience || 0,
          specialties:     exp?.brands || [],
          distanceKm,
          etaMin,
          recommended:     i === 0,
        };
      })
      .filter(Boolean);

    res.json({ pros });
  } catch (err) { next(err); }
}

/**
 * ZeroWait L2 — Warm Dispatch (speculative pre-search).
 *
 * Called while the customer is still on checkout (service + location are known,
 * but they haven't paid). We pre-compute the ranked candidate list and check the
 * Ready Pool, then cache it. Two wins:
 *   1. We can honestly tell the customer "a pro will accept instantly" BEFORE they
 *      pay — a real conversion signal, and a promise we can actually keep.
 *   2. Dispatch reuses the warm list on confirm instead of recomputing.
 * No worker is notified here — this is pure pre-computation, so nothing is wasted
 * if the customer never confirms.
 */
async function warmDispatch(req, res, next) {
  try {
    const { redis } = require('../../config/redis');
    const geoService = require('../worker/geo.service');
    const pricingService = require('../pricing/pricing.service');

    const service = String(req.query.service || '');
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!service || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'service, lat and lng are required' });
    }

    const cfg = await pricingService.getActiveConfig();
    if (cfg.warmDispatchEnabled === false) return res.json({ warm: false, instantAvailable: false });

    const [ready, nearby] = await Promise.all([
      cfg.readyPoolEnabled === false
        ? Promise.resolve([])
        : geoService.findReadyCandidates({
            lng, lat, skill: service,
            radiusKm: 12,
            minRating: cfg.readyMinRating ?? 4.0,
          }),
      geoService.findCandidates({ lng, lat, skill: service, radiusKm: 8 }),
    ]);

    const instantAvailable = ready.length > 0;
    const payload = {
      warm: true,
      instantAvailable,
      readyCount: ready.length,
      nearbyCount: nearby.length,
      // Instant match assigns in <1s; otherwise fall back to a normal ETA estimate.
      etaMinutes: instantAvailable ? 0 : null,
      candidates: [...new Set([...ready, ...nearby])].slice(0, 20).map(String),
    };

    // Cache so dispatch can reuse it on confirm instead of recomputing.
    const ttl = cfg.warmTtlSec ?? 90;
    redis.set(
      `warm:${req.auth.sub}:${service}`,
      JSON.stringify({ ...payload, lat, lng, at: Date.now() }),
      'EX', ttl,
    ).catch(() => {});

    res.json(payload);
  } catch (err) { next(err); }
}

async function completeOrder(req, res, next) {
  try {
    const order = await orderService.workerComplete({
      orderId: req.params.id,
      workerId: req.auth.sub,
      completionPhotos: req.body?.completionPhotos || [],
    });
    res.json({ order });
  } catch (err) { next(err); }
}

async function workerCancelOrder(req, res, next) {
  try {
    const result = await orderService.workerCancel({ orderId: req.params.id, workerId: req.auth.sub, reason: req.body.reason });
    res.json(result);
  } catch (err) { next(err); }
}

async function workerCancelPreview(req, res, next) {
  try {
    const result = await orderService.workerCancelPreview({ orderId: req.params.id, workerId: req.auth.sub, reason: req.query.reason });
    res.json(result);
  } catch (err) { next(err); }
}

/**
 * Worker reports customer didn't answer door / respond. (#73)
 * - Worker must be in 'arrived' status.
 * - Order is cancelled without worker penalty.
 * - Customer is charged the 'arrived' cancellation fee (same as if they cancelled).
 * - Worker receives their arrival compensation from that fee.
 * - Support ticket is auto-created for review.
 */
async function workerReportNoResponse(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const workerId = req.auth.sub;
    const result = await orderService.workerNoResponseCancel({ orderId, workerId });
    res.json(result);
  } catch (err) { next(err); }
}

/**
 * Worker reports required spare part is unavailable mid-diagnosis. (#71)
 * - Order must be in 'in_progress' or 'arrived'.
 * - Order is cancelled; worker receives a diagnostic fee (₹150 default).
 * - Customer refunded minus diagnostic fee.
 * - Part request is logged for admin to source for future jobs.
 */
async function workerReportPartUnavailable(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const { partName, notes } = req.body;
    const result = await orderService.workerPartUnavailableCancel({ orderId, workerId: req.auth.sub, partName, notes });
    res.json(result);
  } catch (err) { next(err); }
}

async function getInvoice(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.userId) !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const invoiceService = require('../service/invoice.service');
    const data = await invoiceService.getInvoiceData(req.params.id);
    const html = invoiceService.renderHtml(data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${data.invoiceNumber}.html"`);
    res.send(html);
  } catch (err) { next(err); }
}

/**
 * User updates their own pickup location after booking but before service starts.
 * Only allowed while status is 'searching' or 'assigned' (worker hasn't departed yet).
 */
async function updatePickupLocation(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.userId) !== String(req.auth.sub)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!['searching', 'assigned'].includes(order.status)) {
      return res.status(409).json({ error: 'Cannot update location after worker has departed' });
    }
    const { lat, lng, address, landmark, notes } = req.body;
    const Order = require('./order.model');
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'pickupLocation.coordinates': [lng, lat],
          'pickupLocation.address': address,
          ...(landmark != null && { 'pickupLocation.landmark': landmark }),
          ...(notes    != null && { 'pickupLocation.notes':    notes    }),
        },
      },
      { new: true }
    );
    // Notify assigned worker of the location change
    if (order.workerId) {
      const notificationService = require('../notification/notification.service');
      notificationService.notify({
        recipient: { kind: 'worker', id: order.workerId },
        type: 'order_placed',
        title: 'Pickup location updated',
        body: `Customer updated their address to: ${address}`,
        deepLink: `/worker/job/${order._id}`,
        data: { orderId: String(order._id), newLat: String(lat), newLng: String(lng) },
      }).catch(() => {});
    }
    // Broadcast to order room so live tracking map updates immediately
    const { redis } = require('../../config/redis');
    redis.publish('order:event', JSON.stringify({
      orderId: String(order._id),
      event: 'order.location_updated',
      payload: { lat, lng, address },
    })).catch(() => {});

    res.json({ order: updated });
  } catch (err) { next(err); }
}

async function reportWorker(req, res, next) {
  try {
    const { id: orderId } = req.params;
    const userId = req.auth.sub;
    const { category, description } = req.body;

    const order = await orderService.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (!order.workerId) {
      return res.status(409).json({ error: 'No worker assigned to this order', code: 'NO_WORKER' });
    }

    const Worker = require('../worker/worker.model');
    const SAFETY_CATEGORIES = new Set(['safety_concern', 'inappropriate_contact']);
    const isSafety = SAFETY_CATEGORIES.has(category);

    // Increment harassment counter on worker
    const worker = await Worker.findByIdAndUpdate(
      order.workerId,
      {
        $inc: { 'trust.harassmentComplaints': 1 },
        ...( !( await Worker.findById(order.workerId).select('trust').lean() )?.trust?.harassmentFlaggedAt
          ? {}
          : {} ),
      },
      { new: true }
    ).select('trust name phone');

    const HARASSMENT_THRESHOLD = 3;

    // Auto-flag worker for admin review after threshold complaints (#89)
    if (worker && worker.trust.harassmentComplaints >= HARASSMENT_THRESHOLD && !worker.trust.harassmentFlaggedAt) {
      await Worker.updateOne({ _id: order.workerId }, {
        $set: {
          'trust.harassmentFlaggedAt': new Date(),
          isAvailable: false, // remove from dispatch until admin reviews
        },
      });
    }

    // Create support ticket — URGENT for safety categories
    const SupportTicket = require('../support/support-ticket.model');
    await SupportTicket.create({
      orderId: order._id,
      userId,
      workerId: order.workerId,
      subject: `Worker ${isSafety ? 'safety' : 'misconduct'} report: ${category}`,
      body: `User reported worker for "${category}".\n\nOrder: ${orderId}\nWorker: ${worker?.name || order.workerId}\nDescription: ${description}`,
      source: 'user_report',
      priority: isSafety ? 'urgent' : 'normal',
      status: 'open',
    });

    const notifService = require('../notification/notification.service');
    // Notify admin ops for safety concerns
    if (isSafety) {
      const { redis } = require('../../config/redis');
      await redis.publish('notification:admin:ops', JSON.stringify({
        type: 'worker_safety_complaint',
        title: `⚠️ Safety complaint: ${worker?.name || 'Worker'}`,
        body: description.slice(0, 120),
        data: { orderId, workerId: String(order.workerId), category },
        urgent: true,
      }));
    }

    // Acknowledge to the user
    notifService.notify({
      recipient: { kind: 'user', id: userId },
      type: 'report_received',
      title: 'Report received',
      body: 'We\'ve received your report and our team will review it within 24 hours. Thank you for keeping the platform safe.',
    }).catch(() => {});

    res.json({
      ok: true,
      message: 'Report submitted. Our team will review within 24 hours.',
      urgent: isSafety,
    });
  } catch (err) { next(err); }
}

async function rescheduleOrder(req, res, next) {
  try {
    const Order = require('./order.model');
    const order = await Order.findOne({ _id: req.params.id, userId: req.auth.sub });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['searching', 'created'].includes(order.status)) {
      return res.status(400).json({ error: 'Order can only be rescheduled before a worker is assigned' });
    }
    const newTime = new Date(req.body.scheduledAt);
    order.scheduledAt = newTime;
    await order.save();
    res.json({ order });
  } catch (err) { next(err); }
}

module.exports = { getQuote, nearbyPros, warmDispatch, createOrder, rebookOrder, listMine, getOne, getCancelPreview, cancelOrder, rateOrder, workerRateUser, getTimeline, acceptOffer, rejectOffer, startTrip, arrive, startService, completeOrder, workerCancelOrder, workerCancelPreview, workerReportNoResponse, workerReportPartUnavailable, reportWorker, getInvoice, updatePickupLocation, rescheduleOrder };
