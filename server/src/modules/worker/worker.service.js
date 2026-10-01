const Worker = require('./worker.model');
const Order = require('../order/order.model');
const geoService = require('./geo.service');
const pricingService = require('../pricing/pricing.service');
const { redis } = require('../../config/redis');
const config = require('../../config');
const logger = require('../../core/logger');
const { haversineKm } = require('../../core/geo/distance');
const { activeTrip } = require('./active-trip');

// Max credible worker speed — anything beyond this is a GPS spoof or teleport.
// 150 km/h covers highway driving, ambulances, trains (but not planes).
const GPS_MAX_SPEED_KMH = 150;


async function goOnline({ workerId, lng, lat }) {
  // Reject foreign / impossible coordinates (VPN, IP-geolocation, spoofing).
  // Server is authoritative — a worker physically in India must report India.
  const { isInIndia } = require('../../core/geo/validate');
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

  /*
   * An individual has no registered address (unlike a shop) — this is the
   * first moment their real position is known at all, and the first chance
   * to auto-provision the service area / pet capability their approved
   * lines need to ever be matched to a job. Never blocks going online.
   */
  require('../onboarding/auto-provision.service')
    .provisionCoverage({ workerId, coordinates: [lng, lat] })
    .catch((err) => logger.warn({ err: err.message, workerId }, '[worker] auto-provision on goOnline failed'));
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
  // Mid-trip, the customer is watching them come: offline would freeze the map.
  const trip = await activeTrip(workerId, { fresh: true });
  if (trip) {
    throw Object.assign(new Error('You are on the way to a job. Finish the trip before going offline.'), {
      status: 409, code: 'ON_TRIP',
      job: { kind: trip.kind, id: trip.id, link: require('../jobs/kinds').KINDS[trip.kind].providerLink(trip.id) },
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
/**
 * Send one position to the customer watching a trip, with a fresh ETA.
 *
 * The ETA engine is the one orders use: keyed by an id, publishing to the same
 * room, so a repair, pet or helping trip only needs its destination cached.
 */
async function broadcastTrip(trip, { workerId, lat, lng }) {
  await redis.publish('order:event', JSON.stringify({
    orderId: trip.id,
    event: 'worker.location',
    payload: { lng, lat, at: Date.now() },
  })).catch(() => {});

  if (!trip.dest) return;
  const etaService = require('./eta.service');
  etaService.cacheOrderPickup(trip.id, trip.dest.lat, trip.dest.lng)
    .then(() => etaService.computeAndBroadcast({
      orderId: trip.id, workerId, workerLat: lat, workerLng: lng, orderUserId: trip.userId,
      deepLink: trip.link, notifyArrival: trip.toCustomer,
    }))
    .catch(() => { /* an ETA is a nicety; never fail a location ping for it */ });
}

async function updateLocation({ workerId, lng, lat, orderId, repairBookingId, jobId }) {
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

  /**
   * A repair, pet or helping trip broadcasts to that job's room.
   *
   * The server finds the trip itself (see active-trip.js): whichever screen
   * the provider has open, the ping reaches the right customer, and only for a
   * job that is theirs and genuinely travelling.
   */
  if (!orderId) {
    const trip = await activeTrip(workerId, { hintId: repairBookingId || jobId || null });
    if (trip) await broadcastTrip(trip, { workerId, lat, lng });
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
          /*
           * `earnings.workerPaise` is written at completion, post-commission.
           *
           * The old fallback multiplied the rupee total by 80 to guess an 80%
           * share. That hardcoded a commission rate the config no longer uses,
           * so every legacy row reported a number nobody had agreed to. A row
           * with no recorded earnings now contributes nothing rather than an
           * invented figure.
           */
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } },
          commissionPaise: { $sum: { $ifNull: ['$earnings.platformPaise', 0] } },
          avgFarePaise: { $avg: { $ifNull: ['$earnings.workerPaise', 0] } },
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
          earningsPaise: { $sum: { $ifNull: ['$earnings.workerPaise', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const summary = agg[0] || { jobs: 0, earningsPaise: 0, commissionPaise: 0, avgFarePaise: 0, cashJobs: 0, onlineJobs: 0 };

  /**
   * Every kind of job counts, not just orders.
   *
   * This once aggregated `Order` only, so a technician whose whole day was
   * repairs, or a helper whose day was errands, saw ₹0. Each kind in the job
   * registry says when a job is done and what the provider's share was — for a
   * repair that is the settlement run's own split, so the number on screen and
   * the number paid cannot drift apart.
   */
  const { ALL } = require('../jobs/kinds');
  const dotted = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
  const finished = [];
  for (const k of ALL.filter((x) => x.earning)) {
    const rows = await k.model().find({
      workerId: wid, status: { $in: k.earning.done }, [k.earning.at]: { $gte: since },
    }).select(k.earning.fields).lean();
    for (const r of rows) {
      finished.push({
        kind: k.kind, paise: k.earning.share(r), platformPaise: k.earning.platform ? k.earning.platform(r) : 0,
        cash: r.paymentMethod === 'cash', at: dotted(r, k.earning.at),
      });
    }
  }

  const jobs = summary.jobs + finished.length;
  const earningsPaise = Math.round(summary.earningsPaise + finished.reduce((s, f) => s + f.paise, 0));
  const finishedCash = finished.filter((f) => f.cash).length;

  // Folded into the same daily series, so the chart matches the total above it.
  const byDay = new Map(daily.map((d) => [d._id, { date: d._id, jobs: d.jobs, earningsPaise: Math.round(d.earningsPaise) }]));
  for (const f of finished) {
    if (!f.at) continue;
    const key = new Date(f.at).toISOString().slice(0, 10);
    const row = byDay.get(key) || { date: key, jobs: 0, earningsPaise: 0 };
    row.jobs += 1;
    row.earningsPaise += f.paise;
    byDay.set(key, row);
  }
  const byKind = (kind) => {
    const of = finished.filter((f) => f.kind === kind);
    return { jobs: of.length, earningsPaise: Math.round(of.reduce((s, f) => s + f.paise, 0)) };
  };

  return {
    range,
    since,
    jobs,
    earningsPaise,
    earningsRupees: Math.round(earningsPaise / 100),
    commissionPaidPaise: Math.round(summary.commissionPaise + finished.reduce((sum, f) => sum + f.platformPaise, 0)),
    avgEarningPerJobRupees: jobs > 0 ? Math.round(earningsPaise / jobs / 100) : 0,
    cashJobs: summary.cashJobs + finishedCash,
    onlineJobs: summary.onlineJobs + (finished.length - finishedCash),
    dailyBreakdown: [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, earningsPaise: Math.round(d.earningsPaise) })),
    /** Split out so a technician can see where the money came from. */
    breakdown: {
      orders: { jobs: summary.jobs, earningsPaise: Math.round(summary.earningsPaise) },
      repairs: byKind('repair'),
      pet: byKind('pet'),
      helping: byKind('helping'),
    },
  };
}

module.exports = { goOnline, goOffline, updateLocation, getEarnings };
