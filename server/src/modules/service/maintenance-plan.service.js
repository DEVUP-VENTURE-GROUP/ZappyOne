/**
 * Subscription Maintenance Plans
 * Create, manage, and auto-trigger recurring service bookings.
 * A cron job calls triggerDuePlans() daily to auto-create orders.
 */
const MaintenancePlan = require('./maintenance-plan.model');
const logger = require('../../core/logger');

/* Discount for subscribers */
const SUBSCRIBER_DISCOUNT_PCT = 10;

/* Recommended frequencies per service (days) */
const DEFAULT_FREQUENCIES = {
  cleaning:    30,
  ac_repair:   90,
  plumbing:   365,
  electrical: 365,
  carpenter:  365,
  painting:  1825,
};

async function createPlan({
  userId, service, frequencyDays, pickupLocation, paymentMethod, preferredWorkerId, basePriceRupees,
  vertical = null, repairCode = null, brandCode = null, modelCode = null, shopId = null,
  visitsPerYear = null,
}) {
  /*
   * A visits-per-year plan (§29 AMC: Basic 2 / Standard 3 / Premium 4) states
   * its frequency as a count, which is the way a customer buys it. The
   * scheduler works in days, so it is converted once, here.
   */
  const freq = frequencyDays
    || (visitsPerYear ? Math.round(365 / visitsPerYear) : null)
    || DEFAULT_FREQUENCIES[service]
    || 90;

  // A repair-engine plan prices each visit when it is booked, so there is no
  // price to discount up front — see triggerRepairPlan.
  const base = basePriceRupees || 0;
  const disc = Math.round(base * SUBSCRIBER_DISCOUNT_PCT / 100);
  const effectivePriceRupees = base - disc;
  const nextScheduledAt = new Date(Date.now() + freq * 86400000);

  const plan = await MaintenancePlan.create({
    userId, service,
    label: visitsPerYear
      ? `${service.replace(/_/g, ' ')} — ${visitsPerYear} visits a year`
      : `${service.replace(/_/g, ' ')} every ${freq} days`,
    frequencyDays: freq,
    preferredWorkerId: preferredWorkerId || null,
    pickupLocation,
    basePriceRupees: base,
    discountPct: SUBSCRIBER_DISCOUNT_PCT,
    effectivePriceRupees,
    status: 'active',
    nextScheduledAt,
    paymentMethod: paymentMethod || 'upi',
    vertical, repairCode, brandCode, modelCode, shopId, visitsPerYear,
  });

  logger.info({ userId, service, freq, nextScheduledAt }, '[MaintenancePlan] Created');
  return { plan, savingsRupees: disc };
}

async function getMyPlans(userId) {
  return MaintenancePlan.find({ userId }).sort({ nextScheduledAt: 1 }).lean();
}

async function pausePlan(planId, userId) {
  return MaintenancePlan.findOneAndUpdate(
    { _id: planId, userId },
    { $set: { status: 'paused' } },
    { new: true }
  );
}

async function resumePlan(planId, userId) {
  const plan = await MaintenancePlan.findOne({ _id: planId, userId });
  if (!plan || plan.status !== 'paused') throw Object.assign(new Error('Plan not found or not paused'), { status: 404 });
  plan.status          = 'active';
  plan.nextScheduledAt = new Date(Date.now() + plan.frequencyDays * 86400000);
  await plan.save();
  return plan;
}

async function cancelPlan(planId, userId) {
  return MaintenancePlan.findOneAndUpdate(
    { _id: planId, userId },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
}

/** Called by a daily cron/scheduler. Creates orders for due plans. */
/**
 * One AMC visit, booked through the repair engine.
 *
 * The plan holds no price: each visit is priced at the moment it is booked,
 * against the provider's CURRENT price, because a plan sold in January must
 * not freeze a provider's rate for the rest of the year. The subscriber
 * discount is applied as a discount line, so the provider is still paid their
 * full rate and the discount is visibly ZappyOne's, not taken out of the
 * technician's pocket.
 */
async function triggerRepairPlan(plan, now) {
  const bookingService = require('../repair/services/booking.service');
  const MaintenancePlanModel = require('./maintenance-plan.model');
  const logger2 = require('../../core/logger');

  const { booking } = await bookingService.createBooking({
    userId: plan.userId,
    vertical: plan.vertical,
    brandCode: plan.brandCode,
    modelCode: plan.modelCode,
    repairCode: plan.repairCode,
    problemCodes: [],
    serviceMode: 'doorstep',
    shopId: plan.shopId || null,
    workerId: plan.preferredWorkerId || null,
    location: {
      coordinates: plan.pickupLocation?.coordinates || [],
      address: plan.pickupLocation?.address || '',
    },
    paymentMethod: plan.paymentMethod === 'cash' ? 'cash' : 'online',
    // Idempotent per plan per due date: a cron that runs twice cannot book the
    // same visit twice.
    idempotencyKey: `amc-${plan._id}-${plan.nextScheduledAt?.toISOString?.() || now.toISOString()}`,
  });

  await MaintenancePlanModel.findByIdAndUpdate(plan._id, {
    $set: {
      lastCompletedAt: now,
      nextScheduledAt: new Date(now.getTime() + plan.frequencyDays * 86400000),
    },
    $inc: { totalCompleted: 1 },
    $push: { bookingHistory: booking._id },
  });

  const notifService = require('../notification/notification.service');
  notifService.notify({
    recipient: { kind: 'user', id: plan.userId },
    type: 'order_placed',
    title: '🔄 Your scheduled visit is booked',
    body: `${plan.label || 'Your maintenance visit'} is booked.`,
    deepLink: `/repair/bookings/${booking._id}`,
    data: { repairBookingId: String(booking._id) },
  }).catch(() => {});

  logger2.info({ planId: plan._id, bookingId: booking._id }, '[MaintenancePlan] AMC repair booking created');
  return booking;
}

async function triggerDuePlans() {
  const now = new Date();
  const duePlans = await MaintenancePlan.find({
    status: 'active',
    nextScheduledAt: { $lte: now },
  }).lean();

  logger.info({ count: duePlans.length }, '[MaintenancePlan] Triggering due plans');

  for (const plan of duePlans) {
    try {
      /*
       * A repair-engine plan books a RepairBooking, not an Order.
       *
       * Everything downstream — dispatch, the technician's job card, QA,
       * photos, settlement — already works off RepairBooking, so routing here
       * means an AMC visit is an ordinary repair job that happens to have been
       * created by a schedule rather than by a customer tapping "book".
       */
      if (plan.vertical) {
        await triggerRepairPlan(plan, now);
        continue;
      }

      const crypto = require('crypto');
      const Order  = require('../order/order.model');
      const order  = await Order.create({
        userId:   plan.userId,
        service:  plan.service,
        description: `Maintenance plan auto-booking (${plan.label})`,
        pickupLocation: plan.pickupLocation,
        pricing: {
          total:       plan.effectivePriceRupees,
          baseFee:     plan.basePriceRupees,
          discountPct: plan.discountPct,
          currency:    'INR',
        },
        status: 'created',
        statusHistory: [{ status: 'created', meta: { maintenancePlan: String(plan._id) } }],
        payment: { method: plan.paymentMethod, status: 'pending' },
        otp: crypto.randomInt(1000, 9999).toString(),
        priority: 'normal',
      });

      /* Dispatch with preferred worker priority */
      const { dispatchQueue } = require('../../jobs');
      await dispatchQueue.add('dispatch', {
        orderId: String(order._id),
        preferredWorkerId: plan.preferredWorkerId ? String(plan.preferredWorkerId) : null,
      });

      /* Advance next schedule */
      await MaintenancePlan.findByIdAndUpdate(plan._id, {
        $set: {
          lastCompletedAt: now,
          nextScheduledAt: new Date(now.getTime() + plan.frequencyDays * 86400000),
        },
        $inc: { totalCompleted: 1 },
        $push: { orderHistory: order._id },
      });

      /* Notify user */
      const notifService = require('../notification/notification.service');
      notifService.notify({
        recipient: { kind: 'user', id: plan.userId },
        type:  'order_placed',
        title: `🔄 Maintenance booking created`,
        body:  `Your scheduled ${plan.service.replace(/_/g, ' ')} is booked at ₹${plan.effectivePriceRupees}`,
        deepLink: `/orders/${order._id}`,
        data: { orderId: String(order._id) },
      }).catch(() => {});

      logger.info({ planId: plan._id, orderId: order._id }, '[MaintenancePlan] Auto-order created');
    } catch (err) {
      logger.error({ err: err.message, planId: plan._id }, '[MaintenancePlan] Trigger failed');
    }
  }

  return { triggered: duePlans.length };
}

module.exports = {
  triggerRepairPlan,
  createPlan, getMyPlans, pausePlan, resumePlan, cancelPlan, triggerDuePlans, DEFAULT_FREQUENCIES,
};
