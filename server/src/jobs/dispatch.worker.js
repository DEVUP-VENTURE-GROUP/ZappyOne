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
const logger = require('../utils/logger');
const { QUEUES, notificationsQueue, dispatchQueue, emergencyDispatchQueue } = require('./index');
const pricingService = require('../modules/pricing/pricing.service');

const MAX_BATCH_SIZE     = 10;
const MAX_RETRIES        = 2;
const RETRY_DELAY_MS     = 90_000;     // 90s between retry attempts
const MIN_STEP_WAIT_MS   = 3_000;      // wait per later empty step (was 10s)
// Steps below this index (50m, 100m, 250m, 500m) are skipped instantly when empty
// — in dense cities nobody is within 500m, burning 4×10s here was wasteful.
const INSTANT_SKIP_STEPS = 4;

/* ─── Main job processor ────────────────────────────────────────── */

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

  // ── Team slot: fill an additional worker slot on an already-assigned team order ──
  if (job.data.isTeamSlot) {
    return processTeamSlot(order, job);
  }

  if (!['created', 'searching'].includes(order.status)) {
    logger.info({ orderId, status: order.status }, '[DISPATCH] Order not dispatchable');
    return { ok: false, reason: 'bad_status' };
  }

  /* ── Transition to searching ── */
  if (order.status === 'created') {
    order.status = 'searching';
    order.statusHistory.push({ status: 'searching' });
    await order.save();
    await emitToOrderRoom(order._id, 'order.status', { status: 'searching' });
  }

  const [lng, lat] = order.pickupLocation.coordinates;

  /* ── ZeroWait: INSTANT MATCH (Ready Pool) ─────────────────────────────────
   * Every competitor pays an offer→accept round-trip: publish the job, then wait
   * for a human to tap Accept. That round-trip is the floor on match speed.
   *
   * Workers in Ready Mode have ALREADY pre-accepted this kind of job (their skill,
   * their radius, time-boxed). So we can lock one atomically — no offer, no tap,
   * no wait. Sub-second assignment. If the pool is empty we fall straight through
   * to the normal acceptance-first dispatch below, so this is purely additive.  */
  {
    const instant = await tryInstantMatch(order, cfg, lng, lat, jobStartMs);
    if (instant.ok) return instant;
  }

  /* ── Per-zone concurrency throttle (#64) ─────────────────────────────────
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

  /* ── Background listener: worker comes online mid-dispatch ──────────────────
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

  /* ── Preferred worker: user's last accepted worker for same service ── */
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

  /* ── Acceptance-first controls (all admin-tunable via pricing config) ── */
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

  /* ── Walk radius steps (voluntary accept window) ── */
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

      /* ── P2: best-first head-start ──────────────────────────────────────────
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
              logger.info({ orderId, workerId: hs.acceptedBy }, '[DISPATCH] ✅ Assigned via best-first head-start');
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
      // addBulk is a single Redis transaction vs N individual LPUSH calls. (#62)
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
          logger.info({ orderId, workerId: result.acceptedBy }, '[DISPATCH] ✅ Order assigned via accept');
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

  /* ── Guarantee minimum search window before giving up ── */
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

  /* ── All voluntary steps exhausted ──────────────────────────────────────────
   * ACCEPTANCE-FIRST: by default we NEVER force a non-consenting worker (that
   * produced reluctant workers who cancel/ghost). Admin may re-enable force-assign
   * as a last resort via pricing config `forceAssignEnabled`. Otherwise we fall
   * through to a retry (with the now-higher accept bonus) and, if still nobody,
   * a graceful failure + full refund via markOrderFailed. ── */
  if (cfg.forceAssignEnabled) {
    logger.info({ orderId }, '[DISPATCH] Voluntary window elapsed — force-assign enabled by admin, attempting');
    await emitToOrderRoom(order._id, 'order.dispatch_update', {
      message: 'Assigning the nearest available worker…',
    });
    const forceAssignRadius = config.dispatch.forceAssignRadiusKm ?? 20;
    const forceResult = await attemptForceAssign(order, forceAssignRadius);
    if (forceResult.ok) {
      logger.info({ orderId, workerId: forceResult.workerId }, '[DISPATCH] ✅ Force-assigned');
      return forceResult;
    }
  } else {
    logger.info({ orderId }, '[DISPATCH] Voluntary window elapsed — no force-assign (acceptance-first)');
  }

  /* ── Retry dispatch if under limit ── */
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

  /* ── Truly no workers after all retries ── */
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

/* ─── Preferred worker: check if user's last worker is online + skilled ── */

/* ─── ZeroWait: instant match from the Ready Pool ─────────────────────────────
 * Returns { ok: true, ... } when a pre-accepted worker was locked, else { ok:false }
 * so the caller falls through to normal dispatch. Never throws. */
async function tryInstantMatch(order, cfg, lng, lat, jobStartMs) {
  const orderId = String(order._id);
  try {
    if (cfg.readyPoolEnabled === false) return { ok: false, reason: 'ready_pool_disabled' };

    // Optionally restrict instant match to paid tiers (admin: readyTiersOnly).
    const tier = order.tier || 'standard';
    const tiersOnly = Array.isArray(cfg.readyTiersOnly) ? cfg.readyTiersOnly : [];
    if (tiersOnly.length && !tiersOnly.includes(tier)) {
      return { ok: false, reason: 'tier_not_eligible' };
    }

    const candidates = await geoService.findReadyCandidates({
      lng, lat,
      skill:     order.service,
      radiusKm:  config.dispatch.radiusSteps.at(-1),   // outer bound; each worker's own radius still applies
      minRating: cfg.readyMinRating ?? 4.0,
      excludeIds: (order.dispatch?.attemptedWorkerIds || []).map(String),
    });

    if (!candidates.length) return { ok: false, reason: 'no_ready_workers' };

    for (const workerId of candidates.slice(0, 5)) {
      // Same atomic, transactional lock normal dispatch uses — re-verifies skill,
      // availability and KYC inside the transaction, so no double-booking.
      const locked = await lockOrderToWorker(order._id, workerId, order.service);
      if (!locked) continue;

      const readyBonus = cfg.readyBonusPaise ?? 2000;
      const latencyMs  = Date.now() - jobStartMs;
      await Order.updateOne({ _id: order._id }, {
        $set: {
          'dispatch.instantMatch':    true,
          'dispatch.readyBonusPaise': readyBonus,
          'dispatch.matchLatencyMs':  latencyMs,
        },
      }).catch(() => {});

      logger.info({ orderId, workerId, latencyMs }, '[ZEROWAIT] ⚡ Instant match — worker had pre-accepted');
      await onInstantAssigned(order, workerId, readyBonus, latencyMs);
      recordOutcomes(workerId, 'accept', [], []);
      return { ok: true, workerId, instant: true, latencyMs };
    }
    return { ok: false, reason: 'no_lockable_ready_workers' };
  } catch (err) {
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Instant match failed — falling back to normal dispatch');
    return { ok: false, reason: 'error' };
  }
}

/** Post-assignment for an instant match (worker pre-accepted — no offer was sent). */
async function onInstantAssigned(order, workerId, readyBonusPaise, latencyMs) {
  const orderId = String(order._id);

  // The worker is now busy — they must leave the Ready Pool immediately so the
  // next order can't also auto-assign to them.
  geoService.exitReady(workerId).catch(() => {});

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId, instant: true });

  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  // Drives the worker client's 'job.assigned' handler → popup + alert sound.
  redis.publish('worker:assigned', JSON.stringify({
    workerId,
    orderId,
    service:       order.service,
    pickupAddress: order.pickupLocation.address,
    price:         order.pricing.total,
    instantMatch:  true,
  })).catch(() => {});

  try {
    const notificationService = require('../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();
    const bonusRs = Math.round((readyBonusPaise || 0) / 100);
    await Promise.all([
      notificationService.notify({
        recipient: { kind: 'user', id: order.userId },
        type:  'worker_assigned',
        title: '⚡ Pro assigned instantly',
        body:  worker
          ? `${worker.name} (${(worker.rating || 5).toFixed(1)}★) accepted before you finished checkout.`
          : 'A pro has been assigned instantly.',
        deepLink: `/orders/${orderId}`,
        data: { orderId, workerId, instant: 'true' },
      }),
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type:  'job_assigned',
        title: `⚡ Ready Mode job${bonusRs ? ` + ₹${bonusRs} bonus` : ''}`,
        body:  `${order.service.replace(/_/g, ' ')} — ₹${order.pricing.total}. You pre-accepted this, so it's yours.${bonusRs ? ` ₹${bonusRs} Ready bonus is paid on completion.` : ''} Please start your trip.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId, instantMatch: 'true', readyBonusPaise: String(readyBonusPaise || 0) },
      }),
    ]);
  } catch (err) {
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Instant-match notifications failed');
  }

  enqueueTeamSlots(order, workerId).catch((err) =>
    logger.warn({ err: err.message, orderId }, '[ZEROWAIT] Team slot enqueue failed'),
  );
}

/* ─── Persist the accept bonus in effect, so completion can credit it ── */
async function persistUrgencyBonus(orderId, bonusPaise) {
  if (!bonusPaise || bonusPaise <= 0) return;
  await Order.updateOne(
    { _id: orderId },
    { $set: { 'dispatch.urgencyBonusPaise': bonusPaise } },
  ).catch(() => {});
}

async function getPreferredWorker(order) {
  try {
    // 1) Customer explicitly picked this pro at checkout (worker-choice) — highest priority.
    // 2) Otherwise fall back to the customer's last completed worker for this service.
    let wId = order.dispatch?.customerPreferredWorkerId
      ? String(order.dispatch.customerPreferredWorkerId)
      : null;

    if (!wId) {
      const lastOrder = await Order.findOne({
        userId: order.userId,
        service: order.service,
        status: 'completed',
        workerId: { $exists: true, $ne: null },
      })
        .sort({ completedAt: -1 })
        .select('workerId')
        .lean();

      if (!lastOrder?.workerId) return null;
      wId = String(lastOrder.workerId);
    }

    const [avail, hasSkill, alive] = await Promise.all([
      redis.hget('workers:available', wId),
      redis.sismember(`workers:skill:${order.service}`, wId),
      redis.zscore('workers:alive', wId),
    ]);

    const freshnessThreshold = Date.now() - 8 * 60 * 1000;
    const isFresh = !alive || Number(alive) >= freshnessThreshold;

    if (avail === '1' && hasSkill === 1 && isFresh) {
      // Final KYC + rating guard
      const w = await WorkerModel.findOne({
        _id: wId,
        isBlocked: false,
        'kyc.status': 'approved',
        rating: { $gte: config.dispatch.minWorkerRating ?? 3.0 },
      }).select('_id').lean();
      return w ? wId : null;
    }
    return null;
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Preferred worker lookup failed');
    return null;
  }
}

/* ─── Offer to a single worker and wait for their response ─────── */

async function offerToWorker(order, workerId, windowMs) {
  const expiresAt = new Date(Date.now() + windowMs);
  await redis.publish('worker:offer', JSON.stringify({
    workerId,
    order: {
      _id:           String(order._id),
      service:       order.service,
      pickupAddress: order.pickupLocation.address,
      pickupCoords:  order.pickupLocation.coordinates,
      price:         order.pricing.total,
      expiresAt:     expiresAt.toISOString(),
      preferred:     true,
    },
  }));

  const result = await waitForBatchWindow(String(order._id), [workerId], windowMs);
  return { accepted: !!result.acceptedBy };
}

/* ─── Force-assign: skill-matched only, no bypass ──────────────── */

async function attemptForceAssign(order, radiusKm) {
  const orderId = String(order._id);
  const [lng, lat] = order.pickupLocation.coordinates;

  // SKILL FILTER IS ALWAYS ON — we never assign a wrong-service worker.
  // Radius is wider (up to forceAssignRadiusKm) to cast a larger net.
  const candidates = await geoService.findCandidates({
    lng, lat,
    skill:      order.service,
    excludeIds: [],
    radiusKm,
    skipSkillFilter: false,           // hard: never skip skill filter
  });

  logger.info({ orderId, found: candidates.length, radiusKm }, '[DISPATCH] Force-assign skilled candidates');

  for (const workerId of candidates.slice(0, 5)) {
    const locked = await lockOrderToWorker(order._id, workerId, order.service);
    if (locked) {
      await onForceAssigned(order, workerId);
      return { ok: true, workerId, forceAssigned: true };
    }
  }

  return { ok: false, reason: 'no_lockable_skilled_workers' };
}

/* ─── Shared post-assignment actions ────────────────────────────── */

async function onOrderAssigned(order, workerId, losers = []) {
  const orderId = String(order._id);

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId });

  // Push worker's current GPS position immediately so the customer map shows
  // the worker dot without waiting for the next periodic location broadcast.
  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  for (const wId of losers) {
    redis.publish('worker:offer_cancel', JSON.stringify({ workerId: wId, orderId })).catch(() => {});
  }

  try {
    const notificationService = require('../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();
    await notificationService.notify({
      recipient: { kind: 'user', id: order.userId },
      type:      'worker_assigned',
      title:     '✅ Worker assigned!',
      body:      worker
        ? `${worker.name} (⭐ ${worker.rating?.toFixed(1) ?? '5.0'}) is on the way`
        : 'A worker is on the way',
      deepLink: `/orders/${orderId}`,
      data:     { orderId, workerId },
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Assignment user notification failed');
  }

  // If team order, enqueue additional worker slots
  enqueueTeamSlots(order, workerId).catch(err =>
    logger.warn({ err: err.message, orderId }, '[DISPATCH] Team slot enqueue failed')
  );
}

async function onForceAssigned(order, workerId) {
  const orderId = String(order._id);

  await emitToOrderRoom(order._id, 'order.assigned', { workerId, orderId, forceAssigned: true });

  geoService.getWorkerPosition(workerId).then((pos) => {
    if (pos) emitToOrderRoom(order._id, 'worker.location', { ...pos, at: Date.now(), hdg: null, spd: null });
  }).catch(() => {});

  await redis.publish('worker:assigned', JSON.stringify({
    workerId,
    orderId,
    service:       order.service,
    pickupAddress: order.pickupLocation.address,
    price:         order.pricing.total,
    forceAssigned: true,
  })).catch(() => {});

  // Force-assign bonus — amount set by admin in pricing config (default ₹15)
  let FORCE_ASSIGN_BONUS_PAISE = 1500;
  try {
    const PricingConfig = require('../modules/pricing/pricing-config.model');
    const cfg = await PricingConfig.findOne({ isActive: true }).select('forceAssignBonusPaise').lean();
    if (cfg?.forceAssignBonusPaise != null) FORCE_ASSIGN_BONUS_PAISE = cfg.forceAssignBonusPaise;
  } catch { /* keep default */ }
  try {
    const walletService  = require('../modules/wallet/wallet.service');
    const Transaction    = require('../modules/payment/transaction.model');
    await walletService.apply({
      kind: 'worker',
      id: workerId,
      type: 'credit',
      amountPaise: FORCE_ASSIGN_BONUS_PAISE,
      reason: Transaction.REASONS.WORKER_EARNING,
      idempotencyKey: `forceassign:bonus:${orderId}`,
      refs: { orderId },
      description: 'Force-assign bonus — job auto-routed to you',
    });
  } catch (err) {
    logger.warn({ err: err.message, workerId, orderId }, '[DISPATCH] Force-assign bonus credit failed');
  }

  try {
    const notificationService = require('../modules/notification/notification.service');
    const worker = await WorkerModel.findById(workerId).select('name rating').lean();

    await Promise.all([
      notificationService.notify({
        recipient: { kind: 'user', id: order.userId },
        type:  'worker_assigned',
        title: 'Worker assigned',
        body:  worker
          ? `${worker.name} (${(worker.rating || 5).toFixed(1)} stars) is on the way`
          : 'A worker is on the way',
        deepLink: `/orders/${orderId}`,
        data: { orderId, workerId },
      }),
      notificationService.notify({
        recipient: { kind: 'worker', id: workerId },
        type:  'job_assigned',
        title: 'Job auto-routed to you + ₹15 bonus',
        body:  `${order.service.replace(/_/g, ' ')} — ₹${order.pricing.total}. A ₹15 priority bonus has been added to your wallet. Please start your trip promptly.`,
        deepLink: `/worker/jobs/${orderId}`,
        data: { orderId, forceAssigned: 'true', bonusPaise: String(FORCE_ASSIGN_BONUS_PAISE) },
      }),
    ]);
  } catch (err) {
    logger.warn({ err: err.message }, '[DISPATCH] Force-assign notifications failed');
  }

  enqueueTeamSlots(order, workerId).catch(err =>
    logger.warn({ err: err.message, orderId }, '[DISPATCH] Team slot enqueue failed (force-assign)')
  );
}

/* ─── Shared pub/sub subscriber for all concurrent dispatch batches ─
   One connection handles all in-flight batches instead of one per job.
   Saves up to concurrency (10) connections simultaneously.            */

let _batchSub = null;
const _batchHandlers = new Map(); // channel → (message: string) => void

function getBatchSub() {
  if (_batchSub) return _batchSub;
  _batchSub = createBullConnection();
  _batchSub.on('message', (ch, msg) => {
    const handler = _batchHandlers.get(ch);
    if (handler) handler(msg);
  });
  _batchSub.on('error', () => {
    // On connection error drop and recreate next call
    _batchSub = null;
    _batchHandlers.clear();
  });
  return _batchSub;
}

/* ─── Wait for any worker in the batch to accept within the window ─ */

function waitForBatchWindow(orderId, workerIds, windowMs) {
  return new Promise((resolve) => {
    const acceptCh = `dispatch:accepted:${orderId}`;
    const rejectCh = `dispatch:rejected:${orderId}`;
    const sub = getBatchSub();

    const remaining = new Set(workerIds.map(String));
    const rejected  = [];

    const cleanup = () => {
      clearTimeout(timer);
      _batchHandlers.delete(acceptCh);
      _batchHandlers.delete(rejectCh);
      sub.unsubscribe(acceptCh, rejectCh).catch(() => {});
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ acceptedBy: null, rejected, ignored: [...remaining] });
    }, windowMs);

    const onMessage = (ch, raw) => {
      try {
        const data = JSON.parse(raw);
        const wId  = String(data.workerId);
        if (!remaining.has(wId)) return;
        if (ch === acceptCh) {
          cleanup();
          remaining.delete(wId);
          resolve({ acceptedBy: wId, rejected, ignored: [...remaining] });
        } else if (ch === rejectCh) {
          remaining.delete(wId);
          rejected.push(wId);
          if (remaining.size === 0) {
            cleanup();
            resolve({ acceptedBy: null, rejected, ignored: [] });
          }
        }
      } catch { /* ignore */ }
    };

    _batchHandlers.set(acceptCh, (msg) => onMessage(acceptCh, msg));
    _batchHandlers.set(rejectCh, (msg) => onMessage(rejectCh, msg));

    sub.subscribe(acceptCh, rejectCh).catch(() => {
      cleanup();
      resolve({ acceptedBy: null, rejected: [], ignored: [...workerIds] });
    });
  });
}

/* ─── Atomic order + worker lock ───────────────────────────────── */
// Verifies the worker has the required skill before locking.
// This is the final safety net — even if geo.service somehow returns
// a wrong-skill worker, this transaction will abort.

/* ─── Team slot processor ───────────────────────────────────────── */
// Finds one additional skilled worker for an already-assigned team order.
// Runs the same progressive radius search as normal dispatch but uses
// lockSecondaryWorker so it doesn't touch workerId or order status.
async function processTeamSlot(order, job) {
  const orderId    = String(order._id);
  const teamSize   = order.teamSize || 1;
  const slotIndex  = job.data.slotIndex || 1;
  const retryCount = job.data.attempt  || 0;

  const fresh = await Order.findById(orderId).select('status workerIds teamSize').lean();
  if (!fresh || fresh.status !== 'assigned') {
    logger.info({ orderId, slotIndex }, '[TEAM] Order no longer assigned — dropping slot');
    return { ok: false, reason: 'order_not_assigned' };
  }
  if ((fresh.workerIds?.length || 0) >= teamSize) {
    logger.info({ orderId, slotIndex }, '[TEAM] All slots already filled');
    return { ok: true, reason: 'already_filled' };
  }

  const alreadyAssigned = (fresh.workerIds || []);
  const [lng, lat] = order.pickupLocation.coordinates;
  const radiusSteps = config.dispatch.radiusSteps;

  for (const radiusKm of radiusSteps) {
    const candidates = await geoService.findCandidates({ lat, lng, skill: order.service, radiusKm });
    const eligible   = candidates.filter(id => !alreadyAssigned.map(String).includes(String(id)));
    if (!eligible.length) continue;

    for (const workerId of eligible.slice(0, 5)) {
      const locked = await lockSecondaryWorker(orderId, workerId, order.service, alreadyAssigned);
      if (locked) {
        logger.info({ orderId, workerId, slotIndex }, '[TEAM] ✅ Secondary worker locked');
        // Notify new worker of the job
        try {
          const notificationService = require('../modules/notification/notification.service');
          notificationService.notify({
            recipient: { kind: 'worker', id: workerId },
            type: 'job_assigned',
            title: 'Team job assigned to you',
            body: `${order.service.replace(/_/g, ' ')} — ₹${Math.round(order.pricing.total / teamSize)} (your share). Join the team at the pickup.`,
            deepLink: `/worker/jobs/${orderId}`,
            data: { orderId, isTeamJob: 'true', slotIndex: String(slotIndex) },
          }).catch(() => {});
        } catch {}
        emitToOrderRoom(orderId, 'order.team_updated', { workerIds: [...alreadyAssigned.map(String), String(workerId)] });
        return { ok: true, workerId, slotIndex };
      }
    }
  }

  // No worker found — retry up to 2 times with 90s delay
  if (retryCount < 2) {
    logger.warn({ orderId, slotIndex, retryCount }, '[TEAM] No worker found — retrying slot');
    await dispatchQueue.add('dispatch', { ...job.data, attempt: retryCount + 1 }, { delay: 90_000 });
    return { ok: false, reason: 'retrying' };
  }

  logger.error({ orderId, slotIndex }, '[TEAM] Could not fill team slot after retries');
  return { ok: false, reason: 'slot_unfilled' };
}

async function lockOrderToWorker(orderId, workerId, requiredSkill) {
  const mongoose = require('mongoose');
  const session  = await mongoose.startSession();
  try {
    let updated = null;
    await session.withTransaction(async () => {
      // Verify skill match inside the transaction — abort if wrong
      const worker = await WorkerModel.findOne(
        {
          _id: workerId,
          isAvailable: true,
          isBlocked: false,
          'kyc.status': 'approved',
          skills: requiredSkill,
        },
        { _id: 1 },
        { session },
      );
      if (!worker) throw Object.assign(new Error('WORKER_SKILL_MISMATCH_OR_UNAVAILABLE'), { abort: true });

      updated = await Order.findOneAndUpdate(
        { _id: orderId, status: { $in: ['searching', 'created'] }, workerId: null },
        {
          $set: {
            workerId,
            status: 'assigned',
            'dispatch.currentOfferWorkerId': null,
            'dispatch.offerExpiresAt': null,
          },
          $addToSet: { workerIds: workerId },
          $push: { statusHistory: { status: 'assigned', at: new Date(), meta: { workerId } } },
        },
        { new: true, session },
      );
      if (!updated) throw Object.assign(new Error('ORDER_NOT_LOCKABLE'), { abort: true });

      await WorkerModel.updateOne(
        { _id: workerId },
        { $set: { isAvailable: false, currentOrderId: orderId } },
        { session },
      );
    });

    if (!updated) return false;
    await geoService.setAvailability(workerId, false);
    return true;
  } catch (err) {
    if (err.abort) {
      logger.info({ orderId, workerId, reason: err.message }, '[DISPATCH] Lock aborted');
      return false;
    }
    throw err;
  } finally {
    session.endSession();
  }
}

/* ─── Secondary worker lock (team orders) ──────────────────────── */
// Adds an additional worker to an already-assigned order without changing
// the primary workerId or order status. Each added worker sets their own
// isAvailable=false and gets the order in their currentOrderId.
async function lockSecondaryWorker(orderId, workerId, requiredSkill, alreadyAssigned) {
  const mongoose = require('mongoose');
  const session  = await mongoose.startSession();
  try {
    let ok = false;
    await session.withTransaction(async () => {
      const worker = await WorkerModel.findOne(
        { _id: workerId, isAvailable: true, isBlocked: false, 'kyc.status': 'approved', skills: requiredSkill },
        { _id: 1 }, { session },
      );
      if (!worker) throw Object.assign(new Error('WORKER_UNAVAILABLE'), { abort: true });

      // Idempotency: don't add the same worker twice
      if (alreadyAssigned.map(String).includes(String(workerId))) {
        throw Object.assign(new Error('ALREADY_IN_TEAM'), { abort: true });
      }

      const updated = await Order.findOneAndUpdate(
        { _id: orderId, status: 'assigned' },
        { $addToSet: { workerIds: workerId } },
        { new: true, session },
      );
      if (!updated) throw Object.assign(new Error('ORDER_NOT_ASSIGNABLE'), { abort: true });

      await WorkerModel.updateOne(
        { _id: workerId },
        { $set: { isAvailable: false, currentOrderId: orderId } },
        { session },
      );
      ok = true;
    });
    if (ok) await geoService.setAvailability(workerId, false);
    return ok;
  } catch (err) {
    if (err.abort) {
      logger.info({ orderId, workerId, reason: err.message }, '[DISPATCH] Secondary lock aborted');
      return false;
    }
    throw err;
  } finally {
    session.endSession();
  }
}

/* ─── Enqueue secondary worker slots for team orders ────────────── */
async function enqueueTeamSlots(order, leadWorkerId) {
  const teamSize = order.teamSize || 1;
  if (teamSize <= 1) return;
  const slotsNeeded = teamSize - 1;
  logger.info({ orderId: String(order._id), teamSize, slotsNeeded }, '[DISPATCH] Enqueuing team slots');
  for (let i = 0; i < slotsNeeded; i++) {
    await dispatchQueue.add(
      'dispatch',
      { orderId: String(order._id), isTeamSlot: true, slotIndex: i + 1, attempt: 0 },
      { jobId: `team_${order._id}_slot_${i + 1}`, priority: 10, delay: i * 2000 },
    );
  }
}

/* ─── Record abuse-service outcomes (fire-and-forget) ──────────── */

function recordOutcomes(acceptedBy, acceptOutcome, rejected, ignored) {
  const abuseService = require('../modules/order/abuse.service');
  if (acceptedBy && acceptOutcome) {
    abuseService.recordWorkerOutcome(acceptedBy, acceptOutcome).catch(() => {});
  }
  for (const wId of rejected) abuseService.recordWorkerOutcome(wId, 'reject').catch(() => {});
  for (const wId of ignored)  abuseService.recordWorkerOutcome(wId, 'timeout').catch(() => {});
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function sleep(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

async function markOrderFailed(order, reason) {
  order.status = 'failed';
  order.cancellationReason = reason;
  order.statusHistory.push({ status: 'failed', meta: { reason } });
  await order.save();
  await emitToOrderRoom(order._id, 'order.failed', { reason });
  logger.info({ orderId: order._id, reason }, '[DISPATCH] Order marked failed');

  // Auto-refund: if the user had already paid online, issue a full refund.
  // Cash orders need no refund (money never reached platform).
  if (order.payment?.status === 'paid' && order.payment?.method !== 'cash') {
    try {
      const razorpay = require('../modules/payment/razorpay.client');
      const PaymentIntent = require('../modules/payment/payment-intent.model');
      const intent = await PaymentIntent.findOne({
        orderId: order._id,
        status: 'captured',
      }).lean();
      if (intent?.razorpayPaymentId) {
        const refund = await razorpay.refundPayment(intent.razorpayPaymentId, intent.amountPaise);
        // Mark intent refunded
        await PaymentIntent.updateOne(
          { _id: intent._id },
          { $set: { status: 'refunded', refundId: refund.id, refundedAt: new Date() } }
        );
        logger.info({ orderId: order._id, refundId: refund.id }, '[DISPATCH] Auto-refund issued on order failure');
      }
    } catch (refundErr) {
      // Non-blocking — admin can manually refund if this fails.
      logger.error({ err: refundErr.message, orderId: order._id }, '[DISPATCH] Auto-refund failed — manual action required');
    }
  }

  // Notify user of failure + refund status
  const notificationService = require('../modules/notification/notification.service');
  const wasPaid = order.payment?.status === 'paid' && order.payment?.method !== 'cash';
  notificationService.notify({
    recipient: { kind: 'user', id: order.userId },
    type: 'order_failed',
    title: 'No workers available',
    body: wasPaid
      ? 'We could not find a worker for your request. A full refund has been initiated.'
      : 'We could not find a worker for your request. No charge was applied.',
    deepLink: `/orders/${order._id}`,
    data: { orderId: String(order._id) },
  }).catch(() => {});
}

async function emitToOrderRoom(orderId, event, payload) {
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event,
    payload,
  }));
}

/* ─── BullMQ worker bootstrap ───────────────────────────────────── */

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

module.exports = { processDispatchJob };
