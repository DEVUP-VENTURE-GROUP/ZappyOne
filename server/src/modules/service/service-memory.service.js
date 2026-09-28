/**
 * Service Memory Service — Appliance Passport
 * ---------------------------------------------------------------------------
 * On every order completion:
 *   1. Find or create a ServiceMemory for (userId, service, ~location)
 *   2. Append the service entry (worker, date, photos, notes, warranty)
 *   3. Compute nextReminderAt based on service type
 *
 * Service interval recommendations (days):
 *   ac_repair: 180, plumbing: 365, electrical: 365, cleaning: 30,
 *   painting: 1825 (5y), carpenter: 730, puncture: 0 (on demand)
 * ---------------------------------------------------------------------------
 */

const ServiceMemory = require('./service-memory.model');
const logger = require('../../core/logger');

const SERVICE_INTERVALS = {
  ac_repair:   180,
  cleaning:     30,
  plumbing:    365,
  electrical:  365,
  carpenter:   730,
  painting:   1825,
  helper:        0,
  puncture:      0,
};

function computeNextReminder(service, fromDate = new Date()) {
  const days = SERVICE_INTERVALS[service];
  if (!days) return null;
  const next = new Date(fromDate);
  next.setDate(next.getDate() + days);
  return next;
}

async function recordServiceCompletion({ order, workerName, notes, photos = [] }) {
  try {
    const [lng, lat] = order.pickupLocation.coordinates;

    /* Match by userId + service + nearby address (within 200m) */
    const existing = await ServiceMemory.findOne({
      userId:  order.userId,
      service: order.service,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 200,
        },
      },
    });

    const entry = {
      orderId:    order._id,
      workerId:   order.workerId,
      workerName: workerName || 'Worker',
      date:       new Date(),
      notes:      notes || order.description || '',
      photos:     photos.length ? photos : (order.completionPhotos || []),
      rating:     order.userRating || null,
      warrantyDays: 0,
    };

    const nextReminderAt = computeNextReminder(order.service);
    const now            = new Date();

    if (existing) {
      existing.entries.push(entry);
      existing.lastServiceAt   = now;
      existing.nextReminderAt  = nextReminderAt;
      await existing.save();
      return existing;
    }

    /* Create new memory */
    const memory = await ServiceMemory.create({
      userId:   order.userId,
      service:  order.service,
      label:    null,  // user can name it later (e.g. "Bedroom AC")
      address:  order.pickupLocation.address,
      location: { type: 'Point', coordinates: [lng, lat] },
      entries:  [entry],
      lastServiceAt:  now,
      nextReminderAt,
      preferredWorkerId: order.workerId,
    });
    return memory;
  } catch (err) {
    logger.warn({ err: err.message, orderId: order._id }, '[ServiceMemory] Record failed');
    return null;
  }
}

async function getUserMemories(userId) {
  return ServiceMemory.find({ userId }).sort({ lastServiceAt: -1 }).lean();
}

async function getMemory(memoryId, userId) {
  const mem = await ServiceMemory.findById(memoryId).lean();
  if (!mem || String(mem.userId) !== String(userId)) return null;
  return mem;
}

async function labelMemory({ memoryId, userId, label, preferredWorkerId }) {
  return ServiceMemory.findOneAndUpdate(
    { _id: memoryId, userId },
    { $set: { label, ...(preferredWorkerId ? { preferredWorkerId } : {}) } },
    { new: true }
  );
}

async function getDueReminders(userId) {
  const now     = new Date();
  const in7days = new Date(now.getTime() + 7 * 86400000);
  return ServiceMemory.find({
    userId,
    nextReminderAt: { $lte: in7days, $gte: now },
  }).lean();
}

module.exports = { recordServiceCompletion, getUserMemories, getMemory, labelMemory, getDueReminders, computeNextReminder };
