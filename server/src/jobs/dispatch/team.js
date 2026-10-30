const Order = require('../../modules/order/order.model');
const WorkerModel = require('../../modules/worker/worker.model');
const geoService = require('../../modules/worker/geo.service');
const config = require('../../config');
const logger = require('../../core/logger');
const { dispatchQueue } = require('../index');
const { emitToOrderRoom } = require('./common');

/** Locking workers to an order, including the extra workers of a team job. */

/* Team slot processor */
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
        logger.info({ orderId, workerId, slotIndex }, '[TEAM] Secondary worker locked');
        // Notify new worker of the job
        try {
          const notificationService = require('../../modules/notification/notification.service');
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

/* Atomic order + worker lock */
// Verifies the worker has the required skill before locking.
// This is the final safety net — even if geo.service somehow returns
// a wrong-skill worker, this transaction will abort.

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

/* Secondary worker lock (team orders) */
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

/* Enqueue secondary worker slots for team orders */
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

module.exports = {
  processTeamSlot,
  lockOrderToWorker,
  lockSecondaryWorker,
  enqueueTeamSlots,
};
