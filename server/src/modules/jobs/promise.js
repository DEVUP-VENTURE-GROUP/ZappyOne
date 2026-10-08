/**
 * The arrival promise, kept: how soon we said someone would be at the door,
 * whether they were, and what happens when they are not.
 *
 *   start    when a provider accepts a visit (someone comes to the customer),
 *            the promise is set from where they are now (jobs/arrival): now +
 *            the estimate; for a booking made for later, the booked time.
 *            A new provider (after a hand-back) starts a new promise.
 *   kept     reaching the "arrived" status by the promise + GRACE_MIN.
 *   missed   GRACE_MIN past it and not there: the customer is told at once with
 *            a fresh estimate from the provider's live position, and the
 *            provider is nudged. Once per promise.
 *   used     on-time rate per provider feeds matching (repair ranking) and
 *            Admin → Live operations (on-time by provider, hour and area).
 *
 * Every kind with a visit: repairs at the door or picked up, pet care visits,
 * helping. Wired to every status change (jobs/job-events announce).
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const GRACE_MIN = 5;
const LATER_AFTER_MIN = 30; // a booked time this far ahead is a booking for later

const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  providerKind: { type: String, enum: ['worker', 'shop'], required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  reference: { type: String, default: '' },
  scheduled: { type: Boolean, default: false },
  promisedMinutes: { type: Number, default: null },
  promisedBy: { type: Date, required: true, index: true },
  source: { type: String, default: '' },
  area: { type: String, default: '' }, // ~1 km bucket "17.44,78.38"
  hour: { type: Number, default: null }, // IST hour the promise was made
  arrivedAt: { type: Date, default: null },
  onTime: { type: Boolean, default: null },
  lateMinutes: { type: Number, default: null },
  missedAt: { type: Date, default: null },
  closed: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ closed: 1, arrivedAt: 1, missedAt: 1, promisedBy: 1 });
schema.index({ createdAt: -1 });
const ArrivalPromise = mongoose.models.ArrivalPromise || mongoose.model('ArrivalPromise', schema);

const RULES = () => require('./give-back').RULES;
const istHour = (d) => Number(new Date(d).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** Does someone travel to the customer on this job? */
function isVisit(kind, doc) {
  if (kind === 'repair') return doc.serviceMode !== 'workshop';
  if (kind === 'pet') return !['provider_location', 'boarding', 'daycare'].includes(doc.serviceMode);
  return kind === 'helping';
}

/** The statuses that mean "at the door": travelling-or-there, minus travelling. */
const arrivedStatuses = (kind) => {
  const r = RULES()[kind];
  return r ? r.late.filter((s) => !r.travelling.includes(s)) : [];
};

const providerOf = (doc) => (doc.workerId ? { kind: 'worker', id: doc.workerId } : doc.shopId ? { kind: 'shop', id: doc.shopId } : null);

async function start(kind, doc) {
  const provider = providerOf(doc);
  const at = KINDS[kind]?.open?.start?.(doc);
  if (!provider || !at || !isVisit(kind, doc)) return null;
  const now = Date.now();
  const booked = doc.scheduledAt ? new Date(doc.scheduledAt).getTime() : null;
  const later = booked && booked - now > LATER_AFTER_MIN * 60000;
  let promisedBy; let minutes = null; let source = 'booked_time';
  if (later) {
    promisedBy = new Date(booked);
  } else {
    const est = (await require('./arrival').forProviders([provider], { lat: at.lat, lng: at.lng })).get(`${provider.kind}:${provider.id}`);
    if (!est) return null; // we do not know where they are: promise nothing rather than guess
    minutes = est.minutes; source = est.source;
    promisedBy = new Date(now + minutes * 60000);
  }
  return ArrivalPromise.findOneAndUpdate(
    { jobId: doc._id },
    { $set: {
      kind, userId: doc.userId, providerKind: provider.kind, providerId: provider.id, reference: doc.reference || '',
      scheduled: !!later, promisedMinutes: minutes, promisedBy, source,
      area: `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`, hour: istHour(now),
      arrivedAt: null, onTime: null, lateMinutes: null, missedAt: null, closed: false,
    } },
    { upsert: true, new: true },
  );
}

async function arrived(doc) {
  const p = await ArrivalPromise.findOne({ jobId: doc._id, arrivedAt: null, closed: false });
  if (!p) return null;
  const at = new Date();
  const late = Math.round((at - p.promisedBy) / 60000);
  p.arrivedAt = at;
  p.onTime = late <= GRACE_MIN;
  p.lateMinutes = Math.max(0, late);
  p.closed = true;
  await p.save();
  return p;
}

/** Every status change on every job (jobs/job-events announce). Never throws. */
async function onStatus(kind, doc, status) {
  try {
    const r = RULES()[kind];
    if (!r) return;
    if (r.accepted.includes(status)) await start(kind, doc);
    else if (arrivedStatuses(kind).includes(status)) await arrived(doc);
    else if (KINDS[kind]?.ops?.terminal?.includes(status) || status === r.pool) {
      // Ended, or handed back to look for someone else: this promise is over unkept, not missed.
      await ArrivalPromise.updateOne({ jobId: doc._id, arrivedAt: null, closed: false }, { $set: { closed: true } });
    }
  } catch (e) {
    logger.warn({ err: e.message, kind, status }, '[promise] not updated');
  }
}

/** Promises past their time + grace with nobody there: tell the customer, nudge the provider. */
async function sweep({ now = Date.now() } = {}) {
  const due = await ArrivalPromise.find({
    closed: false, arrivedAt: null, missedAt: null, promisedBy: { $lt: new Date(now - GRACE_MIN * 60000) },
  }).limit(100);
  const events = require('./job-events');
  let told = 0;
  for (const p of due) {
    const claimed = await ArrivalPromise.updateOne({ _id: p._id, missedAt: null }, { $set: { missedAt: new Date(now) } });
    if (!claimed.modifiedCount) continue;
    const doc = await KINDS[p.kind].model().findById(p.jobId).lean();
    if (!doc || KINDS[p.kind].ops?.terminal?.includes(doc.status)) { await ArrivalPromise.updateOne({ _id: p._id }, { $set: { closed: true } }); continue; }
    const at = KINDS[p.kind].open.start(doc);
    const est = at ? (await require('./arrival').forProviders([{ kind: p.providerKind, id: p.providerId }], at)).get(`${p.providerKind}:${p.providerId}`) : null;
    const id = String(p.jobId);
    await events.push({ kind: 'user', id: p.userId }, {
      title: 'Running a little late',
      body: est
        ? `Sorry, your ${KINDS[p.kind].label} provider is running late. They can reach you in about ${est.minutes} min. You can call them from the booking.`
        : `Sorry, your ${KINDS[p.kind].label} provider is running late. You can call them from the booking, or ask us to find someone else.`,
      deepLink: KINDS[p.kind].link(id), data: { kind: p.kind, id, type: 'arrival_late' },
    });
    await events.push({ kind: p.providerKind, id: p.providerId }, {
      title: 'You are late for a customer',
      body: `${p.reference || 'Your job'}: you were due by ${clock(p.promisedBy)}. Head there now, or call the customer.`,
      deepLink: KINDS[p.kind].providerLink(id), data: { kind: p.kind, id },
    });
    told += 1;
  }
  return { told };
}

/** On-time share per provider over the last 30 days, for ranking. Map(id → 0..1); only with 3+ visits. */
async function onTimeRates(ids) {
  if (!ids.length) return new Map();
  const rows = await ArrivalPromise.aggregate([
    { $match: { providerId: { $in: ids.map((i) => new mongoose.Types.ObjectId(String(i))) }, onTime: { $ne: null }, createdAt: { $gte: new Date(Date.now() - 30 * 86400e3) } } },
    { $group: { _id: '$providerId', n: { $sum: 1 }, kept: { $sum: { $cond: ['$onTime', 1, 0] } } } },
  ]);
  return new Map(rows.filter((r) => r.n >= 3).map((r) => [String(r._id), r.kept / r.n]));
}

/** What the customer sees on the booking: due by when, and whether it was kept. */
async function viewFor(jobId) {
  const p = await ArrivalPromise.findOne({ jobId }).select('promisedBy promisedMinutes scheduled arrivedAt onTime missedAt closed').lean();
  return p ? { dueBy: p.promisedBy, minutes: p.promisedMinutes, scheduled: p.scheduled, arrivedAt: p.arrivedAt, onTime: p.onTime, late: !!p.missedAt && !p.arrivedAt } : null;
}

/** Admin: on-time over the last N days — overall, by hour, by area, by provider. */
async function report({ days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400e3);
  const match = { createdAt: { $gte: since }, onTime: { $ne: null } };
  const group = (key) => ArrivalPromise.aggregate([
    { $match: match },
    { $group: { _id: key, n: { $sum: 1 }, kept: { $sum: { $cond: ['$onTime', 1, 0] } }, late: { $avg: '$lateMinutes' }, promised: { $avg: '$promisedMinutes' } } },
    { $sort: { n: -1 } }, { $limit: 50 },
  ]);
  const [all, byHour, byArea, byProvider, open] = await Promise.all([
    group(null), group('$hour'), group('$area'), group({ kind: '$providerKind', id: '$providerId' }),
    ArrivalPromise.countDocuments({ closed: false, arrivedAt: null }),
  ]);
  const shape = (r) => ({ key: r._id, visits: r.n, onTimePct: r.n ? Math.round((r.kept / r.n) * 100) : null, avgLateMin: Math.round(r.late || 0), avgPromisedMin: r.promised != null ? Math.round(r.promised) : null });
  // Names for the provider rows.
  const ids = byProvider.map((r) => r._id);
  const [workers, shops] = await Promise.all([
    require('../worker/worker.model').find({ _id: { $in: ids.filter((i) => i.kind === 'worker').map((i) => i.id) } }).select('name phone').lean(),
    require('../shop/shop.model').find({ _id: { $in: ids.filter((i) => i.kind === 'shop').map((i) => i.id) } }).select('businessName phone').lean(),
  ]);
  const names = new Map([...workers.map((w) => [String(w._id), w.name]), ...shops.map((s) => [String(s._id), s.businessName])]);
  return {
    days, onTrackNow: open,
    overall: all[0] ? shape(all[0]) : { visits: 0, onTimePct: null, avgLateMin: 0 },
    byHour: byHour.map(shape).sort((a, b) => a.key - b.key),
    byArea: byArea.map(shape),
    byProvider: byProvider.map((r) => ({ ...shape(r), kind: r._id.kind, id: r._id.id, name: names.get(String(r._id.id)) || 'Unknown' }))
      .sort((a, b) => (a.onTimePct ?? 101) - (b.onTimePct ?? 101)),
  };
}

module.exports = { onStatus, start, arrived, sweep, onTimeRates, viewFor, report, ArrivalPromise, GRACE_MIN };
