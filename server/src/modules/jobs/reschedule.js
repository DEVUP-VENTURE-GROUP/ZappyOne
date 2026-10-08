/**
 * Moving a booked time, for every kind of job (repairs, pet care, helping).
 *
 *   when      only a booking made for later, and only before the provider sets
 *             off (searching, offered or accepted). Once they are on the way,
 *             it is a cancel, not a move.
 *   to        at least LEAD_MIN from now, at most AHEAD_DAYS out.
 *   how often MAX_MOVES per booking: a slot a provider planned their day
 *             around is not moved endlessly.
 *   who hears the provider who accepted it, at once (push + their screen);
 *             they keep the job. Every move is logged (JobReschedule) for ops.
 */
const mongoose = require('mongoose');
const { KINDS } = require('./kinds');

const LEAD_MIN = 30;
const AHEAD_DAYS = 14;
const MAX_MOVES = 2;

/** Before anyone sets off, per kind. */
const MOVABLE = {
  repair: ['CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'PICKUP_SCHEDULED'],
  pet: ['BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED'],
  helping: ['CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED', 'WORKER_ACCEPTED'],
};

const logSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  from: { type: Date, default: null },
  to: { type: Date, required: true },
  providerTold: { type: Boolean, default: false },
}, { timestamps: true });
const JobReschedule = mongoose.models.JobReschedule || mongoose.model('JobReschedule', logSchema);

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const istLabel = (d) => new Date(d).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

/** Can the customer move this booking now, and how many moves are left. */
async function view(kind, doc) {
  if (!MOVABLE[kind]) return { allowed: false };
  const moves = await JobReschedule.countDocuments({ jobId: doc._id });
  const left = Math.max(0, MAX_MOVES - moves);
  if (!doc.scheduledAt) return { allowed: false, left, reason: 'This booking is for now, so there is no time to move.' };
  if (!MOVABLE[kind].includes(doc.status)) return { allowed: false, left, reason: 'Your provider is already on the way, so the time cannot be moved.' };
  if (!left) return { allowed: false, left, reason: `You have moved this booking ${MAX_MOVES} times already. Cancel and book again if you need another time.` };
  return { allowed: true, left, leadMinutes: LEAD_MIN, aheadDays: AHEAD_DAYS };
}

async function reschedule({ kind, id, userId, scheduledAt }) {
  const Model = KINDS[kind]?.model();
  if (!Model || !MOVABLE[kind]) throw err(400, 'NOT_SUPPORTED', 'This booking cannot be moved here.');
  const to = new Date(scheduledAt);
  if (Number.isNaN(to.getTime())) throw err(400, 'BAD_TIME', 'Choose a date and time.');
  if (to.getTime() < Date.now() + LEAD_MIN * 60000) throw err(400, 'TOO_SOON', `Choose a time at least ${LEAD_MIN} minutes from now.`);
  if (to.getTime() > Date.now() + AHEAD_DAYS * 86400000) throw err(400, 'TOO_FAR', `Choose a time within the next ${AHEAD_DAYS} days.`);

  const doc = await Model.findOne({ _id: id, userId }).lean();
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  const v = await view(kind, doc);
  if (!v.allowed) throw err(409, 'NOT_MOVABLE', v.reason);

  // Atomic: only if nothing moved on (status, time) since we looked.
  const set = { scheduledAt: to, ...(kind === 'repair' ? { slotLabel: istLabel(to) } : {}) };
  const row = await Model.findOneAndUpdate(
    { _id: id, userId, status: { $in: MOVABLE[kind] }, scheduledAt: doc.scheduledAt },
    { $set: set }, { new: true },
  ).lean();
  if (!row) throw err(409, 'CHANGED', 'This booking just changed. Refresh and try again.');

  const events = require('./job-events');
  const provider = row.workerId ? { kind: 'worker', id: row.workerId } : row.shopId ? { kind: 'shop', id: row.shopId } : null;
  const payload = { kind, id: String(row._id), status: row.status, scheduledAt: to.toISOString(), at: new Date().toISOString() };
  events.toProvider('user', row.userId, 'job.update', payload);
  if (provider) {
    events.toProvider(provider.kind, provider.id, 'job.update', payload);
    await events.push(provider, {
      title: 'Customer moved the booking time',
      body: `${row.reference || 'A booking'} is now on ${istLabel(to)}. If that time does not work for you, open the job.`,
      deepLink: KINDS[kind].providerLink(String(row._id)), data: { kind, id: String(row._id), status: row.status },
    }).catch(() => {});
  }
  await JobReschedule.create({ kind, jobId: row._id, userId, from: doc.scheduledAt, to, providerTold: !!provider });
  return {
    scheduledAt: to.toISOString(), left: v.left - 1,
    message: `Moved to ${istLabel(to)}.${provider ? ' Your provider has been told.' : ''}`,
  };
}

module.exports = { view, reschedule, JobReschedule, MOVABLE, MAX_MOVES, LEAD_MIN, AHEAD_DAYS };
