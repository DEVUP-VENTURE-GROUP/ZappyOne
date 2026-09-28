/**
 * Worker Shift Availability Service
 * ---------------------------------------------------------------------------
 * Workers pre-commit to time slots. On commitment:
 *   1. A bonusPaise is locked in (based on demand forecast for that slot)
 *   2. Dispatch gives committed workers 10% priority boost (lower score = ranked higher)
 *   3. If the worker delivers at least 1 order during their slot, they earn the bonus
 *
 * Design goals:
 *   - No penalty for missing a slot (commitment is aspirational, not contractual)
 *   - Bonus is an incentive, not a guarantee (paid only on fulfillment)
 *   - Workers can cancel a committed slot up to 30 min before it starts
 * ---------------------------------------------------------------------------
 */

const Availability = require('./availability.model');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

/* Peak hours (IST) — drives bonus multiplier */
const PEAK_HOURS = new Set([7, 8, 9, 17, 18, 19, 20, 21]);
const BASE_SLOT_BONUS_PAISE = 3000; // ₹30 base per committed hour

/* Redis key: committed worker IDs available at a given bucket + hour */
const COMMITTED_KEY = (bucket, hour) => `availability:committed:${bucket}:${hour}`;

function geoBucket(lat, lng) {
  return `${Math.round(lat * 50) / 50}:${Math.round(lng * 50) / 50}`;
}

function startOfDay(dt = new Date()) {
  const d = new Date(dt);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/* Calculate bonus for a committed slot based on hour and demand signal */
async function computeSlotBonus({ startHour, endHour, lat, lng }) {
  const hours = Math.max(1, endHour - startHour);
  const isPeak = PEAK_HOURS.has(startHour);

  /* Read demand from Redis (same bucket as surge) */
  const bucket = geoBucket(lat, lng);
  const demandKey = `demand:${bucket}`;
  const demandRaw = await redis.get(demandKey).catch(() => null);
  const demandLevel = Math.min(Number(demandRaw) || 0, 20);

  /* Bonus = base * hours * peak_multiplier * demand_multiplier */
  const peakMult   = isPeak ? 1.5 : 1.0;
  const demandMult = demandLevel > 5 ? 1.3 : demandLevel > 2 ? 1.15 : 1.0;
  const bonusPaise = Math.round(BASE_SLOT_BONUS_PAISE * hours * peakMult * demandMult);

  return {
    bonusPaise,
    bonusRupees: Math.round(bonusPaise / 100),
    hours,
    isPeak,
    demandLevel,
    multiplier: parseFloat((peakMult * demandMult).toFixed(2)),
  };
}

/* Commit worker to a shift slot */
async function commitShift({ workerId, date, startHour, endHour, lat, lng, zoneLabel }) {
  if (startHour >= endHour) {
    throw Object.assign(new Error('endHour must be > startHour'), { status: 400 });
  }
  if (endHour - startHour > 12) {
    throw Object.assign(new Error('Slot cannot exceed 12 hours'), { status: 400 });
  }

  const dayStart = startOfDay(date || new Date());

  /* Prevent committing to slots that started >1h ago */
  const nowHour = new Date().getUTCHours() + 5 + (new Date().getUTCMinutes() >= 30 ? 1 : 0); // IST approx
  if (new Date().toDateString() === new Date(dayStart).toDateString() && startHour < nowHour - 1) {
    throw Object.assign(new Error('Cannot commit to a past time slot'), { status: 400 });
  }

  const bonus = await computeSlotBonus({ startHour, endHour, lat, lng });
  const bucket = geoBucket(lat, lng);

  const newSlot = {
    startHour,
    endHour,
    bonusPaise: bonus.bonusPaise,
    status: 'committed',
  };

  const doc = await Availability.findOneAndUpdate(
    { workerId, date: dayStart },
    {
      $setOnInsert: {
        workerId,
        date: dayStart,
        zone: { lat, lng, label: zoneLabel || '' },
      },
      $push: { slots: newSlot },
      $inc: { totalBonusPaise: bonus.bonusPaise },
    },
    { upsert: true, new: true }
  );

  /* Index in Redis for fast dispatch lookup */
  for (let h = startHour; h < endHour; h++) {
    const key = COMMITTED_KEY(bucket, h);
    await redis.sadd(key, String(workerId));
    await redis.expire(key, 86400 * 2); // 2 day TTL
  }

  logger.info({ workerId, startHour, endHour, bonusPaise: bonus.bonusPaise }, '[Shift] Committed');
  return { doc, bonus };
}

/* Cancel a not-yet-started slot */
async function cancelSlot({ workerId, date, startHour }) {
  const dayStart = startOfDay(date || new Date());
  const nowIST = new Date().getUTCHours() + 5.5;

  if (startHour <= nowIST + 0.5) {
    throw Object.assign(new Error('Cannot cancel a slot that starts within 30 minutes'), { status: 400 });
  }

  const doc = await Availability.findOneAndUpdate(
    { workerId, date: dayStart, 'slots.startHour': startHour, 'slots.status': 'committed' },
    { $set: { 'slots.$.status': 'cancelled' } },
    { new: true }
  );

  if (!doc) throw Object.assign(new Error('Slot not found or already started'), { status: 404 });
  logger.info({ workerId, startHour }, '[Shift] Slot cancelled');
  return doc;
}

/* List availability docs for a worker across a date range */
async function getShifts({ workerId, fromDate, toDate }) {
  const from = startOfDay(fromDate || new Date());
  const to   = startOfDay(toDate   || new Date(Date.now() + 7 * 86400000));
  return Availability.find({ workerId, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .lean();
}

/* Get today's availability for a worker */
async function getTodayShifts(workerId) {
  const today = startOfDay();
  const doc = await Availability.findOne({ workerId, date: today }).lean();
  return doc;
}

/* Called on order completion — update shift progress + credit bonus if applicable */
async function onOrderCompleted({ workerId, lat, lng, earningsPaise }) {
  const today   = startOfDay();
  const nowHour = new Date().getUTCHours() + 5; // approx IST
  const bucket  = geoBucket(lat, lng);

  const doc = await Availability.findOne({ workerId, date: today });
  if (!doc) return;

  let bonusCredited = 0;
  let updated = false;

  for (const slot of doc.slots) {
    if (slot.status !== 'committed' && slot.status !== 'active') continue;
    if (nowHour < slot.startHour || nowHour >= slot.endHour) continue;

    /* First order in the slot — activate + mark committed zone matched */
    if (slot.status === 'committed') {
      slot.status = 'active';
    }
    slot.ordersDelivered += 1;
    slot.earningsPaise   += earningsPaise;

    /* Fulfil slot: first order delivered = bonus earned */
    if (slot.ordersDelivered === 1) {
      bonusCredited = slot.bonusPaise;
      slot.fulfilledAt = new Date();
      /* Remove committed key from Redis — slot is now fulfilled */
      for (let h = slot.startHour; h < slot.endHour; h++) {
        await redis.srem(COMMITTED_KEY(bucket, h), String(workerId)).catch(() => {});
      }
    }
    updated = true;
    break;
  }

  if (updated) {
    doc.totalOrders    += 1;
    doc.totalEarningsPaise += earningsPaise;
    await doc.save();
  }

  return { bonusCredited };
}

/* Check if worker has committed to this hour — used by dispatch for priority */
async function isCommittedNow({ workerId, lat, lng }) {
  const bucket  = geoBucket(lat, lng);
  const nowHour = new Date().getUTCHours() + 5; // approx IST
  const key     = COMMITTED_KEY(bucket, nowHour);
  const member  = await redis.sismember(key, String(workerId));
  return member === 1;
}

/* Projected earnings for a planned slot — shown before commitment */
async function previewShift({ startHour, endHour, lat, lng }) {
  const bonus = await computeSlotBonus({ startHour, endHour, lat, lng });
  const hours = endHour - startHour;

  /* Estimate typical order count in this slot based on demand */
  const avgOrdersPerHour = bonus.demandLevel > 5 ? 2.5 : bonus.demandLevel > 2 ? 1.8 : 1.2;
  const estimatedOrders  = Math.round(avgOrdersPerHour * hours);
  const avgOrderPaise    = 75000; // ₹750 per order
  const estimatedEarningsPaise = Math.round(estimatedOrders * avgOrderPaise * 0.87); // post-commission

  return {
    ...bonus,
    estimatedOrders,
    estimatedEarningsPaise,
    estimatedEarningsRupees: Math.round(estimatedEarningsPaise / 100),
    totalProjectedPaise: estimatedEarningsPaise + bonus.bonusPaise,
    totalProjectedRupees: Math.round((estimatedEarningsPaise + bonus.bonusPaise) / 100),
  };
}

module.exports = {
  commitShift,
  cancelSlot,
  getShifts,
  getTodayShifts,
  onOrderCompleted,
  isCommittedNow,
  previewShift,
  computeSlotBonus,
};
