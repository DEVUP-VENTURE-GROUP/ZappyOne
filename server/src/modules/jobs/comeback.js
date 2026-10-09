/**
 * A booking closed because nobody was free is a customer we nearly served.
 *
 * When one closes (jobs/waves), it is remembered for WATCH_HOURS. If, in that
 * time, a worker approved for that service comes online near the customer,
 * the customer is told once: "someone is free near you now — book again", a
 * tap away from the same service. Not if they have booked that service since.
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const WATCH_HOURS = 3;
const NEAR_KM = 10;

const watchSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  lineCode: { type: String, required: true, index: true },
  path: { type: String, default: '/services' },
  service: { type: String, default: '' },
  location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
  closedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  notifiedAt: { type: Date, default: null },
});
watchSchema.index({ location: '2dsphere' });
watchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const UnmatchedWatch = mongoose.models.UnmatchedWatch || mongoose.model('UnmatchedWatch', watchSchema);

/** Remember a booking that closed with nobody to take it. Best effort. */
async function remember(kind, doc) {
  try {
    const k = KINDS[kind];
    const lineCode = await k?.line?.(doc);
    const at = require('./kinds').whereOf(kind, doc);
    if (!lineCode || !at) return;
    const { ServiceLine } = require('../onboarding/onboarding.model');
    const line = await ServiceLine.findOne({ code: lineCode }).select('name customerPath').lean();
    await UnmatchedWatch.updateOne(
      { jobId: doc._id },
      { $setOnInsert: {
        kind, jobId: doc._id, userId: doc.userId, lineCode, path: line?.customerPath || '/services', service: line?.name || '',
        location: { type: 'Point', coordinates: [at.lng, at.lat] }, closedAt: new Date(), expiresAt: new Date(Date.now() + WATCH_HOURS * 3600e3),
      } },
      { upsert: true },
    );
  } catch (e) {
    logger.warn({ err: e.message, kind }, '[comeback] not remembered');
  }
}

/** A worker came online: tell customers near them who just missed out on their service. */
async function onWorkerOnline(workerId, lat, lng) {
  try {
    const lines = [...await require('../onboarding/eligibility').approvedLines({ role: 'worker', id: workerId })];
    if (!lines.length || typeof lat !== 'number') return 0;
    const near = await UnmatchedWatch.find({
      lineCode: { $in: lines }, notifiedAt: null, expiresAt: { $gt: new Date() },
      location: { $geoWithin: { $centerSphere: [[lng, lat], NEAR_KM / 6378.1] } },
    }).limit(20).lean();
    let told = 0;
    for (const w of near) {
      // Booked that service again since? Then they are sorted.
      const k = KINDS[w.kind];
      const rebooked = await k.model().exists({ userId: w.userId, _id: { $ne: w.jobId }, createdAt: { $gt: w.closedAt } });
      const claimed = await UnmatchedWatch.updateOne({ _id: w._id, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
      if (rebooked || !claimed.modifiedCount) continue;
      await require('./job-events').push({ kind: 'user', id: w.userId }, {
        title: 'Someone is free near you now',
        body: `${w.service || 'Your service'}: a verified pro just came online nearby. Book again and they can take it.`,
        deepLink: w.path, data: { type: 'comeback', kind: w.kind },
      }).catch(() => {});
      told += 1;
    }
    return told;
  } catch (e) {
    logger.warn({ err: e.message, workerId: String(workerId) }, '[comeback] check failed');
    return 0;
  }
}

module.exports = { remember, onWorkerOnline, UnmatchedWatch, WATCH_HOURS };
