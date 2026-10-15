/**
 * Repeat a booking — repairs/services (tank cleaning, car wash, AC service…)
 * and helping (weekly groceries). Pet care keeps its own schedules (pet/models/recurring).
 *
 *   made from  a booking the customer already made: "Repeat this every week /
 *              2 weeks / month / 3 months". The booking is the template (same
 *              service, place, provider when they are free, payment method).
 *   occurs     at the same time of day; the first repeat is one interval after
 *              the booking it was made from.
 *   booked     AHEAD_DAYS before each occurrence a real booking is created,
 *              priced at that day's price, the same provider asked first
 *              (anyone suitable if they cannot) — so each one can be moved,
 *              cancelled or rated like any booking. No surge on repeats: the
 *              customer planned it.
 *   told       a push for each booking made, and one if a repeat could not be
 *              booked (with a link to book it themselves).
 *   control    skip the next one, pause, resume, stop — from Your schedule.
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const AHEAD_DAYS = 3;
const EVERY = { week: { days: 7 }, '2weeks': { days: 14 }, month: { months: 1 }, '3months': { months: 3 } };
const EVERY_LABEL = { week: 'every week', '2weeks': 'every 2 weeks', month: 'every month', '3months': 'every 3 months' };
const KINDS_OK = ['repair', 'helping'];

const schema = new mongoose.Schema({
  kind: { type: String, enum: KINDS_OK, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, default: '' },
  template: { type: mongoose.Schema.Types.Mixed, required: true },
  every: { type: String, enum: Object.keys(EVERY), required: true },
  nextAt: { type: Date, required: true, index: true },
  endAfter: { type: Number, default: null },
  made: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'paused', 'stopped'], default: 'active', index: true },
  lastBookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastError: { type: String, default: '' },
  failures: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ status: 1, nextAt: 1 });
const RecurringPlan = mongoose.models.RecurringPlan || mongoose.model('RecurringPlan', schema);

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function advance(at, every) {
  const d = new Date(at);
  const step = EVERY[every];
  if (step.days) d.setUTCDate(d.getUTCDate() + step.days);
  else d.setUTCMonth(d.getUTCMonth() + step.months);
  return d;
}

/** The booking request that recreates this booking (its own fields, nothing priced). */
function templateOf(kind, b) {
  const loc = (l) => (l?.coordinates?.length ? { coordinates: l.coordinates, address: l.address || '', ...(l.landmark ? { landmark: l.landmark } : {}) } : undefined);
  if (kind === 'repair') {
    return {
      vertical: b.vertical, brandCode: b.brandCode, modelCode: b.modelCode, configurationCode: b.configurationCode || null,
      fuelType: b.fuelType || '', problemCodes: b.problemCodes || [], repairCode: b.repairCode || null, qualityCode: b.qualityCode || null,
      addOnCodes: (b.addOns || []).map((a) => a.repairCode), serviceMode: b.serviceMode,
      shopId: b.shopId || null, workerId: b.workerId || null, location: loc(b.location), paymentMethod: b.paymentMethod || 'cash',
    };
  }
  return {
    serviceType: b.serviceType, title: b.title || '', instructions: b.instructions || '',
    pickupLocation: b.pickupLocation ? { type: 'Point', coordinates: b.pickupLocation.coordinates, address: b.pickupLocation.address || '' } : undefined,
    destination: b.destination?.coordinates?.length ? { type: 'Point', coordinates: b.destination.coordinates, address: b.destination.address || '' } : undefined,
    items: (b.items || []).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, notes: i.notes, maxApprovedPricePaise: i.maxApprovedPricePaise })).filter((i) => i.name),
    paymentMethod: b.paymentMethod || 'cash', paymentModel: b.itemMoney?.paymentModel || 'worker_advance', specialHandling: !!b.specialHandling,
  };
}

const titleOf = (kind, b) => (kind === 'repair'
  ? [b.deviceName || [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' '), (b.repairCode || '').replace(/_/g, ' ')].filter(Boolean).join(', ')
  : b.title || `${b.serviceType} task`);

/** "Repeat this": a plan from one of the customer's own bookings. */
async function create({ kind, bookingId, userId, every, endAfter = null }) {
  if (!KINDS_OK.includes(kind)) throw err(400, 'NOT_SUPPORTED', kind === 'pet' ? 'Use pet care schedules for repeat pet care.' : 'This booking cannot repeat.');
  if (!EVERY[every]) throw err(400, 'BAD_EVERY', 'Choose how often.');
  const b = await KINDS[kind].model().findOne({ _id: bookingId, userId }).lean();
  if (!b) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (await RecurringPlan.exists({ sourceId: b._id, status: { $ne: 'stopped' } })) throw err(409, 'ALREADY_REPEATS', 'This booking already repeats. Change it from Your schedule.');
  // Same time of day as the booking (or as it was made), one interval on.
  const base = b.scheduledAt || b.createdAt || new Date();
  let nextAt = advance(base, every);
  while (nextAt.getTime() < Date.now() + 60 * 60000) nextAt = advance(nextAt, every);
  const plan = await RecurringPlan.create({
    kind, userId, sourceId: b._id, title: titleOf(kind, b), template: templateOf(kind, b), every, nextAt,
    endAfter: endAfter ? Math.max(1, Math.min(52, Number(endAfter))) : null,
  });
  return { plan: view(plan.toObject()), message: `Repeats ${EVERY_LABEL[every]}. The next one is ${when(nextAt)}; we book it ${AHEAD_DAYS} days before.` };
}

const view = (p) => ({ ...p, everyLabel: EVERY_LABEL[p.every], nextLabel: p.status === 'active' ? when(p.nextAt) : null });

async function mine(userId) {
  const rows = await RecurringPlan.find({ userId, status: { $ne: 'stopped' } }).sort({ nextAt: 1 }).lean();
  return rows.map(view);
}

/** skip | pause | resume | stop. */
async function act({ id, userId, action }) {
  const p = await RecurringPlan.findOne({ _id: id, userId });
  if (!p) throw err(404, 'NOT_FOUND', 'Not found');
  if (action === 'skip') p.nextAt = advance(p.nextAt, p.every);
  else if (action === 'pause') p.status = 'paused';
  else if (action === 'resume') {
    p.status = 'active';
    while (p.nextAt.getTime() < Date.now() + 60 * 60000) p.nextAt = advance(p.nextAt, p.every);
  } else if (action === 'stop') p.status = 'stopped';
  else throw err(400, 'BAD_ACTION', 'Unknown action');
  await p.save();
  return view(p.toObject());
}

async function book(plan, { withProvider }) {
  const t = { ...plan.template };
  if (!withProvider) { t.shopId = null; t.workerId = null; }
  const idempotencyKey = `recur:${plan._id}:${plan.nextAt.toISOString()}`;
  if (plan.kind === 'repair') {
    const { booking } = await require('../repair/services/booking.service').createBooking({
      ...t, userId: plan.userId, scheduledAt: plan.nextAt, slotLabel: when(plan.nextAt), idempotencyKey,
    });
    return booking;
  }
  const { task } = await require('../helping/services/task.service').createTask({ ...t, userId: plan.userId, scheduledAt: plan.nextAt, idempotencyKey });
  return task;
}

/** Hourly: book every repeat whose time is within AHEAD_DAYS. */
async function generateDue(now = new Date()) {
  const due = await RecurringPlan.find({ status: 'active', nextAt: { $lte: new Date(now.getTime() + AHEAD_DAYS * 86400e3) } }).limit(200);
  const send = require('../messaging/send').send;
  let made = 0; let failed = 0;
  for (const plan of due) {
    const at = plan.nextAt;
    let booking = null; let lastError = '';
    for (const withProvider of [true, false]) {
      try { booking = await book(plan, { withProvider }); break; } catch (e) { lastError = e.message; }
    }
    if (booking) {
      made += 1;
      plan.set({ made: plan.made + 1, lastBookingId: booking._id, lastError: '', failures: 0, nextAt: advance(at, plan.every) });
      if (plan.endAfter && plan.made >= plan.endAfter) plan.status = 'stopped';
      await plan.save();
      send('customer.recurring_booked', {
        to: { kind: 'user', id: plan.userId }, refId: `recur:${plan._id}:${at.toISOString()}`,
        ctx: { title: plan.title, when: when(at), link: KINDS[plan.kind].link(String(booking._id)) },
      }).catch(() => {});
    } else if (at.getTime() <= now.getTime() + 2 * 3600e3) {
      // Could not book it and it is about due: move on, and say so once.
      failed += 1;
      plan.set({ lastError: lastError.slice(0, 200), failures: plan.failures + 1, nextAt: advance(at, plan.every) });
      if (plan.failures >= 3) plan.status = 'paused';
      await plan.save();
      send('customer.recurring_failed', {
        to: { kind: 'user', id: plan.userId }, refId: `recurfail:${plan._id}:${at.toISOString()}`,
        ctx: { title: plan.title, when: when(at), paused: plan.status === 'paused' },
      }).catch(() => {});
    } else {
      // Still days away: try again next hour.
      plan.lastError = lastError.slice(0, 200);
      await plan.save();
    }
  }
  if (made || failed) logger.info({ made, failed }, '[recurring] repeats booked');
  return { made, failed };
}

module.exports = { create, mine, act, generateDue, advance, templateOf, RecurringPlan, EVERY_LABEL, AHEAD_DAYS };
