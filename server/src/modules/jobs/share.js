const crypto = require('crypto');
const mongoose = require('mongoose');

// "Booked for someone else?": a private link that lets the person at the door follow the job without an account.
const TTL_HOURS = 48;
const SHAREABLE = ['repair', 'pet', 'helping'];

const shareSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  kind: { type: String, enum: SHAREABLE, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
shareSchema.index({ jobId: 1, userId: 1 });
shareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const JobShare = mongoose.models.JobShare || mongoose.model('JobShare', shareSchema);

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

// The customer's own live job only; asking twice returns the same link.
async function create(userId, jobId) {
  const { findJob, KINDS } = require('./kinds');
  const found = await findJob(jobId, 'userId status');
  if (!found || !SHAREABLE.includes(found.kind)) throw fail(404, 'NOT_FOUND', 'Booking not found');
  if (String(found.doc.userId) !== String(userId)) throw fail(403, 'FORBIDDEN', 'This is not your booking');
  if (KINDS[found.kind].ops?.terminal?.includes(found.doc.status)) throw fail(409, 'JOB_OVER', 'This booking has ended');
  const now = new Date();
  const live = await JobShare.findOne({ jobId, userId, revokedAt: null, expiresAt: { $gt: now } }).lean();
  if (live) return live;
  return (await JobShare.create({
    token: crypto.randomBytes(18).toString('base64url'), kind: found.kind, jobId, userId,
    expiresAt: new Date(now.getTime() + TTL_HOURS * 3_600_000),
  })).toObject();
}

async function revoke(userId, jobId) {
  await JobShare.updateMany({ jobId, userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function resolve(token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 64) return null;
  return JobShare.findOne({ token, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
}

// Money, the owner's own contact and internal ids never leave through a shared link; the provider card stays.
const HIDDEN = /price|pricing|charge|payment|paid|amount|paise|fee|quote|invoice|refund|razorpay|wallet|promo|coupon|tip|email|userid|customerphone|contactphone|authoris|due|commission|earning|note/i;
function scrub(value, key = '') {
  if (key === 'provider') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!HIDDEN.test(k)) out[k] = scrub(v, k);
    return out;
  }
  return value;
}

const VIEWS = {
  repair: () => require('../repair/controllers/booking.controller').getBooking,
  pet: () => require('../pet/pet.controller').getBooking,
  helping: () => require('../helping/helping.controller').getTask,
};

// Runs the kind's own customer view as the owner, then scrubs it, so the link sees exactly the owner's screen minus money.
function view(share, req, res, next) {
  const fakeReq = { ...req, params: { id: String(share.jobId) }, auth: { sub: String(share.userId), role: 'user' }, query: {} };
  const out = {
    status(code) { res.status(code); return out; },
    json(body) {
      if (res.statusCode >= 400) return res.json(body);
      const { canCancel, quotes, ...rest } = body || {};
      return res.json({ kind: share.kind, data: scrub(rest), expiresAt: share.expiresAt });
    },
    set: (...a) => { res.set(...a); return out; },
  };
  return VIEWS[share.kind]()(fakeReq, out, next);
}

module.exports = { create, revoke, resolve, view, scrub, JobShare, TTL_HOURS };
