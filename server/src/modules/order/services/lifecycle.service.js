const orderRepo = require('../order.repository');
const Order = require('../order.model');
const pricingService = require('../../pricing/pricing.service');
const geoService = require('../../worker/geo.service');
const Worker = require('../../worker/worker.model');
const { redis } = require('../../../config/redis');
const logger = require('../../../core/logger');

/** The worker's side of a live order: accept, travel, arrive, start, complete. */

/**
 * Worker accepts a broadcast offer.
 * Broadcast model: all workers in the current radius batch receive the offer
 * simultaneously. Any of them can signal accept — dispatch process locks the
 * first one atomically.
 */
async function acceptOffer({ orderId, workerId }) {
  // Parallel fetch — both reads needed before we can proceed.
  const [order, worker] = await Promise.all([
    orderRepo.findById(orderId),
    Worker.findById(workerId).select('isBlocked isOnline').lean(),
  ]);

  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.status !== 'searching') {
    throw Object.assign(new Error('Offer no longer available'), { status: 410 });
  }
  if (!worker || worker.isBlocked || !worker.isOnline) {
    throw Object.assign(new Error('Worker not eligible to accept orders'), { status: 403 });
  }

  // Signal the dispatch worker — it owns the atomic lock (first accept wins).
  await redis.publish(
    `dispatch:accepted:${orderId}`,
    JSON.stringify({ workerId, at: new Date().toISOString() })
  );
  return { ok: true };
}

async function rejectOffer({ orderId, workerId }) {
  const order = await orderRepo.findById(orderId);
  if (!order) return { ok: true };
  if (order.status !== 'searching') return { ok: true };
  await redis.publish(
    `dispatch:rejected:${orderId}`,
    JSON.stringify({ workerId })
  );
  return { ok: true };
}

/**
 * Worker transitions: assigned → on_the_way → arrived → in_progress → completed.
 * Each transition is guarded by the current status to prevent races.
 */
async function workerStartTrip({ orderId, workerId, workerLat, workerLng }) {
  const order = await guardedTransition(orderId, workerId, ['assigned'], 'on_the_way');

  if (order?.pickupLocation?.coordinates) {
    const [pLng, pLat] = order.pickupLocation.coordinates;
    const etaService = require('../../worker/eta.service');
    etaService.cacheOrderPickup(String(order._id), pLat, pLng).catch(() => {});

    // Compute ETA from worker's current GPS to pickup using haversine + 25 km/h urban speed.
    // Store deadline on the order so penalty calculation is deterministic at arrival.
    let tripEtaMinutes = null;
    if (workerLat != null && workerLng != null) {
      const { haversineKm } = require('../../worker/maps.service');
      const distKm = haversineKm({ lat: workerLat, lng: workerLng }, { lat: pLat, lng: pLng });
      tripEtaMinutes = Math.max(1, Math.ceil((distKm / 25) * 60)); // 25 km/h urban average
    }

    const now = new Date();
    const deadlineMs = tripEtaMinutes ? now.getTime() + tripEtaMinutes * 60_000 : null;

    await Order.findByIdAndUpdate(orderId, {
      $set: {
        tripStartedAt:  now,
        ...(tripEtaMinutes != null && { tripEtaMinutes }),
        ...(deadlineMs    != null && { tripDeadlineAt: new Date(deadlineMs) }),
      },
    });

    // Emit ETA to customer's order room so they see it immediately
    if (tripEtaMinutes != null) {
      redis.publish('order:event', JSON.stringify({
        orderId: String(orderId),
        event: 'order.eta',
        payload: { etaMinutes: tripEtaMinutes },
      })).catch(() => {});
    }
  }

  // Notify worker: you have X minutes to arrive
  if (order.tripEtaMinutes || order._doc?.tripEtaMinutes) {
    const notificationService = require('../../notification/notification.service');
    const eta = order.tripEtaMinutes;
    if (eta) {
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type: 'trip_started',
        title: `Trip started — arrive in ${eta} min`,
        body: `Customer is waiting. Arrive within ${eta} minutes to avoid a late-arrival deduction.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId: String(orderId), etaMinutes: String(eta) },
      }).catch(() => {});
    }
  }

  return order;
}

// Max distance (km) between worker's GPS and pickup pin to mark arrived.
// Frontend soft-caps at 100 m (button disabled beyond that); backend enforces
// the same threshold as the source of truth so a Postman/curl client can't
// bypass the client-side fence.
const ARRIVE_WARN_KM  = 0.050;
const ARRIVE_BLOCK_KM = 0.100;

async function workerArrive({ orderId, workerId, workerLat, workerLng }) {
  const order = await orderRepo.findByIdLean(orderId);
  if (order?.pickupLocation?.coordinates) {
    // Resolve worker position: body first, then last known Redis GPS ping.
    // The Redis fallback closes the pre-existing bypass where the client
    // simply omitted lat/lng and the check silently no-op'd.
    let lat = workerLat;
    let lng = workerLng;
    if (lat == null || lng == null) {
      const pos = await geoService.getWorkerPosition(workerId).catch(() => null);
      if (pos) { lat = pos.lat; lng = pos.lng; }
    }
    if (lat == null || lng == null) {
      throw Object.assign(
        new Error('GPS location required to mark arrived. Enable location and try again.'),
        { status: 400, code: 'WORKER_LOCATION_REQUIRED' },
      );
    }

    const [pickupLng, pickupLat] = order.pickupLocation.coordinates;
    const { haversineKm } = require('../../worker/maps.service');
    const distKm = haversineKm({ lat, lng }, { lat: pickupLat, lng: pickupLng });
    if (distKm > ARRIVE_BLOCK_KM) {
      logger.warn(
        { workerId, orderId, distKm: distKm.toFixed(3) },
        '[ARRIVE] Worker too far from pickup — possible GPS spoof',
      );
      throw Object.assign(
        new Error(`You are ${Math.round(distKm * 1000)}m from the pickup location. Get closer before marking arrived.`),
        { status: 409, code: 'WORKER_TOO_FAR', distanceMetres: Math.round(distKm * 1000) },
      );
    }
    if (distKm > ARRIVE_WARN_KM) {
      logger.info({ workerId, orderId, distKm: distKm.toFixed(3) }, '[ARRIVE] Worker arrived with marginal GPS accuracy');
    }
  }
  const arrivedOrder = await guardedTransition(orderId, workerId, ['on_the_way'], 'arrived');

  // Record arrival time and compute late penalty
  const arrivedAt = new Date();
  const updates = { tripArrivedAt: arrivedAt };

  // Fetch stored deadline + penalty rate
  try {
    const freshOrder = await Order.findById(orderId).select('tripDeadlineAt tripEtaMinutes').lean();
    if (freshOrder?.tripDeadlineAt) {
      const deadlineMs  = new Date(freshOrder.tripDeadlineAt).getTime();
      const lateMs      = arrivedAt.getTime() - deadlineMs;
      const cfg         = await pricingService.getActiveConfig();
      const graceMs     = (cfg.lateArrivalGraceMinutes ?? 2) * 60_000;
      const penaltyRate = cfg.lateArrivalPenaltyPaisePerMin ?? 200;

      if (lateMs > graceMs && penaltyRate > 0) {
        const lateMinutes   = Math.ceil((lateMs - graceMs) / 60_000);
        const penaltyPaise  = lateMinutes * penaltyRate;
        updates.tripLateMinutes           = lateMinutes;
        updates.lateArrivalPenaltyPaise   = penaltyPaise;

        logger.info({ orderId, workerId, lateMinutes, penaltyPaise }, '[ARRIVE] Late arrival — penalty will be deducted at settlement');

        // Warn worker immediately
        const notificationService = require('../../notification/notification.service');
        notificationService.notify({
          recipient: { kind: 'worker', id: workerId },
          type: 'late_arrival_penalty',
          title: `Late by ${lateMinutes} min — ₹${Math.round(penaltyPaise / 100)} deducted`,
          body: `You arrived ${lateMinutes} minute${lateMinutes > 1 ? 's' : ''} late. ₹${Math.round(penaltyPaise / 100)} will be deducted from this job's earnings.`,
          deepLink: `/worker/jobs/${orderId}`,
          data: { orderId: String(orderId), penaltyPaise: String(penaltyPaise), lateMinutes: String(lateMinutes) },
        }).catch(() => {});

        // Real-time socket alert to worker's job page
        const { redis } = require('../../../config/redis');
        redis.publish('order:event', JSON.stringify({
          orderId: String(orderId),
          event: 'order.late_penalty',
          payload: { lateMinutes, penaltyPaise, penaltyRupees: Math.round(penaltyPaise / 100) },
        })).catch(() => {});
      } else {
        updates.tripLateMinutes = 0;
        updates.lateArrivalPenaltyPaise = 0;
      }
    }
  } catch (err) {
    logger.warn({ orderId, err: err.message }, '[ARRIVE] Penalty calculation failed — skipping');
  }

  await Order.findByIdAndUpdate(orderId, { $set: updates });
  return arrivedOrder;
}

async function workerStartService({ orderId, workerId, otp }) {
  const order = await orderRepo.findById(orderId).select('+otp');
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (order.status !== 'arrived') {
    throw Object.assign(new Error(`Cannot start from ${order.status}`), { status: 409 });
  }
  if (order.otp !== otp) {
    throw Object.assign(new Error('Invalid OTP'), { status: 401 });
  }
  return guardedTransition(orderId, workerId, ['arrived'], 'in_progress');
}

// Per-service minimum durations (seconds). Flat 60s was trivially bypassed.
// Workers who mark complete before these thresholds are flagged for review.
const SERVICE_MIN_DURATION_SEC = {
  // Mobile repairs — physical component work, cannot be done in seconds
  screen_replacement:     20 * 60,  // 20 min minimum
  battery_replacement:    15 * 60,
  charging_issue:         10 * 60,
  speaker_mic_issue:      10 * 60,
  microphone_issue:       10 * 60,
  software_issue:         15 * 60,
  water_damage:           20 * 60,
  camera_issue:           15 * 60,
  data_recovery:          30 * 60,
  device_not_turning_on:  15 * 60,
  // Laptop repairs
  laptop_slow:            20 * 60,
  laptop_ssd_upgrade:     30 * 60,
  laptop_ram_upgrade:     20 * 60,
  laptop_keyboard_issue:  25 * 60,
  laptop_motherboard_issue: 45 * 60,
  laptop_charging_issue:  20 * 60,
  laptop_screen_issue:    30 * 60,
  laptop_virus_removal:   30 * 60,
  laptop_data_recovery:   30 * 60,
  // Smart devices
  smart_tv_install:       20 * 60,
  smart_tv_repair:        20 * 60,
  cctv_install:           30 * 60,
  // Vehicle
  puncture:                8 * 60,  // tyre repair ~8 min
  bike_service:           30 * 60,
  car_service:            45 * 60,
  car_detailing:          60 * 60,
  // Default for anything not listed
  _default:               90,       // 90 seconds — enough for delivery/companion services
};

// Services that require at least 1 completion photo (proof of work).
const PHOTO_REQUIRED_SERVICES = new Set([
  'screen_replacement', 'battery_replacement', 'charging_issue',
  'speaker_mic_issue', 'microphone_issue', 'software_issue',
  'water_damage', 'camera_issue', 'data_recovery', 'device_not_turning_on',
  'laptop_slow', 'laptop_ssd_upgrade', 'laptop_ram_upgrade',
  'laptop_keyboard_issue', 'laptop_motherboard_issue', 'laptop_charging_issue',
  'laptop_screen_issue', 'laptop_virus_removal', 'laptop_data_recovery',
  'smart_tv_install', 'smart_tv_repair', 'cctv_install', 'cctv_repair',
  'smart_lock_install', 'puncture', 'car_puncture', 'bike_breakdown',
  'car_breakdown', 'battery_jump_start',
]);

async function workerComplete({ orderId, workerId, completionPhotos = [] }) {
  const orderCheck = await orderRepo.findByIdLean(orderId);
  if (!orderCheck) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(orderCheck.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  if (!['in_progress', 'arrived'].includes(orderCheck.status)) {
    throw Object.assign(new Error(`Cannot complete from status: ${orderCheck.status}`), { status: 409 });
  }

  // Test 37: Service-specific minimum duration.
  const minDurationSec = SERVICE_MIN_DURATION_SEC[orderCheck.service] ?? SERVICE_MIN_DURATION_SEC._default;
  const startedEntry = [...(orderCheck.statusHistory || [])].reverse()
    .find((h) => h.status === 'in_progress');
  if (startedEntry) {
    const elapsedSec = (Date.now() - new Date(startedEntry.at).getTime()) / 1000;
    if (elapsedSec < minDurationSec) {
      const mins = Math.ceil(minDurationSec / 60);
      throw Object.assign(
        new Error(`This service requires at least ${mins} minutes. ${Math.ceil((minDurationSec - elapsedSec) / 60)} more minute(s) remaining.`),
        { status: 409, code: 'TOO_EARLY_COMPLETE', elapsedSec: Math.round(elapsedSec), minDurationSec }
      );
    }
  }

  // Test 37: Require completion photos for repair/installation services.
  if (PHOTO_REQUIRED_SERVICES.has(orderCheck.service) && completionPhotos.length === 0) {
    throw Object.assign(
      new Error('This service requires at least 1 completion photo as proof of work.'),
      { status: 400, code: 'COMPLETION_PHOTO_REQUIRED' }
    );
  }

  const order = await guardedTransition(
    orderId,
    workerId,
    ['in_progress', 'arrived'],
    'completed',
    { completedAt: new Date(), ...(completionPhotos.length ? { completionPhotos } : {}) }
  );

  // --- Earnings: Pro-aware commission split ---
  // Use totalPaise field for precision; fall back to total*100 for old orders.
  const totalPaise = order.pricing.totalPaise ?? Math.round(order.pricing.total * 100);
  // Pass the snapshotted commission rate so admin changes mid-order don't affect
  // this order's split. Pro discount is still applied on top of the snapshot.
  const earnings = await pricingService.calculateEarnings({
    totalPaise,
    workerId,
    snapshotCommissionRate: order.pricing.snapshotCommissionRate,
  });

  const walletService = require('../../wallet/wallet.service');
  const Transaction = require('../../payment/transaction.model');

  const paymentMethod = order.payment?.method || 'upi';
  const isCash = paymentMethod === 'cash';

  // ============================================================
  // ONLINE (UPI/card): user paid platform, platform credits worker
  //   - user side: charge was already captured (or will be via webhook)
  //   - worker gets ₹(total - commission) credited
  //   - platform books commission revenue
  //
  //   If the wallet is negative (existing dues), the credit naturally
  //   clears dues first because it's summed into the balance. Example:
  //     balance = -300, earning = 700 → new balance = 400
  //   No special code needed — that's how integer math works.
  //
  // CASH: user paid worker directly in cash, worker keeps full amount
  //   - worker's pocket: +total (not tracked in our system)
  //   - platform commission must be RECOVERED from wallet
  //   - worker wallet: DEBITED by commission (may go negative)
  //   - platform books commission revenue (same as online)
  // ============================================================

  // Persist earnings split on the order for analytics/audit.
  await orderRepo.model().findByIdAndUpdate(order._id, {  // eslint-disable-line
    $set: {
      earnings: {
        workerPaise:    earnings.workerPaise,
        platformPaise:  earnings.platformPaise,
        commissionRate: earnings.commissionRate,
        settledAt:      new Date(),
      },
    },
  });

  if (isCash) {
    // Record the fact that worker collected cash (information ledger row,
    // no balance movement on our side — money is already in their pocket).
    await Transaction.create({
      type: 'credit',
      owner: { kind: 'worker', id: workerId },
      amountPaise: 0, // informational — 0 balance effect
      reason: Transaction.REASONS.WORKER_EARNING,
      refOrderId: order._id,
      idempotencyKey: `cashrecord:${order._id}`,
      description: `Cash collected from customer: ₹${Math.round(totalPaise / 100)}`,
      metadata: { fullOrderPaise: totalPaise, paymentMethod: 'cash' },
      status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });

    // DEBIT commission from worker wallet — may push it negative.
    // If they exceed hard limit the debit throws; we still mark the order
    // complete and record the attempted debit in the audit trail so admin
    // can reconcile. In practice hard-limit workers won't be dispatched
    // (matcher filter + goOnline guard), so this is a defensive path.
    try {
      await walletService.apply({
        kind: 'worker',
        id: workerId,
        type: 'debit',
        amountPaise: earnings.platformPaise,
        reason: Transaction.REASONS.PLATFORM_COMMISSION,
        idempotencyKey: `commission:${order._id}`,
        refs: { orderId: order._id },
        description: `Commission @ ${(earnings.commissionRate * 100).toFixed(1)}% on cash order`,
      });
    } catch (err) {
      if (err.code === 'WALLET_HARD_LIMIT') {
        // Edge case — log and continue. Admin can pursue recovery.
        logger.error(
          { workerId, orderId, hardLimitBreach: true },
          'Cash commission debit blocked by hard limit — order completed but commission unrecovered'
        );
      } else {
        throw err;
      }
    }

    // Soft-limit warning — if balance just crossed -₹200, notify the worker.
    const duesService = require('../../worker/worker-dues.service');
    duesService.getDuesStatus(workerId).then((dues) => {
      if (dues.status === 'warning' || dues.status === 'blocked') {
        const notificationService = require('../../notification/notification.service');
        notificationService.notify({
          recipient: { kind: 'worker', id: workerId },
          type: 'wallet_credited',
          title: dues.status === 'blocked' ? '🚫 Wallet blocked — add funds now' : '⚠️ Low wallet balance',
          body: dues.status === 'blocked'
            ? `Your dues (₹${dues.duesPaise / 100}) exceed the limit. Top up to continue working.`
            : `Your wallet balance is ₹${dues.balancePaise / 100}. Add funds to avoid being blocked.`,
          deepLink: '/wallet',
          data: { duesPaise: dues.duesPaise, status: dues.status },
        }).catch(() => {});
      }
    }).catch(() => {});
    // Mark the order payment status appropriately
    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    order.payment.transactionId = `cash:${order._id}`;
    await order.save();
  } else {
    // ONLINE flow — credit the worker; ledger row naturally clears any dues.
    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: earnings.workerPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `earning:${order._id}`,
      refs: { orderId: order._id },
      description: `Earning for ${order.service} order`,
    });
  }

  // Platform commission revenue — booked once regardless of payment method.
  await Transaction.create({
    type: 'credit',
    owner: { kind: 'platform', id: null },
    amountPaise: earnings.platformPaise,
    reason: Transaction.REASONS.PLATFORM_COMMISSION,
    refOrderId: order._id,
    idempotencyKey: `platform:commission:${order._id}`,
    description: `Commission @ ${(earnings.commissionRate * 100).toFixed(1)}% (${paymentMethod})`,
  }).catch((e) => { if (e.code !== 11000) throw e; });

  // High-demand accept bonus — platform-funded incentive that grew as dispatch
  // widened the search. Paid on COMPLETION (never on accept) so it can't be farmed
  // by accept-then-cancel. Idempotent; applies to both cash and online orders.
  const urgencyBonusPaise = order.dispatch?.urgencyBonusPaise || 0;
  if (urgencyBonusPaise > 0) {
    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: urgencyBonusPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `urgencybonus:${order._id}`,
      refs: { orderId: order._id },
      description: 'High-demand accept bonus',
    }).catch((err) => logger.warn({ err: err.message, orderId: order._id }, 'Urgency bonus credit failed'));
  }

  // ZeroWait Ready bonus — paid for pre-accepting (instant match). Also on
  // COMPLETION only, so Ready Mode can't be farmed by auto-accept-then-cancel.
  const readyBonusPaise = order.dispatch?.readyBonusPaise || 0;
  if (readyBonusPaise > 0) {
    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: readyBonusPaise,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `readybonus:${order._id}`,
      refs: { orderId: order._id },
      description: 'Ready Mode instant-accept bonus',
    }).catch((err) => logger.warn({ err: err.message, orderId: order._id }, 'Ready bonus credit failed'));
  }

  // Release the worker (denormalized counters)
  await Worker.updateOne(
    { _id: workerId },
    {
      $set: { isAvailable: true, currentOrderId: null },
      $inc: {
        totalJobs: 1,
        completedJobs: 1,
        /**
         * Paise, like every other money field.
         *
         * This wrote RUPEES while the training bonus path wrote paise into
         * the same counter and both dashboards divide by 100 to display it —
         * so a worker's lifetime earnings read 100x short for every job they
         * completed. Historical values are repaired from the transaction
         * ledger by migrations/repair-wallet-units.js.
         */
        'wallet.totalEarnings': earnings.workerPaise,
      },
    }
  );
  await geoService.setAvailability(workerId, true);

  // User gamification — award XP for completed order
  const gamificationService = require('../../engagement/user-gamification.service');
  gamificationService.onOrderCompleted({
    userId: order.userId,
    workerRatingGiven: order.workerRating || null,
  }).catch((err) => logger.warn({ err: err.message, orderId: order._id }, 'Gamification update failed'));

  // Rewards — redeemable points + a scratch card for the completed order.
  require('../../rewards/rewards.service').onOrderCompleted({
    userId: order.userId,
    orderTotalPaise: order.pricing?.totalPaise ?? Math.round((order.pricing?.total || 0) * 100),
    orderId: order._id,
  }).catch((err) => logger.warn({ err: err.message, orderId: order._id }, 'Rewards update failed'));

  // Incentive milestone check — passes the order so the service can enforce
  // the quality gate (no milestone credit for unrated or 1-star completions).
  const incentiveService = require('../../worker/incentive.service');
  Worker.findById(workerId).select('completedJobs rating').lean().then((w) => {
    if (!w) return;
    return incentiveService.onJobCompleted({
      workerId,
      completedJobs: w.completedJobs,
      workerRating: w.rating,
      orderId: String(order._id),
    });
  }).catch((err) =>
    logger.error({ err: err.message, orderId: order._id }, 'Incentive check failed')
  );

  // --- Post-completion side-effects (best-effort, non-blocking) ---
  const cashbackService    = require('../../wallet/cashback.service');
  const referralService    = require('../../referral/referral.service');
  const notificationService = require('../../notification/notification.service');

  /* Shift slot progress tracking */
  const availService = require('../../worker/availability.service');
  const [wLng, wLat] = order.pickupLocation.coordinates;
  availService.onOrderCompleted({
    workerId,
    lat: wLat, lng: wLng,
    earningsPaise: earnings.workerPaise,
  }).catch(() => {});

  /* Wellness check — detects burnout, may send intervention notification */
  const wellnessService = require('../../worker/wellness.service');
  wellnessService.checkAndMaybeIntervene(workerId).catch(() => {});

  /* Service Memory — record appliance/home history for customer */
  const serviceMemoryService = require('../../service/service-memory.service');
  serviceMemoryService.recordServiceCompletion({ order }).catch((err) =>
    logger.warn({ err: err.message, orderId: order._id }, 'ServiceMemory record failed')
  );

  /* Warranty Card — issue if service has warranty */
  const verticalConfigService = require('../../service/vertical-config.service');
  verticalConfigService.getConfig('mobile').then(async (mobileCfg) => {
    const warrantyDays = mobileCfg?.warrantyDays || 0;
    const WARRANTED_SERVICES = new Set([
      // Electronics — all repairs carry a warranty
      'screen_replacement', 'battery_replacement', 'charging_issue',
      'speaker_mic_issue', 'microphone_issue', 'software_issue',
      'water_damage', 'camera_issue', 'data_recovery', 'device_not_turning_on',
      'laptop_slow', 'laptop_ssd_upgrade', 'laptop_ram_upgrade',
      'laptop_keyboard_issue', 'laptop_motherboard_issue', 'laptop_charging_issue',
      'laptop_screen_issue', 'laptop_virus_removal', 'laptop_data_recovery',
      'smart_tv_repair', 'router_setup', 'cctv_install', 'cctv_repair',
      'smart_lock_install',
    ]);
    if (WARRANTED_SERVICES.has(order.service) && warrantyDays > 0) {
      const warrantyService = require('../../service/warranty.service');
      warrantyService.issueWarranty({ order, warrantyDays }).catch(() => {});
    }
  }).catch(() => {});

  /* Emergency Fund — contribute 0.5% of platform commission to worker mutual aid */
  const emergencyFundService = require('../../worker/emergency-fund.service');
  emergencyFundService.contributeFromOrder(earnings.platformPaise).catch(() => {});

  // Cashback to user
  cashbackService.applyForOrder(order).catch((err) =>
    logger.error({ err: err.message, orderId: order._id }, 'Cashback failed')
  );

  // Referral reward (if this was the referee's first completed order)
  referralService.onRefereeFirstOrder({
    refereeKind: 'user',
    refereeId: order.userId,
    orderId: order._id,
  }).catch((err) =>
    logger.error({ err: err.message, orderId: order._id }, 'Referral check failed')
  );

  // Notifications — both parties
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_completed',
    title: '🎉 Service completed',
    body: `Your ${order.service.replace('_', ' ')} order is done. Tap to rate.`,
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});

  notificationService.notify({
    recipient: { kind: 'worker', id: workerId },
    type: 'order_completed',
    title: '✅ Job completed',
    body: `₹${Math.round(earnings.workerPaise / 100)} credited to your wallet`,
    deepLink: '/wallet',
  }).catch(() => {});

  // Rating request — sent 2 min after completion to avoid race with celebration screen
  setTimeout(() => {
    notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type: 'rating_request',
      title: '⭐ How was your service?',
      body: `Rate your ${order.service.replace(/_/g, ' ')} — it only takes 5 seconds.`,
      deepLink: `/orders/${order._id}`,
      data: { orderId: String(order._id) },
    }).catch(() => {});
  }, 2 * 60 * 1000);

  // Re-engagement trigger: schedule a "book again" nudge for 7 days later.
  // Only fires if the user hasn't placed another order in that window.
  // Uses a Redis deferred key so we don't need a cron job.
  const reengagementKey = `reengagement:${order.userId}:scheduled`;
  redis.set(reengagementKey, String(order._id), 'EX', 7 * 24 * 3600, 'NX').catch(() => {});
  // The BullMQ notifications worker can check this key on a daily scan,
  // but for now the key acts as a signal for the next time the user opens the app.

  return order;
}

async function guardedTransition(orderId, workerId, allowedFrom, toStatus, extra = {}) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (String(order.workerId) !== String(workerId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }
  const updated = await orderRepo.transitionStatus(orderId, allowedFrom, toStatus, extra);
  if (!updated) {
    throw Object.assign(new Error(`Invalid transition from ${order.status} to ${toStatus}`), { status: 409 });
  }

  // Broadcast to order room for real-time UI updates.
  redis.publish(
    'order:event',
    JSON.stringify({
      orderId: String(orderId),
      event: 'order.status',
      payload: { status: toStatus, at: new Date().toISOString() },
    })
  ).catch(() => {});

  // Per-status push notifications to the user (the worker sees status in-app)
  const notificationService = require('../../notification/notification.service');
  const notifMap = {
    on_the_way: {
      type: 'worker_on_the_way',
      title: '🛵 Worker is on the way',
      body: 'Your worker has started the trip',
    },
    arrived: {
      type: 'worker_arrived',
      title: '📍 Worker has arrived',
      body: 'Share your 6-digit OTP with the worker to start the service',
    },
  };
  const n = notifMap[toStatus];
  if (n) {
    notificationService.notify({
      recipient: { kind: 'user', id: updated.userId },
      type: n.type,
      title: n.title,
      body: n.body,
      deepLink: `/orders/${updated._id}`,
      data: { orderId: String(updated._id) },
    }).catch(() => {});
  }

  return updated;
}

module.exports = {
  acceptOffer,
  rejectOffer,
  workerStartTrip,
  workerArrive,
  workerStartService,
  workerComplete,
  guardedTransition,
};
