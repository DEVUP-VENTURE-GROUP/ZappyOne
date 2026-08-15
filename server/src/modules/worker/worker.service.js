const Worker = require('./worker.model');
const Order = require('../order/order.model');
const geoService = require('./geo.service');
const pricingService = require('../pricing/pricing.service');
const { redis } = require('../../config/redis');
const config = require('../../config');
const logger = require('../../utils/logger');

// Max credible worker speed — anything beyond this is a GPS spoof or teleport.
// 150 km/h covers highway driving, ambulances, trains (but not planes).
const GPS_MAX_SPEED_KMH = 150;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function goOnline({ workerId, lng, lat }) {
  // Reject foreign / impossible coordinates (VPN, IP-geolocation, spoofing).
  // Server is authoritative — a worker physically in India must report India.
  const { isInIndia } = require('../../utils/geo-validate');
  if (!isInIndia(lat, lng)) {
    throw Object.assign(
      new Error('Could not verify your location is within the service area. Turn off any VPN and enable precise GPS.'),
      { status: 422, code: 'LOCATION_OUT_OF_AREA' },
    );
  }

  // Load first to check KYC status — cheap guard before we write anything.
  const existing = await Worker.findById(workerId).select('kyc.status isBlocked isOnline onlineSince').lean();
  if (!existing) throw Object.assign(new Error('Worker not found'), { status: 404, code: 'WORKER_NOT_FOUND' });
  if (existing.isBlocked) {
    throw Object.assign(new Error('Account is blocked'), { status: 403, code: 'WORKER_BLOCKED' });
  }
  // KYC approval is mandatory in all environments — no dev bypass.
  if (existing.kyc?.status !== 'approved') {
    throw Object.assign(new Error('KYC approval required before going online'), {
      status: 403, code: 'KYC_NOT_APPROVED', kycStatus: existing.kyc?.status || 'not_submitted',
    });
  }

  // Block workers whose wallet dues exceed the hard limit
  const duesService = require('./worker-dues.service');
  await duesService.assertCanWork(workerId);

  const worker = await Worker.findByIdAndUpdate(
    workerId,
    {
      $set: {
        isOnline: true,
        isAvailable: true,
        'currentLocation.coordinates': [lng, lat],
        'currentLocation.updatedAt': new Date(),
        lastSeenAt: new Date(),
        // Stamp the session start only on the offline→online transition. A
        // redundant goOnline mid-session (reconnect, second device) keeps the
        // original timestamp, so the "online for" clock doesn't reset.
        onlineSince: existing.isOnline && existing.onlineSince ? existing.onlineSince : new Date(),
      },
    },
    { new: true }
  );
  await geoService.markOnline(worker);
  await pricingService.recordSupply(worker._id, lat, lng);
  // Seed GPS baseline so first updateLocation has a reference point.
  redis.set(`worker:lastloc:${workerId}`, JSON.stringify({ lat, lng, ts: Date.now() }), 'EX', 600).catch(() => {});
  return worker;
}

async function goOffline({ workerId }) {
  // Refuse if worker is mid-order — prevents orphaned orders.
  const active = await Order.findOne({
    workerId,
    status: { $in: ['assigned', 'on_the_way', 'arrived', 'in_progress'] },
  }).lean();
  if (active) {
    throw Object.assign(new Error('Finish your active order before going offline'), {
      status: 409,
      activeOrderId: active._id,
    });
  }

  const worker = await Worker.findByIdAndUpdate(
    workerId,
    { $set: { isOnline: false, isAvailable: false, lastSeenAt: new Date(), onlineSince: null } },
    { new: true }
  );
  await geoService.markOffline(workerId);
  return worker;
}

/**
 * Hot-path location update. Writes to Redis GEO only.
 * Mongo gets a throttled write every 30s via lastSeenAt.
 */
async function updateLocation({ workerId, lng, lat, orderId }) {
  // GPS spoof guard: reject location updates that imply impossible speed.
  // Stealth rejection — return ok:true so fraudsters don't know they're flagged.
  const lastLocKey = `worker:lastloc:${workerId}`;
  const lastRaw = await redis.get(lastLocKey).catch(() => null);
  if (lastRaw) {
    try {
      const last = JSON.parse(lastRaw);
      const distKm = haversineKm(last.lat, last.lng, lat, lng);
      const elapsedHours = (Date.now() - last.ts) / 3_600_000;
      const speedKmh = elapsedHours > 0 ? distKm / elapsedHours : 0;
      if (speedKmh > GPS_MAX_SPEED_KMH) {
        logger.warn({ workerId, speedKmh: Math.round(speedKmh), distKm: distKm.toFixed(2), lat, lng }, '[GPS] Spoof detected — location rejected');
        redis.publish('worker:gps_spoof', JSON.stringify({ workerId, lat, lng, speedKmh: Math.round(speedKmh), at: Date.now() })).catch(() => {});
        return { ok: true };
      }
    } catch { /* JSON parse error — proceed normally */ }
  }
  // Update baseline for the next call (TTL 5 min — resets if worker pauses pinging)
  redis.set(lastLocKey, JSON.stringify({ lat, lng, ts: Date.now() }), 'EX', 300).catch(() => {});

  await geoService.updateLocation(workerId, lng, lat);

  // Throttle Mongo writes — only if >30s since last.
  const throttleKey = `loc:mongo:${workerId}`;
  const shouldWriteDb = await redis.set(throttleKey, '1', 'EX', 30, 'NX');
  if (shouldWriteDb === 'OK') {
    await Worker.updateOne(
      { _id: workerId },
      {
        $set: {
          'currentLocation.coordinates': [lng, lat],
          'currentLocation.updatedAt': new Date(),
          lastSeenAt: new Date(),
        },
      }
    );
  }

  // If worker is on a trip, broadcast location + ETA to the order room.
  if (orderId) {
    await redis.publish(
      'order:event',
      JSON.stringify({
        orderId: String(orderId),
        event: 'worker.location',
        payload: { lng, lat, at: Date.now() },
      })
    );

    // ETA + arriving-soon trigger (non-blocking; needs order's userId)
    const etaService = require('./eta.service');
    Order.findById(orderId).select('userId status').lean().then((o) => {
      if (!o || o.status !== 'on_the_way') return;
      return etaService.computeAndBroadcast({
        orderId: String(orderId),
        workerId: String(workerId),
        workerLat: lat,
        workerLng: lng,
        orderUserId: o.userId,
      });
    }).catch(() => {});
  }
  return { ok: true };
}

async function getEarnings({ workerId, range = 'today' }) {
  const now = new Date();
  let since;
  if (range === 'today') since = new Date(now.setHours(0, 0, 0, 0));
  else if (range === 'week') since = new Date(Date.now() - 7 * 86400 * 1000);
  else since = new Date(Date.now() - 30 * 86400 * 1000);

  const mongoose = require('mongoose');
  const wid = mongoose.Types.ObjectId.createFromHexString(String(workerId));

  const [agg, daily] = await Promise.all([
    Order.aggregate([
      { $match: { workerId: wid, status: 'completed', completedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          // earnings.workerPaise is set on completion (post-commission).
          // Fall back to pricing.total*100*(1-commissionRate) for legacy rows.
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', { $multiply: ['$pricing.total', 80] }] } },
          commissionPaise: { $sum: { $ifNull: ['$earnings.platformPaise', { $multiply: ['$pricing.total', 20] }] } },
          avgFarePaise: { $avg: { $ifNull: ['$earnings.workerPaise', { $multiply: ['$pricing.total', 80] }] } },
          cashJobs: { $sum: { $cond: [{ $eq: ['$payment.method', 'cash'] }, 1, 0] } },
          onlineJobs: { $sum: { $cond: [{ $ne: ['$payment.method', 'cash'] }, 1, 0] } },
        },
      },
    ]),

    // Daily breakdown for chart (always last 30 days regardless of range)
    Order.aggregate([
      { $match: { workerId: wid, status: 'completed', completedAt: { $gte: new Date(Date.now() - 30 * 86400 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          jobs: { $sum: 1 },
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', { $multiply: ['$pricing.total', 80] }] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const summary = agg[0] || { jobs: 0, earningsPaise: 0, commissionPaise: 0, avgFarePaise: 0, cashJobs: 0, onlineJobs: 0 };
  return {
    range,
    since,
    jobs: summary.jobs,
    earningsPaise: Math.round(summary.earningsPaise),
    earningsRupees: Math.round(summary.earningsPaise / 100),
    commissionPaidPaise: Math.round(summary.commissionPaise),
    avgEarningPerJobRupees: summary.jobs > 0 ? Math.round(summary.avgFarePaise / 100) : 0,
    cashJobs: summary.cashJobs,
    onlineJobs: summary.onlineJobs,
    dailyBreakdown: daily.map((d) => ({ date: d._id, jobs: d.jobs, earningsPaise: Math.round(d.earningsPaise) })),
  };
}

module.exports = { goOnline, goOffline, updateLocation, getEarnings };
