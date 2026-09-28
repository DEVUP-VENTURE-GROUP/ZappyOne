const Worker = require('./worker.model');
const Order = require('../order/order.model');
const geoService = require('./geo.service');
const pricingService = require('../pricing/pricing.service');
const { redis } = require('../../config/redis');
const config = require('../../config');
const logger = require('../../core/logger');
const { haversineKm } = require('../../core/geo/distance');

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
 * Statuses during which a technician's position may be shared.
 *
 * Deliberately a short list. A technician carries this app all day; broadcasting
 * their position outside an active trip would track a person, not a job. Outside
 * these statuses the ping still updates dispatch geo — it is simply never fanned
 * out to a customer.
 */
const REPAIR_MOVING_STATUSES = ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'];

async function updateLocation({ workerId, lng, lat, orderId, repairBookingId }) {
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
   * A repair trip broadcasts to the booking's room.
   *
   * Repair events already travel on `order:event` keyed by the booking id, so
   * the customer's tracking screen subscribes the same way it does for an
   * order. Two guards before anything is published: the booking must belong to
   * THIS technician, and it must be in a status where they are genuinely
   * travelling. Neither is negotiable — the first stops one worker watching
   * another's job, the second stops a repair job becoming a tracking device.
   */
  {
    const { RepairBooking } = require('../repair/models/booking.model');

    /**
     * Find the repair this ping belongs to, even when the caller did not say.
     *
     * Only the repair job page ever sent `repairBookingId`, so live tracking
     * existed exclusively while a technician happened to be looking at that one
     * screen. Everywhere else they publish position — the dashboard's
     * continuous feed while online, the socket ping, the order job page — the
     * ping carried an `orderId` or nothing at all, and the customer watching a
     * repair saw "Live map starts as soon as their phone reports in" forever.
     *
     * The worker's active repair is a fact the SERVER can look up, so it does.
     * Every publisher that already exists now feeds repairs too, with no client
     * change and nothing new to keep in sync — the alternative was a
     * `currentRepairBookingId` column that four call sites would have to
     * remember to set and clear.
     *
     * Still scoped to this technician and still limited to statuses where they
     * are genuinely travelling: a repair job must never become a tracking
     * device.
     */
    const booking = repairBookingId
      ? await RepairBooking.findOne({ _id: repairBookingId, workerId })
        .select('status userId location').lean()
      : await RepairBooking.findOne({ workerId, status: { $in: REPAIR_MOVING_STATUSES } })
        .sort({ updatedAt: -1 })
        .select('status userId location').lean();

    const repairBookingIdResolved = booking?._id;

    if (booking && REPAIR_MOVING_STATUSES.includes(booking.status)) {
      await redis.publish(
        'order:event',
        JSON.stringify({
          orderId: String(repairBookingIdResolved),
          event: 'worker.location',
          payload: { lng, lat, at: Date.now() },
        }),
      ).catch(() => {});

      /**
       * The same ETA engine orders use.
       *
       * It is keyed by an id and publishes to this same room, so a repair needs
       * nothing of its own — only the destination cached once and a position to
       * measure from. Personalised smoothed speed far out, traffic-aware near,
       * throttled and delta-suppressed: all of that is already built and was
       * simply never pointed at repairs.
       */
      const etaService = require('./eta.service');
      const dest = booking.location?.coordinates;
      if (Array.isArray(dest) && dest.length === 2) {
        etaService.cacheOrderPickup(repairBookingIdResolved, dest[1], dest[0])
          .then(() => etaService.computeAndBroadcast({
            orderId: String(repairBookingIdResolved),
            workerId,
            workerLat: lat,
            workerLng: lng,
            orderUserId: booking.userId,
          }))
          .catch(() => { /* an ETA is a nicety; never fail a location ping for it */ });
      }
    }
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
   * Repair work counts too.
   *
   * This only ever aggregated `Order`, so a technician whose whole day was
   * phone, laptop or vehicle repairs opened their earnings screen and saw ₹0.
   * It was not a fetching problem — the repair collection was simply never
   * asked.
   *
   * `splitFor` is the same function the settlement run uses, so the number on
   * screen and the number actually paid cannot drift apart.
   */
  const { RepairBooking } = require('../repair/models/booking.model');
  const { splitFor } = require('../repair/services/settlement.service');

  const repairs = await RepairBooking.find({
    workerId: wid, status: 'COMPLETED', completedAt: { $gte: since },
  }).select('priceSnapshot paymentMethod completedAt').lean();

  let repairEarnings = 0;
  let repairCommission = 0;
  let repairCash = 0;
  for (const b of repairs) {
    const split = splitFor(b);
    repairEarnings += split.providerPaise;
    repairCommission += split.platformPaise;
    if (b.paymentMethod === 'cash') repairCash += 1;
  }

  const jobs = summary.jobs + repairs.length;
  const earningsPaise = Math.round(summary.earningsPaise + repairEarnings);
  const commissionPaise = Math.round(summary.commissionPaise + repairCommission);

  // Repair days folded into the same series, so the chart matches the total
  // above it rather than telling a second, smaller story.
  const byDay = new Map(daily.map((d) => [d._id, { date: d._id, jobs: d.jobs, earningsPaise: Math.round(d.earningsPaise) }]));
  for (const b of repairs) {
    if (!b.completedAt) continue;
    const key = new Date(b.completedAt).toISOString().slice(0, 10);
    const row = byDay.get(key) || { date: key, jobs: 0, earningsPaise: 0 };
    row.jobs += 1;
    row.earningsPaise += splitFor(b).providerPaise;
    byDay.set(key, row);
  }

  return {
    range,
    since,
    jobs,
    earningsPaise,
    earningsRupees: Math.round(earningsPaise / 100),
    commissionPaidPaise: commissionPaise,
    avgEarningPerJobRupees: jobs > 0 ? Math.round(earningsPaise / jobs / 100) : 0,
    cashJobs: summary.cashJobs + repairCash,
    onlineJobs: summary.onlineJobs + (repairs.length - repairCash),
    dailyBreakdown: [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, earningsPaise: Math.round(d.earningsPaise) })),
    /** Split out so a technician can see where the money came from. */
    breakdown: {
      orders: { jobs: summary.jobs, earningsPaise: Math.round(summary.earningsPaise) },
      repairs: { jobs: repairs.length, earningsPaise: Math.round(repairEarnings) },
    },
  };
}

module.exports = { goOnline, goOffline, updateLocation, getEarnings };
