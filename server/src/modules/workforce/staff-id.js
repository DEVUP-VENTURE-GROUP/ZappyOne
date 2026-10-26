// Permanent staff IDs (ZO00001, ZO00002…) for ID cards and search: issued once from an atomic counter, never reused, kept through hub moves.
const mongoose = require('mongoose');

const Counter = mongoose.models.Counter || mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));
const format = (n) => `ZO${String(n).padStart(5, '0')}`;

async function ensure(workerId) {
  const Worker = require('../worker/worker.model');
  const w = await Worker.findById(workerId).select('employment').lean();
  if (!w || w.employment?.type !== 'staff') return null;
  if (w.employment.staffId) return w.employment.staffId;
  const { seq } = await Counter.findOneAndUpdate({ _id: 'staffId' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  const staffId = format(seq);
  // Only if still without one: two calls at once keep the first ID, the spare number is simply skipped.
  const r = await Worker.updateOne({ _id: workerId, 'employment.staffId': { $in: [null, ''] } }, { $set: { 'employment.staffId': staffId } });
  if (r.modifiedCount) return staffId;
  return (await Worker.findById(workerId).select('employment.staffId').lean())?.employment?.staffId || null;
}

// Every staff member without an ID gets one; cheap when everyone has one.
async function ensureAll() {
  const Worker = require('../worker/worker.model');
  const missing = await Worker.find({ 'employment.type': 'staff', $or: [{ 'employment.staffId': null }, { 'employment.staffId': { $exists: false } }] }).select('_id').sort({ 'employment.joinedAt': 1 }).lean();
  for (const w of missing) await ensure(w._id);
  return missing.length;
}

module.exports = { ensure, ensureAll, format };
