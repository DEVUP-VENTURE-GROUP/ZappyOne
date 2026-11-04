// Urgent things a person at ZappyOne must act on (SOS, payment disputes, failed refunds), kept until an admin marks them done; shown in the admin to-do bell.
const mongoose = require('mongoose');
const logger = require('../../core/logger');

const schema = new mongoose.Schema({
  type: { type: String, required: true, maxlength: 60 },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, default: '', maxlength: 1000 },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  urgent: { type: Boolean, default: false },
  // Set only while open: a re-sent alert for the same thing updates it instead of stacking.
  openKey: { type: String, default: undefined },
  doneAt: { type: Date, default: null },
  doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });
schema.index({ doneAt: 1, createdAt: -1 });
schema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
const OpsAlert = mongoose.models.OpsAlert || mongoose.model('OpsAlert', schema);

const clean = (s) => String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '').replace(/\s+/g, ' ').trim();

// Never throws: an alert that cannot be saved is logged, and the action that raised it goes on.
async function raise({ type, title, body = '', data = null, urgent = false, key = null }) {
  const row = { type, title: clean(title).slice(0, 200), body: clean(body).slice(0, 1000), data, urgent: !!urgent };
  try {
    if (key) return await OpsAlert.findOneAndUpdate({ openKey: key }, { $set: row }, { upsert: true, new: true });
    return await OpsAlert.create(row);
  } catch (err) {
    if (err.code === 11000 && key) return OpsAlert.findOneAndUpdate({ openKey: key }, { $set: row }, { new: true }).catch(() => null);
    logger.error({ err: err.message, type, title }, '[ops-alert] not saved');
    return null;
  }
}

const open = (limit = 20) => OpsAlert.find({ doneAt: null }).sort({ urgent: -1, createdAt: -1 }).limit(limit).lean();
const openCount = () => OpsAlert.countDocuments({ doneAt: null });

async function done(id, adminId) {
  const r = await OpsAlert.updateOne({ _id: id, doneAt: null }, { $set: { doneAt: new Date(), doneBy: adminId || null }, $unset: { openKey: 1 } });
  return { done: r.modifiedCount === 1 };
}

module.exports = { OpsAlert, raise, open, openCount, done };
