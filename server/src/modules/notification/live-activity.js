// iPhone Live Activities (Lock Screen and Dynamic Island) for a job the customer is tracking: the app registers its activity's push token, every status change updates it through APNs, and the end of the job ends it.
const mongoose = require('mongoose');
const logger = require('../../core/logger');

// One stage per moment the customer cares about; the Swift widget draws these (packages/native/ios JobActivityAttributes.Stage).
const STAGES = ['booked', 'assigned', 'on_the_way', 'arrived', 'working', 'payment', 'done'];
const STAGE_OF = {
  repair: {
    CONFIRMED: 'booked', PROVIDER_ASSIGNED: 'assigned', WORKER_ACCEPTED: 'assigned', PICKUP_SCHEDULED: 'assigned',
    ON_THE_WAY: 'on_the_way', ARRIVED: 'arrived', DIAGNOSING: 'working', QUOTE_PENDING: 'working', CUSTOMER_APPROVAL_PENDING: 'working', APPROVED: 'working',
    DEVICE_PICKED_UP: 'working', AT_WORKSHOP: 'working', REPAIR_IN_PROGRESS: 'working', QA_PENDING: 'payment', READY_FOR_RETURN: 'payment', OUT_FOR_RETURN: 'payment',
    COMPLETED: 'done',
  },
  pet: {
    PROVIDER_SEARCHING: 'booked', PROVIDER_ASSIGNED: 'assigned', PROVIDER_ACCEPTED: 'assigned', PROVIDER_EN_ROUTE: 'on_the_way', PROVIDER_ARRIVED: 'arrived',
    SERVICE_STARTED: 'working', SERVICE_COMPLETED: 'payment', CUSTOMER_CONFIRMATION: 'payment', PAYMENT_PENDING: 'payment', PAYMENT_COMPLETED: 'done', CLOSED: 'done',
  },
  helping: {
    WORKER_SEARCHING: 'booked', WORKER_ACCEPTED: 'assigned', EN_ROUTE: 'on_the_way', ARRIVED: 'arrived', IN_PROGRESS: 'working', SHOPPING: 'working',
    RETURNING: 'payment', AT_DROPOFF: 'payment', HANDED_OVER: 'payment', COMPLETED: 'done',
  },
};
const ENDED = new Set(['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED']);
// Same stages, worded for whoever is looking: the customer (ZappyOne app) or the pro (ServicePro).
const HEADLINE = {
  customer: {
    booked: 'Finding your pro', assigned: 'Your pro is confirmed', on_the_way: 'Your pro is on the way', arrived: 'Your pro has arrived',
    working: 'Work in progress', payment: 'Job done. Time to pay', done: 'All done',
  },
  servicepro: {
    booked: 'New job', assigned: 'Job accepted', on_the_way: 'Head to the customer', arrived: 'Ask for the start code',
    working: 'Job in progress', payment: 'Collect payment and finish', done: 'Job done',
  },
};
const BUNDLE_OF = { customer: 'com.zappyone.app', servicepro: 'com.zappyone.servicepro' };

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  token: { type: String, required: true },
  app: { type: String, default: 'customer' },
  endedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ jobId: 1, token: 1 }, { unique: true });
const LiveActivity = mongoose.models.LiveActivity || mongoose.model('LiveActivity', schema);

const stageOf = (kind, status) => STAGE_OF[kind]?.[status] || null;

// What the widget shows: the Codable ContentState in Swift has exactly these fields.
function stateFor(kind, doc, app = 'customer') {
  const stage = stageOf(kind, doc.status) || 'booked';
  return {
    stage,
    step: STAGES.indexOf(stage),
    steps: STAGES.length,
    headline: (HEADLINE[app] || HEADLINE.customer)[stage],
    proName: String(doc.providerSnapshot?.name || doc.workerName || '').split(/\s+/)[0] || null,
    etaMinutes: null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

async function register({ userId, kind, jobId, token, app = 'customer' }) {
  if (!/^[0-9a-f]{32,400}$/i.test(String(token || ''))) throw Object.assign(new Error('That is not a Live Activity token.'), { status: 400, code: 'BAD_TOKEN' });
  await LiveActivity.updateOne({ jobId, token }, { $set: { userId, kind, app, endedAt: null }, $setOnInsert: { jobId, token } }, { upsert: true });
  return { ok: true };
}

// Every status change (jobs/job-events): update each open activity for the job, or end it when the job is over.
async function onStatus(kind, doc) {
  if (!STAGE_OF[kind]) return { sent: 0 };
  const rows = await LiveActivity.find({ jobId: doc._id, endedAt: null }).limit(10).lean();
  if (!rows.length) return { sent: 0 };
  const over = ENDED.has(doc.status) || stageOf(kind, doc.status) === 'done';
  const apns = require('./apns');
  let sent = 0;
  for (const r of rows) {
    const app = r.app || 'customer';
    const out = await apns.sendLiveActivity({ token: r.token, event: over ? 'end' : 'update', contentState: stateFor(kind, doc, app), dismissAfterSec: over ? 15 * 60 : null, bundle: BUNDLE_OF[app] || BUNDLE_OF.customer })
      .catch((e) => ({ ok: false, reason: e.message }));
    if (out.ok) sent += 1;
    if (over || out.stale) await LiveActivity.updateOne({ _id: r._id }, { $set: { endedAt: new Date() } });
  }
  if (sent) logger.info({ kind, id: String(doc._id), sent, over }, '[live-activity] updated');
  return { sent };
}

module.exports = { register, onStatus, stateFor, stageOf, STAGES, LiveActivity };
