/**
 * Dispatch Worker — Progressive Radius Broadcast + Force-Assign Engine
 * ----------------------------------------------------------------------------
 * Flow:
 *   1. Transition order to 'searching'.
 *   2. Walk RADIUS_STEPS: 50m → 100m → 250m → 500m → 1km → 2km → 3.5km → 5km → 8km → 12km
 *      Total voluntary window = 10 steps × 30s = exactly 5 minutes.
 *   3. At each step, find ALL available SKILLED workers in that radius
 *      (excluding already-notified ones) and broadcast simultaneously.
 *   4. If no workers at a step, wait the minimum window (10s) before expanding.
 *   5. First voluntary accept wins — locked with atomic Mongo transaction.
 *   6. After 5 minutes with no accept → FORCE-ASSIGN nearest SKILLED worker (no skill bypass).
 *   7. If force-assign fails → re-queue with 90s delay (max 2 retries).
 *   8. Only mark failed after all retries and force-assign attempts exhausted.
 *
 * Business rules:
 *   - Workers must have kyc.status === 'approved' (enforced by geo.service)
 *   - Workers must have rating >= DISPATCH_MIN_WORKER_RATING (enforced by geo.service)
 *   - Skill filter is NEVER bypassed — wrong-skill assignment is prevented at all layers
 *   - Workers on dues hard-limit are blocked from dispatch (enforced by geo.service)
 *   - Workers with high cancel/reject rates are deprioritized by scoring (enforced by geo.service)
 *   - Preferred worker (user's last completed worker) gets priority at step 0
 * ----------------------------------------------------------------------------
 */

require('dotenv').config();
const { Worker: BullWorker } = require('bullmq');
const { createBullConnection, redis } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const Order = require('../modules/order/order.model');
const WorkerModel = require('../modules/worker/worker.model');
const geoService = require('../modules/worker/geo.service');
const config = require('../config');
const logger = require('../core/logger');
const { haversineKm } = require('../core/geo/distance');
const { QUEUES, notificationsQueue, dispatchQueue, emergencyDispatchQueue } = require('./index');
const pricingService = require('../modules/pricing/pricing.service');
const { tryInstantMatch, persistUrgencyBonus } = require('./dispatch/instant');
const { getPreferredWorker, offerToWorker, attemptForceAssign, onOrderAssigned, waitForBatchWindow } = require('./dispatch/offers');
const { processTeamSlot, lockOrderToWorker } = require('./dispatch/team');
const { MAX_BATCH_SIZE, MAX_RETRIES, RETRY_DELAY_MS, MIN_STEP_WAIT_MS, INSTANT_SKIP_STEPS, recordOutcomes, sleep, markOrderFailed, emitToOrderRoom } = require('./dispatch/common');

/* Main job processor */

async function processDispatchJob(job) {
  const { orderId, retryCount = 0 } = job.data;
  const jobStartMs = Date.now();

  logger.info({ orderId, retryCount }, '[DISPATCH] Job picked up');

  // Kill-switch: admin can pause dispatch without stopping the BullMQ process.
  // Jobs are re-queued with a 60s delay and drain normally once re-enabled.
  const cfg = await pricingService.getActiveConfig();
  if (!cfg.dispatchEnabled) {
    logger.warn({ orderId }, '[DISPATCH] Dispatch paused by admin — re-queuing in 60s');
    const pausedTargetQueue = job.data.isEmergency ? emergencyDispatchQueue : dispatchQueue;
    await pausedTargetQueue.add('dispatch', job.data, { delay: 60_000 });
    return { ok: false, reason: 'dispatch_paused' };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    logger.warn({ orderId }, '[DISPATCH] Order not found, dropping');
    return { ok: false, reason: 'order_not_found' };
  }

  // Team slot: fill an additional worker slot on an already-assigned team order
  if (job.data.isTeamSlot) {
    return processTeamSlot(order, job);
  }

  if (!['created', 'searching'].includes(order.status)) {
    logger.info({ orderId, status: order.status }, '[DISPATCH] Order not dispatchable');
    return { ok: false, reason: 'bad_status' };
  }

  /* Transition to searching */
  if (order.status === 'created') {
    order.status = 'searching';
    order.statusHistory.push({ status: 'searching' });
    await order.save();
    await emitToOrderRoom(order._id, 'order.status', { status: 'searching' });
  }

  const [lng, lat] = order.pickupLocation.coordinates;

  /* ZeroWait: INSTANT MATCH (Ready Pool)
   * Every competitor pays an offer→accept round-trip: publish the job, then wait
   * for a human to tap Accept. That round-trip is the floor on match speed.
   *
   * Workers in Ready Mode have ALREADY pre-accepted this kind of job (their skill,
   * their radius, time-boxed). So we can lock one atomically — no offer, no tap,
   * no wait. Sub-second assignment. If the pool is empty we fall straight through
   * to the normal acceptance-first dispatch below, so this is purely additive.  */
  // Shop-routed orders (customer picked a specific shop, or a worker handed the
  // job off mid-job) must stay with that shop's own workers — the Ready Pool is
  // an open, shop-agnostic pool, so instant match is skipped for these entirely.
  if (!order.preferredShopId) {
    const instant = await tryInstantMatch(order, cfg, lng, lat, jobStartMs);
    if (instant.ok) return instant;
  }

  /* Per-zone concurrency throttle
   * When 100+ orders land in the same geo-bucket (warehouse, event, dense zone),
   * all their dispatches hit the same ~50 workers simultaneously. Workers get
   * flooded with offers, ignore most, and all 100 re-dispatch — storm.
   *
   * Cap: max 20 active dispatches per zone-bucket at any moment.
   * Orders beyond the cap wait 10s and retry — they naturally stagger out.
   *
   * Zone bucket = 0.02° lat/lng ≈ 2km × 2km cell. Coarser than the surge bucket
   * (0.01°) to provide broader protection.
   */
  const ZONE_DISPATCH_CAP   = 20;   // max concurrent dispatches per 2km cell
  const ZONE_DISPATCH_DELAY = 10_000; // ms to wait before retry if zone is full
  const zoneBucket = `${(lat / 0.02).toFixed(0)}:${(lng / 0.02).toFixed(0)}`;
  const zoneKey    = `dispatch:zone:${zoneBucket}`;

  try {
    const zoneCount = await redis.incr(zoneKey);
    await redis.expire(zoneKey, 120); // auto-expire if something goes wrong
    if (zoneCount > ZONE_DISPATCH_CAP) {
      await redis.decr(zoneKey); // we're not proceeding, give the slot back
      logger.info({ orderId, zoneBucket, zoneCount }, '[DISPATCH] Zone at capacity — re-queuing in 10s');
      await dispatchQueue.add('dispatch', job.data, { delay: ZONE_DISPATCH_DELAY });
      return { ok: false, reason: 'zone_throttled', zoneBucket };
    }
  } catch (_) { /* Redis error — proceed without throttle, fail open */ }

  // Decrement zone counter when this job exits (success or failure).
  const releaseZoneSlot = () => redis.decr(zoneKey).catch(() => {});
  try {
  const radiusSteps = config.dispatch.radiusSteps;

  // Tier-aware dispatch windows.
  // Express: 15s per step, 60s total before force-assign (worker within 1 min guaranteed).
  // Priority: 25s per step, 2 min total.
  // Standard: config default (35s per step, 5 min total).
  const orderTier = order.tier || 'standard';
  const stepWindowMs = orderTier === 'express'
    ? 15000
    : orderTier === 'priority'
      ? 25000
      : (config.dispatch.stepWindowMs ?? 20_000); // default 20s — workers respond in <10s if at all
  const minSearchMs = orderTier === 'express'
    ? (cfg.tierExpressMaxSearchMs ?? 60000)
    : orderTier === 'priority'
      ? (cfg.tierPriorityMaxSearchMs ?? 120000)
      : config.dispatch.minSearchMs;

  const alreadyNotified = new Set(
    (order.dispatch?.attemptedWorkerIds || []).map(String)
  );

  /* Background listener: worker comes online mid-dispatch
   * If a worker was offline when their radius step ran, they'd normally be
   * missed until force-assign. This subscriber receives `worker:came_online:{skill}`
   * events (published by geo.service.markOnline) and offers immediately if the
   * worker is within the radius we've already searched.
   * The offer fires in parallel — it does NOT interrupt the main step loop.
   */
  let _cameOnlineSub = null;
  let _latestOrderPayload = null;  // kept in sync as each step builds the payload
  let _maxSearchedKm = 0;          // grows as we walk steps

  try {
    _cameOnlineSub = createBullConnection();
    await _cameOnlineSub.subscribe(`worker:came_online:${order.service}`);

    _cameOnlineSub.on('message', async (_ch, raw) => {
      try {
        const { workerId: wId, lat: wLat, lng: wLng } = JSON.parse(raw);
        const wIdStr = String(wId);
        if (alreadyNotified.has(wIdStr)) return;
        if (!_latestOrderPayload) return;
        // Shop-scoped orders can't offer to whoever just came online — only
        // workers tagged to the chosen shop are eligible (mirrors the shopId
        // filter applied in the step loop below).
        if (order.preferredShopId) {
          const stillShopWorker = await WorkerModel.exists({ _id: wId, shopId: order.preferredShopId });
          if (!stillShopWorker) return;
        }

        // Only offer if this worker is within the radius we've already searched
        const distKm = haversineKm(lat, lng, wLat, wLng);
        if (distKm > _maxSearchedKm) return;

        alreadyNotified.add(wIdStr);
        logger.info({ orderId, workerId: wIdStr, distKm: distKm.toFixed(2) },
          '[DISPATCH] Worker came online mid-dispatch — offering immediately');

        await redis.publish('worker:offer', JSON.stringify({
          workerId: wIdStr,
          order:    _latestOrderPayload,
        }));
      } catch { /* best-effort */ }
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Could not subscribe to worker:came_online — continuing without it');
  }

  const releaseCameOnlineSub = () => {
    if (_cameOnlineSub) {
      _cameOnlineSub.unsubscribe().catch(() => {});
      _cameOnlineSub.quit().catch(() => {});
      _cameOnlineSub = null;
    }
  };

  /* Preferred worker: user's last accepted worker for same service */
  const preferredWorkerId = await getPreferredWorker(order);
  if (preferredWorkerId) {
    logger.info({ orderId, preferredWorkerId }, '[DISPATCH] Offering preferred worker first');
    const result = await offerToWorker(order, preferredWorkerId, stepWindowMs);
    if (result.accepted) {
      const locked = await lockOrderToWorker(order._id, preferredWorkerId, order.service);
      if (locked) {
        await onOrderAssigned(order, preferredWorkerId, []);
        recordOutcomes(preferredWorkerId, 'accept', [], []);
        return { ok: true, workerId: preferredWorkerId, preferred: true };
      }
    }
    alreadyNotified.add(String(preferredWorkerId));
  }

  /* Acceptance-first controls (all admin-tunable via pricing config) */
  const urgencyOn      = cfg.urgencyBonusEnabled !== false;
  const urgencyStart   = cfg.urgencyBonusStartStep ?? 4;
  const urgencyStep    = cfg.urgencyBonusStepPaise ?? 500;
  const urgencyMax     = cfg.urgencyBonusMaxPaise ?? 3000;
  const bestFirstOn    = cfg.bestFirstEnabled !== false;
  const bestFirstTopN  = Math.max(1, cfg.bestFirstTopN ?? 1);
  const bestFirstMs    = cfg.bestFirstWindowMs ?? 8000;
  let   bestFirstDone  = false;         // head-start only runs once (first productive step)
  let   activeUrgencyBonusPaise = 0;    // bonus in effect at the moment of accept
  // Tracks the customer's boost so a mid-search raise can re-open the job (see loop).
  let   lastBoostPaise = order.pricing?.tipPaise || 0;

  /* Growing "high-demand" accept bonus — the wider we search, the higher the
   * voluntary-accept incentive. Platform-funded, shown in the offer, credited on
   * completion (anti-farming). This is what replaces coercive force-assign.
   *
   * TIER-SCALED (L0): an Express customer pays +40%, so the worker's incentive
   * scales too — otherwise a paid tier looks IDENTICAL to a worker and nothing
   * makes them prefer it. Express also starts its bonus at step 0 (no slow ramp),
   * so the fastest tier is also the most attractive job on the board. */
  const tierBonusMult = orderTier === 'express'
    ? (cfg.tierBonusMultiplierExpress ?? 2.0)
    : orderTier === 'priority'
      ? (cfg.tierBonusMultiplierPriority ?? 1.5)
      : 1.0;
  const effUrgencyStart = (orderTier === 'express' && cfg.expressBonusFromStep0 !== false)
    ? 0
    : urgencyStart;

  /* L3 — Predictive positioning: if this cell is under-supplied (demand > supply),
   * every offer here carries an extra bonus. Workers already nearby earn more for
   * taking it, and idle workers elsewhere can see the hot cell in their app and
   * move toward it. Supply follows demand instead of us hoping it's already there. */
  const zoneBonusPaise = await pricingService
    .zoneGapBonusPaise(lat, lng, cfg)
    .catch(() => 0);
  if (zoneBonusPaise > 0) {
    logger.info({ orderId, zoneBonusPaise }, '[ZEROWAIT] Under-supplied zone — positioning bonus applied');
  }

  const urgencyBonusForStep = (stepIdx) => {
    const base = (urgencyOn && stepIdx >= effUrgencyStart)
      ? Math.round(Math.min((stepIdx - effUrgencyStart + 1) * urgencyStep, urgencyMax) * tierBonusMult)
      : 0;
    return base + zoneBonusPaise;
  };

  /* A boost must RE-OPEN the search, not just tweak a popup that happens to be
   * on screen. Customers boost precisely when they've been waiting — by which
   * point the radius walk is usually finished and dispatch is idling in the
   * min-search hold, so the money bought nothing. Wrapping the walk + hold in a
   * round loop lets a boost restart the search at the new price: everyone is
   * re-offered and gets a fresh popup + alert. Capped so it can't spin. */
  const MAX_BOOST_ROUNDS = 3;
  let boostRounds = 0;

  boostRound:                                     // eslint-disable-line no-labels
  for (;;) {

  /* Walk radius steps (voluntary accept window) */
  for (let stepIdx = 0; stepIdx < radiusSteps.length; stepIdx++) {
    const radiusKm = radiusSteps[stepIdx];

    const keepAlive = setInterval(
      () => job.updateProgress({ step: stepIdx, alive: true }).catch(() => {}),
      60_000,
    );

    try {
      // Re-read pricing too, not just status. The customer can BOOST the offer
      // mid-search; the in-memory `order` doc was loaded once at job start, so
      // without this every later batch of workers was still shown the OLD price.
      const fresh = await Order.findById(orderId).select('status pricing').lean();
      if (!fresh || fresh.status !== 'searching') {
        logger.info({ orderId, status: fresh?.status }, '[DISPATCH] Order no longer searching, stopping');
        releaseCameOnlineSub(); // don't leak the Redis subscriber on an aborted dispatch
        return { ok: false, reason: 'status_changed' };
      }
      if (fresh.pricing) order.pricing = fresh.pricing; // keep the offer payload current

      // Customer raised the price → give EVERYONE a fresh look, including workers
      // who already passed at the lower price. Re-opening the job is the entire
      // point of a boost; otherwise the money buys nothing.
      const freshBoostPaise = fresh.pricing?.tipPaise || 0;
      if (freshBoostPaise > lastBoostPaise) {
        logger.info(
          { orderId, fromPaise: lastBoostPaise, toPaise: freshBoostPaise, reOffering: alreadyNotified.size },
          '[DISPATCH] 💰 Offer boosted mid-search — re-opening to workers who already passed',
        );
        lastBoostPaise = freshBoostPaise;
        alreadyNotified.clear();
      }

      const elapsedMs = Date.now() - jobStartMs;
      logger.info(
        { orderId, stepIdx: stepIdx + 1, totalSteps: radiusSteps.length, radiusKm, elapsedSec: Math.round(elapsedMs / 1000) },
        `[DISPATCH] Step ${stepIdx + 1}/${radiusSteps.length} — searching ${radiusKm}km`,
      );

      const radiusLabel = radiusKm < 1 ? `${Math.round(radiusKm * 1000)}m` : `${radiusKm}km`;
      const userMsg = stepIdx === 0
        ? 'Searching for nearby workers…'
        : `Expanding search to ${radiusLabel} — still looking…`;

      await emitToOrderRoom(order._id, 'order.dispatch_update', {
        message: userMsg,
        radiusKm,
        radiusLabel,
        step: stepIdx + 1,
        totalSteps: radiusSteps.length,
        elapsedSec: Math.round(elapsedMs / 1000),
      });

      const candidates = await geoService.findCandidates({
        lng, lat,
        skill: order.service,
        excludeIds: [...alreadyNotified],
        radiusKm,
        shopId: order.preferredShopId || undefined,
      });

      logger.info(
        { orderId, radiusKm, found: candidates.length, alreadyNotified: alreadyNotified.size },
        `[DISPATCH] Workers found: ${candidates.length}`,
      );

      if (candidates.length === 0) {
        // Early small-radius steps: skip instantly (no workers within 500m is normal).
        if (stepIdx < INSTANT_SKIP_STEPS) {
          logger.info({ orderId, radiusKm, stepIdx }, '[DISPATCH] No workers — instant skip (early step)');
          continue;
        }

        // After notifying at least one worker, check if ANY new workers exist
        // at the maximum radius before wasting time on remaining steps.
        // If max-radius scan is also empty, all available workers are already
        // notified — bail out and go straight to force-assign / hold.
        if (alreadyNotified.size > 0) {
          const anyLeft = await geoService.findCandidates({
            lng, lat,
            skill:      order.service,
            excludeIds: [...alreadyNotified],
            radiusKm:   radiusSteps.at(-1),
            shopId:     order.preferredShopId || undefined,
          });
          if (anyLeft.length === 0) {
            logger.info(
              { orderId, alreadyNotified: alreadyNotified.size },
              '[DISPATCH] All available workers already notified — stopping expansion early',
            );
            break; // fall through to force-assign / min-search hold
          }
        }

        const waitMs = Math.min(MIN_STEP_WAIT_MS, stepWindowMs);
        logger.info({ orderId, radiusKm, waitMs }, '[DISPATCH] No workers, holding before next step');
        await sleep(waitMs);
        continue;
      }

      // Update background listener's view of "how far we've searched so far"
      _maxSearchedKm = Math.max(_maxSearchedKm, radiusKm);

      const batchWorkers = candidates.slice(0, MAX_BATCH_SIZE).map(String);
      const expiresAt = new Date(Date.now() + stepWindowMs);

      // High-demand accept bonus for this radius step (grows as we widen).
      activeUrgencyBonusPaise = urgencyBonusForStep(stepIdx);

      logger.info(
        { orderId, radiusKm, notifying: batchWorkers.length, urgencyBonusPaise: activeUrgencyBonusPaise },
        `[DISPATCH] Notifying ${batchWorkers.length} workers`,
      );

      const boostAmountPaise = order.pricing?.tipPaise || 0;
      const boostedTotal = order.pricing?.boostedTotal || order.pricing?.total || 0;

      // Shared offer payload (best-first head-start + broadcast reuse the same card).
      const orderPayload = {
        _id:             String(order._id),
        service:         order.service,
        pickupAddress:   order.pickupLocation.address,
        pickupCoords:    order.pickupLocation.coordinates,
        price:           boostedTotal,          // workers see boosted price
        basePrice:       order.pricing?.total || 0,
        boostAmountPaise,                        // explicit boost so worker UI can highlight it
        urgencyBonusPaise: activeUrgencyBonusPaise, // platform accept bonus, grows with search
        distanceKm:      order.pricing?.distanceKm
          ? parseFloat(order.pricing.distanceKm).toFixed(1)
          : null,
        etaMinutes:      order.pricing?.etaMinutes || null,
        expiresAt:       expiresAt.toISOString(),
        tier:            order.tier || 'standard',
        tierMultiplier:  order.pricing?.tierMultiplier || 1.0,
        // Job context — worker reads these to prepare before arriving
        description:     order.description || null,
        images:          (order.images || []).slice(0, 3), // max 3 thumbnails in offer card
        diagnosisUrgency: order.diagnosisUrgency || 'normal',
        requiredTools:   order.requiredTools || [],
        vehicleType:     order.vehicleType || null,
        deviceBrand:     order.deviceBrand || null,
      };
      // Keep the background (came-online) listener's payload current.
      _latestOrderPayload = orderPayload;

      /* P2: best-first head-start
       * Give the top-scored pro(s) a short EXCLUSIVE window before the broadcast,
       * so the best-ranked worker wins — not merely whoever taps first. Runs once,
       * on the first productive step. Falls through to broadcast if they pass.     */
      if (bestFirstOn && !bestFirstDone && candidates.length > 1) {
        bestFirstDone = true;
        for (const topId of candidates.slice(0, bestFirstTopN).map(String)) {
          if (alreadyNotified.has(topId)) continue;
          const hsExpires = new Date(Date.now() + bestFirstMs);
          await Order.updateOne({ _id: order._id }, {
            $set: {
              'dispatch.currentOfferWorkerId': topId,
              'dispatch.currentOfferWorkerIds': [topId],
              'dispatch.offerExpiresAt': hsExpires,
            },
          }).catch(() => {});
          await redis.publish('worker:offer', JSON.stringify({
            workerId: topId,
            order: { ...orderPayload, expiresAt: hsExpires.toISOString(), preferred: true },
          }));
          notificationsQueue.add('worker_offer', { workerId: topId, orderId: String(order._id) }).catch(() => {});
          alreadyNotified.add(topId);

          const hs = await waitForBatchWindow(String(order._id), [topId], bestFirstMs);
          if (hs.acceptedBy) {
            const locked = await lockOrderToWorker(order._id, hs.acceptedBy, order.service);
            if (locked) {
              logger.info({ orderId, workerId: hs.acceptedBy }, '[DISPATCH] Assigned via best-first head-start');
              await persistUrgencyBonus(order._id, activeUrgencyBonusPaise);
              releaseCameOnlineSub();
              await onOrderAssigned(order, hs.acceptedBy, []);
              recordOutcomes(hs.acceptedBy, 'accept', [], []);
              return { ok: true, workerId: hs.acceptedBy, bestFirst: true };
            }
          }
          recordOutcomes(null, null, [], [topId]); // top pro passed → count as ignore, continue to broadcast
        }
      }

      logger.info(
        { orderId, radiusKm, notifying: batchWorkers.length },
        `[DISPATCH] Notifying ${batchWorkers.length} workers`,
      );

      // Store the FULL current batch on the order so all notified workers can
      // pass the socket auth check (order:subscribe) and call accept/reject.
      // currentOfferWorkerId stays as the primary (first) for backwards compat.
      await Order.updateOne({ _id: order._id }, {
        $set: {
          'dispatch.currentOfferWorkerId': batchWorkers[0],
          'dispatch.currentOfferWorkerIds': batchWorkers,
          'dispatch.offerExpiresAt': expiresAt,
        },
      }).catch(() => {});

      // Notify user-side UI: workers have been found and notified at this step.
      await emitToOrderRoom(order._id, 'order.workers_notified', {
        count:          batchWorkers.length,
        radiusKm,
        boostAmountPaise,
      });

      // Publish offers + enqueue notifications in parallel batches.
      // addBulk is a single Redis transaction vs N individual LPUSH calls.
      const pubMessages = batchWorkers.map((workerId) =>
        redis.publish('worker:offer', JSON.stringify({ workerId, order: orderPayload }))
      );
      const notifJobs = batchWorkers.map((workerId) => ({
        name: 'worker_offer',
        data: { workerId, orderId: String(order._id) },
      }));

      batchWorkers.forEach((id) => alreadyNotified.add(id));

      await Promise.all([
        Promise.allSettled(pubMessages),                    // socket fan-out
        notificationsQueue.addBulk(notifJobs).catch(() => {}), // push notifications — single Redis tx
      ]);

      const result = await waitForBatchWindow(String(order._id), batchWorkers, stepWindowMs);

      logger.info(
        {
          orderId, radiusKm,
          acceptedBy: result.acceptedBy,
          rejected:   result.rejected.length,
          ignored:    result.ignored.length,
        },
        '[DISPATCH] Step window closed',
      );

      if (result.acceptedBy) {
        const locked = await lockOrderToWorker(order._id, result.acceptedBy, order.service);
        if (locked) {
          logger.info({ orderId, workerId: result.acceptedBy }, '[DISPATCH] Order assigned via accept');
          await persistUrgencyBonus(order._id, activeUrgencyBonusPaise);
          releaseCameOnlineSub();
          await onOrderAssigned(order, result.acceptedBy, [...result.rejected, ...result.ignored]);
          recordOutcomes(result.acceptedBy, 'accept', result.rejected, result.ignored);
          return { ok: true, workerId: result.acceptedBy };
        }
        logger.warn({ orderId, workerId: result.acceptedBy }, '[DISPATCH] Lock failed after accept, continuing');
      }

      recordOutcomes(null, null, result.rejected, result.ignored);
      await Order.updateOne(
        { _id: order._id },
        { $addToSet: { 'dispatch.attemptedWorkerIds': { $each: batchWorkers } } },
      );
    } finally {
      clearInterval(keepAlive);
    }
  }

  /* Guarantee minimum search window before giving up */
  const elapsedMs = Date.now() - jobStartMs;
  const remainingMs = minSearchMs - elapsedMs;
  if (remainingMs > 0) {
    logger.info(
      { orderId, remainingMs: Math.round(remainingMs / 1000) },
      '[DISPATCH] Radius steps done early — holding for minimum search window',
    );
    await emitToOrderRoom(order._id, 'order.dispatch_update', {
      message: 'Still searching — please hold…',
      radiusKm: config.dispatch.radiusSteps.at(-1),
    });

    // Poll every 10s for cancellation AND for a boost. A boost here is the common
    // case (the customer has been waiting), and previously it was ignored entirely.
    const holdStart = Date.now();
    let restart = false;
    while (Date.now() - holdStart < remainingMs) {
      await sleep(Math.min(10_000, remainingMs - (Date.now() - holdStart)));
      const check = await Order.findById(orderId).select('status pricing').lean();
      if (!check || check.status !== 'searching') {
        releaseCameOnlineSub();
        return { ok: false, reason: 'status_changed_during_hold' };
      }

      const boostNow = check.pricing?.tipPaise || 0;
      if (boostNow > lastBoostPaise && boostRounds < MAX_BOOST_ROUNDS) {
        lastBoostPaise = boostNow;
        boostRounds += 1;
        order.pricing = check.pricing;      // broadcast the NEW price
        alreadyNotified.clear();            // everyone gets another look
        bestFirstDone = true;               // skip the head-start — reach everyone fast
        await Order.updateOne(
          { _id: order._id },
          { $set: { 'dispatch.attemptedWorkerIds': [] } },
        ).catch(() => {});
        logger.info(
          { orderId, boostPaise: boostNow, round: boostRounds },
          '[DISPATCH] 💰 Boosted during hold — re-opening the search at the new price',
        );
        restart = true;
        break;
      }
    }
    if (restart) continue boostRound;       // eslint-disable-line no-labels
  }

  break; // hold finished with no boost → stop searching
  } // end boostRound

  releaseCameOnlineSub();

  /* All voluntary steps exhausted
   * ACCEPTANCE-FIRST: by default we NEVER force a non-consenting worker (that
   * produced reluctant workers who cancel/ghost). Admin may re-enable force-assign
   * as a last resort via pricing config `forceAssignEnabled`. Otherwise we fall
   * through to a retry (with the now-higher accept bonus) and, if still nobody,
   * a graceful failure + full refund via markOrderFailed. */
  if (cfg.forceAssignEnabled) {
    logger.info({ orderId }, '[DISPATCH] Voluntary window elapsed — force-assign enabled by admin, attempting');
    await emitToOrderRoom(order._id, 'order.dispatch_update', {
      message: 'Assigning the nearest available worker…',
    });
    const forceAssignRadius = config.dispatch.forceAssignRadiusKm ?? 20;
    const forceResult = await attemptForceAssign(order, forceAssignRadius);
    if (forceResult.ok) {
      logger.info({ orderId, workerId: forceResult.workerId }, '[DISPATCH] Force-assigned');
      return forceResult;
    }
  } else {
    logger.info({ orderId }, '[DISPATCH] Voluntary window elapsed — no force-assign (acceptance-first)');
  }

  /* Retry dispatch if under limit */
  if (retryCount < MAX_RETRIES) {
    const nextRetry = retryCount + 1;
    logger.info({ orderId, nextRetry }, '[DISPATCH] No workers found — scheduling retry');

    const retryTargetQueue = job.data.isEmergency ? emergencyDispatchQueue : dispatchQueue;
    await retryTargetQueue.add(
      'dispatch',
      { orderId: String(order._id), retryCount: nextRetry, attempt: nextRetry, isEmergency: !!job.data.isEmergency },
      {
        jobId: `order_${order._id}_retry_${nextRetry}`,
        delay: job.data.isEmergency ? 30_000 : RETRY_DELAY_MS, // emergency retries faster: 30s vs 90s
        priority: 1,
      },
    );

    await emitToOrderRoom(order._id, 'order.dispatch_update', {
      message: 'No available workers right now — retrying shortly…',
    });

    return { ok: false, reason: 'retrying', retryCount: nextRetry };
  }

  /* Truly no workers after all retries */
  logger.info({ orderId }, '[DISPATCH] All attempts exhausted — marking failed');
  const finalOrder = await Order.findById(orderId);
  if (finalOrder && finalOrder.status === 'searching') {
    await markOrderFailed(finalOrder, 'no_workers_available');
  }
  return { ok: false, reason: 'all_attempts_exhausted' };
  } finally {
    releaseZoneSlot();
  }
}

/* BullMQ worker bootstrap */

async function main() {
  await connectMongo();

  const bullWorker = new BullWorker(
    QUEUES.DISPATCH,
    processDispatchJob,
    {
      connection:   createBullConnection(),
      concurrency:  50,
      lockDuration: 360_000, // 6 min lock — covers the full 5-min search window + overhead
    },
  );

  // Dedicated worker for emergency queue — 5 reserved slots that are NEVER occupied
  // by regular orders. Guarantees immediate pickup even when 50 standard dispatches
  // are sleeping through their search windows.
  const emergencyBullWorker = new BullWorker(
    QUEUES.DISPATCH_EMERGENCY,
    processDispatchJob,
    {
      connection:   createBullConnection(),
      concurrency:  5,
      lockDuration: 360_000,
    },
  );

  const attachListeners = (worker, label) => {
    worker.on('completed', (job, result) =>
      logger.info({ jobId: job.id, result }, `[${label}] Job completed`),
    );
    worker.on('failed', (job, err) =>
      logger.error({ jobId: job?.id, err: err.message }, `[${label}] Job failed`),
    );
    worker.on('error', (err) =>
      logger.error({ err: err.message }, `[${label}] Worker error`),
    );
  };

  attachListeners(bullWorker, 'DISPATCH');
  attachListeners(emergencyBullWorker, 'DISPATCH:EMERGENCY');

  logger.info('[DISPATCH] Progressive radius + force-assign workers started (standard:50 + emergency:5 concurrency)');
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '[DISPATCH] Worker crashed');
    process.exit(1);
  });
}

module.exports = {
  processDispatchJob,
};
