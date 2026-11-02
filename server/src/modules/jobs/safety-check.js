const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

// A pro this long inside a customer's home is asked "are you OK?"; no answer in REPLY_MIN raises an SOS for ops.
const CHECK_MIN = 90;
const REPLY_MIN = 10;

const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  providerKind: { type: String, enum: ['worker', 'shop'], required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reference: { type: String, default: '' },
  since: { type: Date, required: true },
  askedAt: { type: Date, default: null },
  escalatedAt: { type: Date, default: null },
  closed: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ closed: 1, askedAt: 1, since: 1 });
const SafetyCheck = mongoose.models.SafetyCheck || mongoose.model('SafetyCheck', schema);

const RULES = () => require('./give-back').RULES;
const providerOf = (doc) => (doc.workerId ? { kind: 'worker', id: doc.workerId } : doc.shopId ? { kind: 'shop', id: doc.shopId } : null);
// Leaving with the device ends the time in the home; the return visit starts a new one on arrival.
const LEAVES = { repair: ['DEVICE_PICKED_UP'] };

async function onStatus(kind, doc, status) {
  try {
    const r = RULES()[kind];
    if (!r) return;
    const ended = KINDS[kind]?.ops?.terminal?.includes(status) || status === r.pool || (LEAVES[kind] || []).includes(status);
    if (ended) {
      await SafetyCheck.updateOne({ jobId: doc._id, closed: false }, { $set: { closed: true } });
      return;
    }
    if (!r.atCustomer(doc).includes(status)) return;
    const provider = providerOf(doc);
    if (!provider) return;
    await SafetyCheck.updateOne({ jobId: doc._id }, {
      $set: { kind, providerKind: provider.kind, providerId: provider.id, reference: doc.reference || '', since: new Date(), askedAt: null, escalatedAt: null, closed: false },
    }, { upsert: true });
  } catch (e) {
    logger.warn({ err: e.message, kind, status }, '[safety-check] not updated');
  }
}

// The pro says they are fine: the clock starts again from now. The route checks the job is theirs.
async function confirmSafe(jobId) {
  await SafetyCheck.updateOne({ jobId, closed: false }, { $set: { since: new Date(), askedAt: null, escalatedAt: null } });
  return { ok: true, message: 'Thanks. We will check again later.' };
}

async function viewFor(jobId) {
  const row = await SafetyCheck.findOne({ jobId, closed: false }).select('askedAt escalatedAt').lean();
  return row?.askedAt ? { asked: true, askedAt: row.askedAt, escalated: !!row.escalatedAt } : null;
}

async function sweep({ now = Date.now() } = {}) {
  const events = require('./job-events');
  const toAsk = await SafetyCheck.find({ closed: false, askedAt: null, since: { $lt: new Date(now - CHECK_MIN * 60000) } }).limit(200).lean();
  for (const row of toAsk) {
    const claimed = await SafetyCheck.updateOne({ _id: row._id, askedAt: null }, { $set: { askedAt: new Date(now) } });
    if (!claimed.modifiedCount) continue;
    const id = String(row.jobId);
    await events.push({ kind: row.providerKind, id: row.providerId }, {
      title: 'Are you OK?',
      body: `You have been at the customer for a while on ${row.reference || 'this job'}. Tap I'm safe on the job, or SOS if you need help.`,
      deepLink: KINDS[row.kind].providerLink(id), data: { kind: row.kind, id, type: 'safety_check' },
    }).catch(() => {});
    events.toProvider(row.providerKind, row.providerId, 'job.update', { kind: row.kind, id, status: 'SAFETY_CHECK', at: new Date(now).toISOString() });
  }

  const silent = await SafetyCheck.find({ closed: false, escalatedAt: null, askedAt: { $lt: new Date(now - REPLY_MIN * 60000) } }).limit(100).lean();
  for (const row of silent) {
    const claimed = await SafetyCheck.updateOne({ _id: row._id, escalatedAt: null }, { $set: { escalatedAt: new Date(now) } });
    if (!claimed.modifiedCount) continue;
    const message = `No answer to the safety check on ${row.reference || 'a job'} after ${CHECK_MIN} min at the customer. Call them now.`;
    if (row.providerKind === 'worker') {
      await require('../worker/sos.service').triggerSOS({ workerId: row.providerId, jobId: row.jobId, message, type: 'safety_check_missed' })
        .catch((e) => logger.error({ err: e.message, jobId: String(row.jobId) }, '[safety-check] SOS not raised'));
    } else {
      const { redis } = require('../../config/redis');
      redis.publish('notification:admin:ops', JSON.stringify({ type: 'safety_check_missed', title: 'Safety check not answered', body: message, data: { kind: row.kind, id: String(row.jobId) }, urgent: true })).catch(() => {});
    }
  }
  return { asked: toAsk.length, escalated: silent.length };
}

module.exports = { SafetyCheck, onStatus, confirmSafe, viewFor, sweep, CHECK_MIN, REPLY_MIN };
