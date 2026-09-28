/**
 * Retention Worker — "service due" re-engagement.
 * ----------------------------------------------------------------------------
 * Recurring services have a natural cadence (a car wash every ~2 weeks, a bike
 * service every ~3 months). This worker finds customers whose last completed
 * order of such a service is overdue and nudges them to rebook — the single
 * biggest lever on repeat-rate / LTV, and what Zepto/Swiggy do relentlessly.
 *
 * Self-contained: reads completed orders, sends notifications. Touches no
 * pricing or order flow. Runs every 6 hours. Deduped in Redis so a customer is
 * reminded at most once per REMIND_COOLDOWN_DAYS per service.
 * ----------------------------------------------------------------------------
 */
require('dotenv').config();
const { redis } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const Order = require('../modules/order/order.model');
const logger = require('../core/logger');
const notificationService = require('../modules/notification/notification.service');

// service → { days: cadence, label } — the natural rebook interval.
const REMINDER_CADENCE = {
  car_wash:               { days: 15,  label: 'car wash' },
  bike_wash:              { days: 15,  label: 'bike wash' },
  car_detailing:         { days: 60,  label: 'car detailing' },
  car_service:            { days: 120, label: 'car service' },
  bike_service:           { days: 90,  label: 'bike service' },
  pet_grooming:           { days: 45,  label: 'pet grooming' },
  water_tank_cleaning:    { days: 90,  label: 'water tank cleaning' },
  overhead_tank_cleaning: { days: 90,  label: 'tank cleaning' },
  cleaning:               { days: 30,  label: 'home cleaning' },
  ac_repair:              { days: 150, label: 'AC service' },
};

const REMIND_COOLDOWN_DAYS = parseInt(process.env.RETENTION_COOLDOWN_DAYS || '20', 10);
const MAX_PER_SWEEP        = parseInt(process.env.RETENTION_MAX_PER_SWEEP || '800', 10);
const SWEEP_INTERVAL_MS    = 6 * 60 * 60 * 1000; // every 6 hours

const NON_TERMINAL = ['created', 'searching', 'assigned', 'on_the_way', 'arrived', 'in_progress'];

async function remindForService(service, cadence, budget) {
  const dueBefore = new Date(Date.now() - cadence.days * 86400000);
  // Latest completed order per user for this service, older than the cadence.
  const rows = await Order.aggregate([
    { $match: { service, status: 'completed', completedAt: { $ne: null } } },
    { $group: { _id: '$userId', lastAt: { $max: '$completedAt' } } },
    { $match: { lastAt: { $lte: dueBefore } } },
    { $limit: budget * 2 },
  ]);

  let sent = 0;
  for (const r of rows) {
    if (sent >= budget) break;
    const userId = r._id;
    if (!userId) continue;

    // Dedup — one reminder per cooldown window per service.
    const key = `retention:reminded:${userId}:${service}`;
    const fresh = await redis.set(key, '1', 'NX', 'EX', REMIND_COOLDOWN_DAYS * 86400).catch(() => 'skip');
    if (fresh !== 'OK') continue;

    // Skip if they already have an active order for this service.
    const active = await Order.exists({ userId, service, status: { $in: NON_TERMINAL } });
    if (active) continue;

    const weeks = Math.round((Date.now() - new Date(r.lastAt).getTime()) / (7 * 86400000));
    notificationService.notify({
      recipient: { kind: 'user', id: userId },
      type: 'service_due',
      title: `Time for a ${cadence.label}? 🔧`,
      body: `It's been about ${weeks} week${weeks !== 1 ? 's' : ''} since your last ${cadence.label}. Rebook in a tap.`,
      deepLink: `/book/${service}`,
      data: { service, kind: 'retention' },
    }).catch(() => {});
    sent += 1;
  }
  return sent;
}

async function sweep() {
  let budget = MAX_PER_SWEEP;
  let total = 0;
  for (const [service, cadence] of Object.entries(REMINDER_CADENCE)) {
    if (budget <= 0) break;
    try {
      const n = await remindForService(service, cadence, budget);
      total += n; budget -= n;
    } catch (err) {
      logger.warn({ err: err.message, service }, '[RETENTION] service sweep failed');
    }
  }
  if (total) logger.info({ reminders: total }, '[RETENTION] Service-due reminders sent');
  return total;
}

async function main() {
  await connectMongo();
  await sweep().catch((err) => logger.error({ err: err.message }, '[RETENTION] Initial sweep failed'));
  setInterval(() => sweep().catch((err) => logger.error({ err: err.message }, '[RETENTION] Sweep failed')), SWEEP_INTERVAL_MS);
  logger.info('[RETENTION] Service-due reminder worker started (sweeps every 6h)');
}

if (require.main === module) {
  main().catch((err) => { logger.error({ err }, '[RETENTION] Worker crashed'); process.exit(1); });
}

module.exports = { sweep, REMINDER_CADENCE };
