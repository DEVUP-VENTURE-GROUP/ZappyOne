const crypto = require('crypto');
const orderRepo = require('../order.repository');
const pricingService = require('../../pricing/pricing.service');
const geoService = require('../../worker/geo.service');
const abuseService = require('../abuse.service');
const User = require('../../user/user.model');
const { dispatchQueue, emergencyDispatchQueue } = require('../../../jobs');
const { redis } = require('../../../config/redis');
const appConfig = require('../../../config');
const logger = require('../../../core/logger');
const zoneService = require('../../zone/zone.service');

/** Placing a service order: abuse gates, zone gate, locked price, OTP, dispatch. */

/**
 * Create a new service request.
 * 1. Abuse checks (rate cap, freeze from prior rapid-cancels).
 * 2. Reject if user has an active order (one-at-a-time semantic).
 * 3. Compute pricing snapshot and lock it.
 * 4. Generate 4-digit OTP for on-site worker verification.
 * 5. Enqueue dispatch — the dispatcher takes it from here.
 */
const TIER_MULTIPLIERS = { standard: 1.0, priority: 1.2, express: 1.4 };

async function createOrder({ userId, service, subCategory, pickupLocation, dropLocation, description, images, scheduledAt, paymentMethod, priority, promoCode,
  deviceBrand, deviceModel, deviceSeries, partsTier, serviceMode, vehicleType, pricingModel, estimatedHours,
  teamSize, diagnosisAnswers, diagnosisUrgency, quotedTotalRupees, tier, tipAmount,
  preferredWorkerId, preferredShopId, fulfillmentMode,
}) {
  await zoneService.assertBookableLocation(pickupLocation);

  // Shop-routed booking ("Nearby Shops" path) — validate the shop is real,
  // discoverable and actually offers this service before we spend a dispatch
  // cycle on it.
  let resolvedShop = null;
  if (preferredShopId) {
    const Shop = require('../../shop/shop.model');
    resolvedShop = await Shop.findById(preferredShopId).select('isActive isBlocked kyc services').lean();
    if (!resolvedShop || !resolvedShop.isActive || resolvedShop.isBlocked || resolvedShop.kyc?.status !== 'approved') {
      throw Object.assign(new Error('This shop is not currently available for booking.'), { status: 400, code: 'SHOP_UNAVAILABLE' });
    }
    if (Array.isArray(resolvedShop.services) && resolvedShop.services.length && !resolvedShop.services.includes(service)) {
      throw Object.assign(new Error('This shop does not offer the selected service.'), { status: 400, code: 'SHOP_SERVICE_MISMATCH' });
    }
  }
  const resolvedFulfillmentMode = fulfillmentMode === 'pickup_at_shop' && preferredShopId ? 'pickup_at_shop' : 'on_site';
  // Dispatch queue depth circuit breaker — shed load before the queue backs up
  // and adds latency to ALL in-flight orders. (#62/#63)
  // Emergency orders bypass the cap — they're always urgent.
  const DISPATCH_QUEUE_HARD_CAP = appConfig.dispatch.queueCap;
  if (priority !== 'emergency') {
    try {
      const waitingCount = await dispatchQueue.getWaitingCount();
      if (waitingCount >= DISPATCH_QUEUE_HARD_CAP) {
        throw Object.assign(
          new Error('Service is at capacity. Please try again in a few minutes.'),
          { status: 503, code: 'QUEUE_AT_CAPACITY', waitingJobs: waitingCount }
        );
      }
    } catch (err) {
      if (err.code === 'QUEUE_AT_CAPACITY') throw err;
      // Redis error checking queue depth — fail open, don't block orders
    }
  }

  // Geo-readiness check: if there are zero approved workers within 25km of the
  // pickup location, fail fast with a user-friendly message instead of creating
  // an order that will sit in 'searching' until the 5-minute dispatch window
  // exhausts and then silently fails.
  // Geo-readiness fast-fail: if there are zero skilled workers near the pickup,
  // reject in seconds with a clear message instead of letting the order sit in
  // 'searching' for the full window and then silently failing.
  //
  // Precedence: ADMIN config (Pricing → Supply Guard) → env override → NODE_ENV.
  // Admin wins so this can be killed instantly from the dashboard if it starts
  // rejecting real bookings — on thin day-1 supply that is the fastest way to lose
  // a paying customer, and SSH + .env + restart is not an acceptable response time.
  const _geoCfg = await pricingService.getActiveConfig().catch(() => ({}));
  const geoCheckEnabled = _geoCfg.geoReadinessEnabled != null
    ? _geoCfg.geoReadinessEnabled
    : (process.env.GEO_READINESS_CHECK != null
      ? process.env.GEO_READINESS_CHECK === 'true'
      : process.env.NODE_ENV === 'production');
  const geoReadinessKm = _geoCfg.geoReadinessKm ?? appConfig.dispatch.geoReadinessKm;

  if (!scheduledAt && geoCheckEnabled) {
    try {
      const candidates = await geoService.findCandidates({
        lat: pickupLocation.lat,
        lng: pickupLocation.lng,
        skill: service,
        radiusKm: geoReadinessKm,
        shopId: preferredShopId || undefined,
      });
      if (candidates.length === 0) {
        throw Object.assign(
          preferredShopId
            ? new Error('This shop has no available workers right now. Please try another shop or Zappy Express.')
            : new Error('No service providers are available in your area right now. Please try again later or schedule for a future time.'),
          { status: 503, code: 'NO_WORKERS_IN_AREA' }
        );
      }
    } catch (err) {
      if (err.code === 'NO_WORKERS_IN_AREA') throw err;
      // Redis/geo error — fail open, let dispatch handle it
    }
  }

  // Abuse gate FIRST — cheap Redis checks before any Mongo writes.
  await abuseService.assertCanBook(userId);

  // One-at-a-time semantic — only one non-terminal order per user at a time.
  // Scheduled orders are exempt: they don't occupy the user's "slot" until dispatch.
  // Redis lock prevents the TOCTOU race where two concurrent requests both pass the
  // findActiveByUser check before either order is persisted.
  let _orderCreateLockKey   = null;
  let _orderCreateLockToken = null;
  if (!scheduledAt) {
    _orderCreateLockKey   = `order:create:lock:${userId}`;
    _orderCreateLockToken = crypto.randomBytes(16).toString('hex');
    const acquired = await redis.set(_orderCreateLockKey, _orderCreateLockToken, 'NX', 'PX', 15000);
    if (!acquired) {
      throw Object.assign(
        new Error('Another order is being placed for your account. Please wait a moment.'),
        { status: 409, code: 'ORDER_CREATE_IN_PROGRESS' }
      );
    }
    const existingActive = await orderRepo.findActiveByUser(userId);
    if (existingActive) {
      redis.eval(
        `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`,
        1, _orderCreateLockKey, _orderCreateLockToken
      ).catch(() => {});
      throw Object.assign(
        new Error('You already have an active order. Complete or cancel it before placing a new one.'),
        { status: 409, code: 'ACTIVE_ORDER_EXISTS', activeOrderId: String(existingActive._id) }
      );
    }
  }

  // Towing must have a destination — the tow leg (pickup → destination) is what
  // we charge for, so without it the price would be meaningless.
  if ((service === 'car_towing' || service === 'bike_towing') && !dropLocation) {
    throw Object.assign(
      new Error('Please select where to tow the vehicle before booking.'),
      { status: 400, code: 'TOWING_DEST_REQUIRED' }
    );
  }

  const origin = { lat: pickupLocation.lat, lng: pickupLocation.lng };
  // For home services without a drop location, use a tiny 50m nominal dest so
  // the pricing engine can call getDistanceAndEta without a zero-distance edge
  // case, but the resulting distanceFee is negligible (0.05km × perKmRate ≈ ₹0–1).
  // Previously this was 0.01° (~1.11km) which inflated quotes by ₹10-20 on every
  // home service booking.
  const dest = dropLocation
    ? { lat: dropLocation.lat, lng: dropLocation.lng }
    : { lat: pickupLocation.lat + 0.00045, lng: pickupLocation.lng }; // ~50m nominal

  let pricing = await Promise.race([
    pricingService.quote({ origin, dest, service, userId, priority, vehicleType, deviceBrand, deviceModel, deviceSeries, partsTier, pricingModel, estimatedHours }),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(Object.assign(new Error('Pricing service timed out. Please try again.'), { status: 503, code: 'PRICING_TIMEOUT' })),
        appConfig.dispatch.pricingTimeoutMs,
      );
    }),
  ]);

  // Pick & Go — customer brings the item to the shop themselves, so there's no
  // travel leg to charge for. Strip the distance fee before it flows into the
  // tier/tip/team/commission math below (all of which operate on pricing.total).
  if (resolvedFulfillmentMode === 'pickup_at_shop') {
    const distanceFeePaise = pricing.paise?.distanceFee ?? Math.round((pricing.distanceFee || 0) * 100);
    if (distanceFeePaise > 0) {
      const newTotalPaise = Math.max(0, (pricing.paise?.total ?? Math.round(pricing.total * 100)) - distanceFeePaise);
      pricing = {
        ...pricing,
        distanceFee: 0,
        distanceKm: 0,
        total: Math.round(newTotalPaise / 100),
        paise: { ...(pricing.paise || {}), distanceFee: 0, total: newTotalPaise },
      };
    }
  }

  // Apply tier multiplier (standard 1.0×, priority 1.2×, express 1.4×).
  // This must happen BEFORE surge protection so quotedTotalRupees comparison is apples-to-apples
  // (client sends the tier-adjusted price as quotedTotalRupees).
  const resolvedTier = TIER_MULTIPLIERS[tier] != null ? tier : 'standard';
  const tierMultiplier = TIER_MULTIPLIERS[resolvedTier];
  if (tierMultiplier > 1) {
    const basePaise = pricing.paise?.total ?? Math.round((pricing.total || 0) * 100);
    const tieredPaise = Math.round(basePaise * tierMultiplier);
    pricing = {
      ...pricing,
      total: Math.round(tieredPaise / 100),
      tierMultiplier,
      paise: { ...(pricing.paise || {}), total: tieredPaise },
    };
  } else {
    pricing = { ...pricing, tierMultiplier: 1.0 };
  }

  // Apply tip/boost to total (100% goes to worker).
  const tipRupees = tipAmount > 0 ? Math.round(Number(tipAmount)) : 0;
  const tipPaise  = tipRupees * 100;
  if (tipPaise > 0) {
    pricing = {
      ...pricing,
      total:     pricing.total + tipRupees,
      tipPaise,
      boostedTotal: pricing.total + tipRupees,
      paise: { ...(pricing.paise || {}), total: (pricing.paise?.total ?? pricing.total * 100) + tipPaise },
    };
  }

  // Team pricing: multiply base price by number of workers required.
  // Each worker earns independently — pricing scales linearly with team size.
  const resolvedTeamSize = Math.min(Math.max(Number(teamSize) || 1, 1), 20);
  if (resolvedTeamSize > 1) {
    const basePaise = pricing.paise?.total ?? Math.round((pricing.total || 0) * 100);
    const teamPaise = basePaise * resolvedTeamSize;
    pricing = {
      ...pricing,
      total: Math.round(teamPaise / 100),
      teamSize: resolvedTeamSize,
      paise: { ...(pricing.paise || {}), total: teamPaise },
    };
  }

  // Commission rate snapshot is taken AFTER all discounts/surcharges are applied
  // so the rate is locked against the final amount the customer actually pays.
  // (Promo discount applied below will update totalPaise; this snapshot happens first
  // to avoid a second async call — the RATE is what we're snapshotting, not the amount.)
  const earningPreview = await pricingService.calculateEarnings({
    totalPaise: Math.round((pricing.total || 0) * 100),
    workerId: null, // worker unknown yet; Pro discount applied separately at settlement
  });
  pricing = {
    ...pricing,
    totalPaise: Math.round((pricing.total || 0) * 100),
    snapshotCommissionRate: earningPreview.commissionRate,
  };

  // Surge price protection: re-validate fresh price against what customer was quoted.
  // Admin-configurable tolerance (default 10%); cached config — not an extra DB hit.
  if (quotedTotalRupees != null && quotedTotalRupees > 0) {
    const freshTotal = pricing.total || 0;
    const priceIncreasePct = (freshTotal - quotedTotalRupees) / quotedTotalRupees;
    const surgeCfg = await pricingService.getActiveConfig();
    const surgeTolerance = surgeCfg.surgeTolerancePct ?? 0.10;
    if (priceIncreasePct > surgeTolerance) {
      throw Object.assign(
        new Error(`Price changed since your quote (was ₹${quotedTotalRupees}, now ₹${Math.round(freshTotal)}). Please re-check the new price.`),
        { status: 409, code: 'PRICE_CHANGED', quotedTotal: quotedTotalRupees, freshTotal: Math.round(freshTotal), tolerancePct: surgeTolerance }
      );
    }
  }

  // Emergency mode — 1.5× surcharge + dispatch priority flag
  const isEmergency = priority === 'emergency';
  if (isEmergency) {
    const emergencyService = require('../emergency.service');
    pricing = emergencyService.applyEmergencySurcharge(pricing);
  }

  // Record demand for surge calculation + durable heatmap/intelligence analytics.
  // Pass `service` so DemandEvent.service is populated (was previously null,
  // breaking by-service demand/trending analytics).
  await pricingService.recordDemand(origin.lat, origin.lng, service);

  // Apply promo code discount
  let appliedPromo = null;
  if (promoCode) {
    try {
      const promoService = require('../../promo/promo.service');
      appliedPromo = await promoService.applyPromo({
        code: promoCode,
        userId,
        orderTotalPaise: Math.round((pricing.total || 0) * 100),
        service,
      });
      // Apply discount and switch to coupon commission rate.
      // Platform absorbs the coupon marketing cost; worker keeps a larger share
      // on coupon orders (15% vs 30% standard). This incentivises workers to
      // accept coupon orders and keeps the math transparent.
      const discountRupees  = appliedPromo.discountPaise / 100;
      const discountedTotal = Math.max(0, pricing.total - discountRupees);

      // Re-snapshot commission at the lower coupon rate
      const cfg = await pricingService.getActiveConfig();
      const couponRate = cfg.couponCommissionRate ?? 0.15;

      pricing = {
        ...pricing,
        total:                  discountedTotal,
        totalPaise:             Math.round(discountedTotal * 100),
        subtotalBeforeDiscount: pricing.total,       // pre-discount (analytics)
        discountPaise:          appliedPromo.discountPaise,
        snapshotCommissionRate: couponRate,           // override with lower coupon rate
        paise: { ...(pricing.paise || {}), total: Math.round(discountedTotal * 100) },
      };
    } catch (err) {
      // Invalid promo codes are a soft fail — order proceeds at full price
      logger.warn({ userId, promoCode, err: err.message }, 'Promo code rejected at order creation');
      appliedPromo = null;
    }
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  // Check for any deferred cancellation fees from previous orders — will be collected after creation
  const shieldService = require('../shield.service');
  const { totalPaise: pendingCancellationFeePaise } = await shieldService.getPendingFee(userId).catch(() => ({ totalPaise: 0 }));

  const order = await orderRepo.create({
    userId,
    service,
    subCategory: subCategory || undefined,
    description,
    images: images || [],
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    priority: isEmergency ? 'emergency' : 'normal',
    tier: resolvedTier,
    pickupLocation: {
      type: 'Point',
      coordinates: [pickupLocation.lng, pickupLocation.lat],
      address: pickupLocation.address,
      landmark: pickupLocation.landmark,
      flatNumber: pickupLocation.flatNumber,
      notes: pickupLocation.notes,
    },
    dropLocation: dropLocation
      ? {
          type: 'Point',
          coordinates: [dropLocation.lng, dropLocation.lat],
          address: dropLocation.address,
        }
      : undefined,
    pricing,
    status: 'created',
    statusHistory: [{ status: 'created' }],
    payment: { method: paymentMethod || 'upi', status: 'pending' },
    promoCode: appliedPromo ? appliedPromo.code : undefined,
    discountPaise: appliedPromo ? appliedPromo.discountPaise : 0,
    otp,
    // Vertical-specific fields
    ...(deviceBrand && { deviceBrand }),
    ...(deviceModel && { deviceModel }),
    ...(deviceSeries && { deviceSeries }),
    ...(partsTier && { partsTier }),
    ...(pricing && pricing.warrantyDays != null && { partWarrantyDays: pricing.warrantyDays }),
    ...(serviceMode && { serviceMode }),
    ...(preferredShopId && { preferredShopId, fulfillmentMode: resolvedFulfillmentMode }),
    ...(vehicleType && { vehicleType }),
    ...(pricingModel && { pricingModel }),
    ...(estimatedHours && { estimatedHours }),
    ...(teamSize && teamSize > 1 && { teamSize: Math.min(Number(teamSize) || 1, 20) }),
    ...(diagnosisAnswers && { diagnosisAnswers }),
    ...(diagnosisUrgency && diagnosisUrgency !== 'normal' && { diagnosisUrgency }),
    ...(pendingCancellationFeePaise > 0 && { pendingCancellationFeePaise }),
    // Customer-picked pro (worker-choice) — dispatch offers them first.
    ...(preferredWorkerId && /^[a-f0-9]{24}$/i.test(String(preferredWorkerId)) && {
      dispatch: { customerPreferredWorkerId: preferredWorkerId },
    }),
  });

  // Order persisted — release the per-user creation lock so the user can create another order
  // once this one completes/cancels (without this, the 15s TTL is the safety net).
  if (_orderCreateLockKey) {
    redis.eval(
      `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`,
      1, _orderCreateLockKey, _orderCreateLockToken
    ).catch(() => {});
  }

  // Collect deferred cancellation fees now that we have the orderId
  if (pendingCancellationFeePaise > 0) {
    shieldService.collectPendingFees(userId, order._id).catch((err) =>
      logger.warn({ err: err.message, userId, orderId: order._id }, 'Deferred shield fee collection failed at order creation')
    );
  }

  // Record where this customer actually was — guaranteed for every order
  // regardless of client (the previous mechanism was an explicit endpoint a
  // screen had to remember to call separately; most orders never called it).
  if (pickupLocation.address) {
    User.recordRecentLocation(userId, {
      address: pickupLocation.address,
      lat: pickupLocation.lat,
      lng: pickupLocation.lng,
    }).catch((err) =>
      logger.warn({ err: err.message, userId, orderId: order._id }, 'recordRecentLocation failed at order creation')
    );
  }

  // Record promo usage after order is persisted
  if (appliedPromo) {
    const promoService = require('../../promo/promo.service');
    promoService.recordUsage({
      code: appliedPromo.code,
      userId,
      orderId: order._id,
      discountPaise: appliedPromo.discountPaise,
    }).catch((err) => logger.warn({ err: err.message, promoCode: appliedPromo.code }, 'Promo usage record failed'));
  }

  // Enqueue dispatch with optional delay for scheduled orders.
  // Emergency orders go to a dedicated queue with reserved BullMQ concurrency slots
  // so they are never blocked behind regular orders filling all 50 worker slots.
  const schedDelay = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;
  const targetQueue = isEmergency ? emergencyDispatchQueue : dispatchQueue;
  await targetQueue.add(
    'dispatch',
    { orderId: String(order._id), attempt: 0, isEmergency: !!isEmergency },
    {
      jobId: `order_${order._id}`,
      priority: isEmergency ? 1 : resolvedTier === 'express' ? 2 : resolvedTier === 'priority' ? 5 : 10,
      delay: schedDelay,
    }
  );

  logger.info({ orderId: order._id, service, userId, priority: order.priority }, 'Order created and dispatch enqueued');

  // Notify user: order placed
  const notificationService = require('../../notification/notification.service');
  const notifyBody = scheduledAt
    ? `Your ${service.replace('_', ' ')} is scheduled for ${new Date(scheduledAt).toLocaleString('en-IN')}`
    : `Your ${service.replace('_', ' ')} request is being matched`;
  notificationService.notify({
    recipient: { kind: 'user', id: userId },
    type: 'order_placed',
    title: scheduledAt ? 'Booking scheduled' : 'Finding a nearby worker',
    body: notifyBody,
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});

  // Fraud: velocity-abuse check (non-blocking — must not delay order response).
  require('../../fraud/fraud.service').detectVelocityAbuse(userId).catch(() => {});

  return order;
}

module.exports = {
  createOrder,
};
