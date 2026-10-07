/**
 * Which message each job event sends, for every kind (repairs, pet care,
 * helping). Called from jobs/job-events.announce on every status change, so
 * every path that moves a job is covered without each remembering to tell
 * anyone. Before this, three files each pushed their own wording for the
 * same moments; now this is the only place.
 *
 * Also runs the time-based messages: the rate-and-tip reminder two hours
 * after a job, the weekly provider summary (Monday morning) and the daily
 * business summary for ops (8 am IST).
 */
const { KINDS } = require('../jobs/kinds');
const { jobFacts } = require('./facts');
const { send } = require('./send');
const logger = require('../../core/logger');

/** status → message, per kind. `progress` entries carry their own words. */
const MAP = {
  repair: {
    CONFIRMED: 'booking.confirmed',
    WORKER_ACCEPTED: 'booking.accepted',
    ON_THE_WAY: 'booking.on_the_way',
    ARRIVED: 'booking.arrived',
    DIAGNOSING: ['Inspection started', 'Your technician is checking your device.'],
    PICKUP_SCHEDULED: ['Pickup scheduled', 'We will collect your device shortly.'],
    DEVICE_PICKED_UP: ['Device collected', 'Your device is on its way to the workshop.'],
    AT_WORKSHOP: ['Device at the workshop', 'Your device has reached the workshop.'],
    REPAIR_IN_PROGRESS: ['Repair started', 'Work on your device is under way.'],
    QA_PENDING: ['Quality checks', 'Your device is being tested after the repair.'],
    READY_FOR_RETURN: ['Repair finished', 'Your device is repaired and ready to come back.'],
    OUT_FOR_RETURN: ['On its way back', 'Your device is on its way back to you.'],
    COMPLETED: 'booking.completed',
    CANCELLED: 'booking.cancelled',
  },
  pet: {
    BOOKED: 'booking.confirmed',
    PROVIDER_ACCEPTED: 'booking.accepted',
    PROVIDER_EN_ROUTE: 'booking.on_the_way',
    PROVIDER_ARRIVED: 'booking.arrived',
    PET_HANDOVER: ['Handed over', 'Your pet is with your pet pro now.'],
    SERVICE_STARTED: ['Service started', 'Your pet is in good hands.'],
    SERVICE_COMPLETED: 'booking.completed',
    CANCELLED: 'booking.cancelled',
  },
  helping: {
    CONFIRMED: 'booking.confirmed',
    WORKER_ACCEPTED: 'booking.accepted',
    EN_ROUTE: 'booking.on_the_way',
    ARRIVED: (t) => (['return', 'exchange'].includes(t.serviceType) ? 'booking.arrived' : ['At the store', 'Your helper has reached the store.']),
    RETURNING: ['On the way back', 'Your helper is heading to the drop-off.'],
    COMPLETED: 'booking.completed',
    CANCELLED: 'booking.cancelled',
  },
};

const roleOf = (doc) => {
  const h = [...(doc.statusHistory || [])].reverse().find((x) => x.status === 'CANCELLED') || {};
  return h.byRole || h.actorRole || (doc.cancelledBy === 'user' ? 'user' : doc.cancelledBy) || '';
};

/** What cancelling cost or returned, from wherever that kind records it. */
async function cancelMoney(kind, doc) {
  if (kind === 'pet') return { feePaise: doc.penaltyPaise || 0, refundPaise: doc.paymentStatus === 'paid' ? doc.refundPaise || 0 : 0 };
  const Records = require('../order/cancellation-shield.model');
  const rec = await Records.findOne(kind === 'repair' ? { repairBookingId: doc._id } : { kind, jobId: doc._id }).lean();
  return { feePaise: rec?.feePaise || 0, refundPaise: rec?.refundedPaise || 0 };
}

async function onStatus(kind, doc, status) {
  try {
    let entry = MAP[kind]?.[status];
    if (typeof entry === 'function') entry = entry(doc);
    if (!entry) return;
    const f = await jobFacts(kind, doc);
    const customer = { kind: 'user', id: doc.userId };
    const ref = `${kind}:${f.id}`;

    if (Array.isArray(entry)) {
      await send('booking.progress', { to: customer, ctx: { f, title: entry[0], body: entry[1] }, refId: `${ref}:${status}` });
      return;
    }

    if (entry === 'booking.completed') {
      // The receipt goes with the email; a PDF failure never holds the message back.
      const pdf = await require('./receipt').build(kind, doc).catch((e) => { logger.warn({ err: e.message }, '[messaging] receipt not built'); return null; });
      await send(entry, {
        to: customer, ctx: { f }, refId: ref,
        attachments: pdf ? [{ filename: pdf.filename, contentType: 'application/pdf', content: pdf.buffer }] : null,
      });
      return;
    }

    if (entry === 'booking.cancelled') {
      const role = roleOf(doc);
      const by = ['user', 'customer'].includes(role) ? 'you' : ['worker', 'shop', 'provider'].includes(role) ? 'provider' : 'zappyone';
      const h = [...(doc.statusHistory || [])].reverse().find((x) => x.status === 'CANCELLED') || {};
      const reason = doc.cancellationReason || h.reason || h.note || '';
      await send(entry, { to: customer, ctx: { f, by, reason, ...(await cancelMoney(kind, doc)) }, refId: ref });
      // The provider hears it only when someone else cancelled.
      if (by !== 'provider' && f.provider) {
        await send('provider.job_cancelled', { to: { kind: f.provider.kind, id: f.provider.id }, ctx: { f }, refId: ref });
      }
      return;
    }

    await send(entry, { to: customer, ctx: { f }, refId: entry === 'booking.confirmed' ? ref : `${ref}:${status}` });
  } catch (e) {
    logger.warn({ err: e.message, kind, status }, '[messaging] lifecycle message failed');
  }
}

/* Time-based messages, run every few minutes (server.js). */

const IST = (d = new Date()) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

/** Two hours after a job is done and not yet rated: a gentle nudge to rate (and tip). */
async function rateReminders(now = Date.now()) {
  let sent = 0;
  for (const [kind, k] of Object.entries(KINDS).filter(([kk]) => MAP[kk])) {
    const Model = k.model();
    const at = k.earning?.at;
    if (!at) continue;
    const docs = await Model.find({
      status: { $in: k.earning.done }, ratedAt: null,
      [at]: { $gte: new Date(now - 26 * 3600000), $lte: new Date(now - 2 * 3600000) },
    }).limit(200).lean();
    for (const d of docs) {
      const f = await jobFacts(kind, d);
      await send('booking.rate_reminder', { to: { kind: 'user', id: d.userId }, ctx: { f }, refId: `${kind}:${f.id}` });
      sent += 1;
    }
  }
  return sent;
}

/** Monday 9 am IST: each worker who worked last week gets their week in one email. */
async function weeklySummaries(now = new Date()) {
  const ist = IST(now);
  if (ist.getDay() !== 1 || ist.getHours() < 9) return 0;
  const end = new Date(now); const start = new Date(now.getTime() - 7 * 86400000);
  const label = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} – ${new Date(now.getTime() - 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;
  const weekKey = start.toISOString().slice(0, 10);
  const { finishedJobs } = require('../jobs/earnings');
  const Worker = require('../worker/worker.model');
  const workers = await Worker.find({ isBlocked: { $ne: true }, emailVerified: true, email: { $ne: null } }).select('_id name rating').limit(2000).lean();
  let sent = 0;
  for (const w of workers) {
    const jobs = (await finishedJobs({ workerId: w._id }, start)).filter((j) => new Date(j.at) <= end);
    if (!jobs.length) continue;
    const dues = await require('../worker/worker-dues.service').getDuesStatus(w._id);
    await send('provider.weekly_summary', {
      to: { kind: 'worker', id: w._id }, refId: `week:${weekKey}`,
      ctx: { jobs: jobs.length, earnedPaise: jobs.reduce((t, j) => t + j.paise, 0), tipsPaise: jobs.reduce((t, j) => t + (j.tipPaise || 0), 0), rating: w.rating, duesPaise: dues.duesPaise, week: label },
    });
    sent += 1;
  }
  return sent;
}

/** 8 am IST: yesterday's numbers to ops. */
async function dailySummary(now = new Date()) {
  const ist = IST(now);
  if (ist.getHours() < 8) return false;
  const { istDayStart } = require('../../core/time/ist');
  const todayStart = istDayStart(now).getTime();
  const yStart = new Date(todayStart - 86400000);
  const yEnd = new Date(todayStart);
  const { bookingsIn } = require('../admin-portal/analytics.service');
  const rows = bookingsIn ? await bookingsIn(yStart.getTime(), yEnd.getTime() - 1) : [];
  const done = rows.filter((r) => r.statusBucket === 'completed');
  const User = require('../user/user.model');
  const [newCustomers, attention, kycWaiting] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: yStart, $lt: yEnd } }),
    require('../jobs/ops.service').attention().catch(() => ({ count: 0 })),
    require('../onboarding/onboarding.model').ProviderEnrolment.countDocuments({ status: 'pending_review' }).catch(() => 0),
  ]);
  await send('admin.daily_summary', {
    to: 'ops', refId: `day:${yStart.toISOString().slice(0, 10)}`,
    ctx: {
      day: yStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
      bookings: rows.length, completed: done.length, cancelled: rows.filter((r) => r.statusBucket === 'cancelled').length,
      gmvPaise: done.reduce((t, r) => t + (r.totalPaise || 0), 0),
      takePaise: done.reduce((t, r) => t + (r.commissionPaise || 0) + (r.platformFeePaise || 0), 0),
      newCustomers, stuck: attention.count || 0, kycWaiting,
    },
  });
  return true;
}

async function sweep() {
  const out = {};
  out.reminders = await rateReminders().catch((e) => { logger.warn({ err: e.message }, '[messaging] reminders failed'); return 0; });
  out.weekly = await weeklySummaries().catch((e) => { logger.warn({ err: e.message }, '[messaging] weekly failed'); return 0; });
  out.daily = await dailySummary().catch((e) => { logger.warn({ err: e.message }, '[messaging] daily failed'); return false; });
  return out;
}

module.exports = { onStatus, sweep, rateReminders, weeklySummaries, dailySummary, MAP };
