const mongoose = require('mongoose');
const { KINDS } = require('./kinds');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

// Only once work is under way; before that, a delay is a reschedule or a hand-back.
const WORKING = {
  repair: ['ARRIVED', 'DIAGNOSING', 'QUOTE_PENDING', 'APPROVED', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING'],
  pet: ['PROVIDER_ARRIVED', 'PET_HANDOVER', 'SERVICE_STARTED', 'SERVICE_PAUSED'],
  helping: ['ARRIVED', 'TASK_STARTED', 'IN_PROGRESS', 'APPROVAL_REQUIRED', 'RETURNING', 'AT_DROPOFF'],
};
const MINUTES = [15, 30, 60, 120];
const MAX_PER_JOB = 3;
const REASONS = [
  { code: 'more_work', label: 'More work than expected' },
  { code: 'waiting_part', label: 'Waiting for a part' },
  { code: 'testing', label: 'Testing takes longer' },
  { code: 'other', label: 'Other reason' },
];

const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  providerKind: { type: String, enum: ['worker', 'shop'], required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  minutes: { type: Number, required: true },
  reason: { type: String, required: true },
  note: { type: String, default: '', maxlength: 200 },
  until: { type: Date, required: true },
}, { timestamps: true });
const JobMoreTime = mongoose.models.JobMoreTime || mongoose.model('JobMoreTime', schema);

const holderOf = (doc, actor) => (
  (actor.kind === 'worker' && String(doc.workerId || '') === String(actor.id)) || (actor.kind === 'shop' && String(doc.shopId || '') === String(actor.id))
);
const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// The pro says the job needs longer: the customer is told the new finish time, and a repair's stage clock moves with it.
async function ask({ kind, id, actor, minutes, reason, note = '' }) {
  if (!WORKING[kind]) throw err(400, 'NOT_SUPPORTED', 'This kind of job cannot ask for more time.');
  if (!MINUTES.includes(minutes)) throw err(400, 'BAD_MINUTES', 'Pick 15, 30, 60 or 120 minutes.');
  const r = REASONS.find((x) => x.code === reason);
  if (!r) throw err(400, 'BAD_REASON', 'Say why it needs longer.');
  if (reason === 'other' && String(note).trim().length < 5) throw err(400, 'NOTE_REQUIRED', 'Say in a few words why it needs longer.');
  const doc = await KINDS[kind].model().findById(id).lean();
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (!holderOf(doc, actor)) throw err(403, 'FORBIDDEN', 'This job is not yours');
  if (!WORKING[kind].includes(doc.status)) throw err(409, 'NOT_NOW', 'You can ask for more time once you have started the work.');
  const count = await JobMoreTime.countDocuments({ jobId: doc._id });
  if (count >= MAX_PER_JOB) throw err(409, 'LIMIT', 'You have already asked for more time 3 times. Call ZappyOne support.');

  const last = await JobMoreTime.findOne({ jobId: doc._id }).sort({ createdAt: -1 }).lean();
  const from = Math.max(Date.now(), last?.until ? new Date(last.until).getTime() : 0);
  const until = new Date(from + minutes * 60000);
  const row = await JobMoreTime.create({ kind, jobId: doc._id, providerKind: actor.kind, providerId: actor.id, minutes, reason, note: String(note).trim().slice(0, 200), until });

  if (kind === 'repair' && doc.stageDeadlineAt) {
    await KINDS.repair.model().updateOne({ _id: doc._id }, { $set: { stageDeadlineAt: new Date(new Date(doc.stageDeadlineAt).getTime() + minutes * 60000) } });
  }
  const events = require('./job-events');
  const jobId = String(doc._id);
  await events.push({ kind: 'user', id: doc.userId }, {
    title: 'Your job needs a little longer',
    body: `${r.label}. Your pro expects to finish by about ${clock(until)}. Nothing extra is charged unless you approve a new quote.`,
    deepLink: KINDS[kind].link(jobId), data: { kind, id: jobId, type: 'more_time' },
  }).catch(() => {});
  events.toProvider('user', doc.userId, 'job.update', { kind, id: jobId, status: doc.status, at: new Date().toISOString() });
  return { ok: true, until: row.until, left: MAX_PER_JOB - count - 1, message: `The customer has been told you expect to finish by ${clock(until)}.` };
}

// The latest extension on a job, for both screens.
async function viewFor(jobId) {
  const [last, count] = await Promise.all([
    JobMoreTime.findOne({ jobId }).sort({ createdAt: -1 }).select('minutes reason until createdAt').lean(),
    JobMoreTime.countDocuments({ jobId }),
  ]);
  if (!last) return null;
  return { until: last.until, minutes: last.minutes, reason: REASONS.find((x) => x.code === last.reason)?.label || '', count, left: Math.max(0, MAX_PER_JOB - count) };
}

const canAsk = (kind, status) => !!WORKING[kind]?.includes(status);

module.exports = { ask, viewFor, canAsk, JobMoreTime, MINUTES, REASONS, MAX_PER_JOB };
