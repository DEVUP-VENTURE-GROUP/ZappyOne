/**
 * A booking someone started and did not finish (web and apps alike).
 *
 * The full form stays on the device, as before (useDraft). The server keeps a
 * small record per customer and kind: what it was, the step they reached, the
 * price, and the path back. That record is what home shows as "Continue your
 * booking" on any device, and what one reminder push is sent for.
 *
 *   saved     when the customer reaches the later steps (address, confirm)
 *   reminded  once, REMIND_AFTER_MIN after they last touched it, if nothing
 *             of that kind was booked since (quiet hours respected)
 *   cleared   when they book, start over, or KEEP_DAYS pass
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const REMIND_AFTER_MIN = 30;
const KEEP_DAYS = 3;

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, required: true },
  title: { type: String, maxlength: 80, required: true },
  step: { type: String, maxlength: 40, default: '' },
  path: { type: String, maxlength: 300, required: true },
  pricePaise: { type: Number, default: null },
  remindedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ userId: 1, kind: 1 }, { unique: true });
schema.index({ updatedAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 86400 });
const CheckoutDraft = mongoose.models.CheckoutDraft || mongoose.model('CheckoutDraft', schema);

const KNOWN = () => Object.keys(KINDS);

/** Save (or refresh) the unfinished booking of this kind. A refresh re-arms the one reminder. */
async function save(userId, { kind, title, step = '', path, pricePaise = null }) {
  if (!KNOWN().includes(kind)) throw Object.assign(new Error('Unknown booking kind'), { status: 400, code: 'BAD_KIND' });
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw Object.assign(new Error('Bad path'), { status: 400, code: 'BAD_PATH' });
  }
  return CheckoutDraft.findOneAndUpdate(
    { userId, kind },
    { $set: { title, step, path, pricePaise: Number.isFinite(pricePaise) ? pricePaise : null, remindedAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

async function clear(userId, kind) {
  await CheckoutDraft.deleteOne({ userId, kind });
}

/** Did they book something of this kind after the draft was last touched? Then it is finished. */
async function bookedSince(d) {
  const Model = KINDS[d.kind]?.model();
  if (!Model) return false;
  return !!(await Model.exists({ userId: d.userId, createdAt: { $gte: d.updatedAt } }));
}

/** This customer's unfinished bookings, newest first; finished ones are cleared on the way. */
async function list(userId) {
  const rows = await CheckoutDraft.find({ userId }).sort({ updatedAt: -1 }).lean();
  const open = [];
  for (const d of rows) {
    if (await bookedSince(d)) await CheckoutDraft.deleteOne({ _id: d._id });
    else open.push({ kind: d.kind, title: d.title, step: d.step, path: d.path, pricePaise: d.pricePaise, updatedAt: d.updatedAt });
  }
  return open;
}

/** Every 5 minutes (messaging timed sweep): one reminder per unfinished booking. */
async function sweep({ now = Date.now() } = {}) {
  const due = await CheckoutDraft.find({
    remindedAt: null, updatedAt: { $lte: new Date(now - REMIND_AFTER_MIN * 60000) },
  }).limit(200).lean();
  let sent = 0;
  for (const d of due) {
    try {
      if (await bookedSince(d)) { await CheckoutDraft.deleteOne({ _id: d._id }); continue; }
      const claimed = await CheckoutDraft.updateOne({ _id: d._id, remindedAt: null }, { $set: { remindedAt: new Date(now) } }, { timestamps: false });
      if (!claimed.modifiedCount) continue;
      await require('../messaging/send').send('customer.finish_booking', {
        to: { kind: 'user', id: d.userId }, refId: `draft:${d._id}:${new Date(d.updatedAt).getTime()}`,
        ctx: { title: d.title, step: d.step, pricePaise: d.pricePaise, link: d.path },
      });
      sent += 1;
    } catch (e) {
      logger.warn({ err: e.message, draftId: String(d._id) }, '[checkout-draft] reminder failed');
    }
  }
  return { sent };
}

module.exports = { save, clear, list, sweep, CheckoutDraft, REMIND_AFTER_MIN };
