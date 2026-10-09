/**
 * Providers rate the customer — the other half of trust (repairs, pet care, helping).
 *
 *   when     once per job, by the provider who did it (worker, or the shop),
 *            once it is done and within RATE_DAYS
 *   what     1–5 stars and tags (on time, respectful, no-show, rude, unsafe…),
 *            an optional note; the customer never sees who rated what
 *   where    the customer's average is User.rating / ratingCount (the same
 *            fields the first version's orders already fill): shown to
 *            providers on a job offer, and to ops in Customers
 *   safety   an "unsafe" tag, or an average below FLAG_BELOW after
 *            FLAG_AFTER ratings, flags the customer for ops (Live errors are
 *            for software; this goes to the customer record and a push to ops)
 */
const mongoose = require('mongoose');
const { KINDS } = require('./kinds');

const RATE_DAYS = 7;
const FLAG_BELOW = 3;
const FLAG_AFTER = 3;
const TAGS = {
  good: ['on_time', 'respectful', 'clear_instructions', 'easy_access', 'paid_promptly'],
  bad: ['no_show', 'late', 'rude', 'unsafe', 'wrong_details', 'payment_issue'],
};
const LABEL = {
  on_time: 'Was ready on time', respectful: 'Respectful', clear_instructions: 'Clear instructions', easy_access: 'Easy to find and enter',
  paid_promptly: 'Paid promptly', no_show: 'Not there', late: 'Kept me waiting', rude: 'Rude', unsafe: 'I felt unsafe',
  wrong_details: 'Wrong address or details', payment_issue: 'Payment trouble',
};

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

function holderIs(doc, role, id) {
  if (role === 'shop') return String(doc.shopId || '') === String(id);
  return String(doc.workerId || '') === String(id);
}

async function rate({ kind, id, role, providerId, stars, tags = [], note = '' }) {
  const Model = KINDS[kind]?.model();
  if (!Model || !KINDS[kind].earning) throw err(400, 'NOT_SUPPORTED', 'This booking cannot be rated.');
  const doc = await Model.findById(id).select('userId workerId shopId status statusHistory completedAt execution customerRating reference').lean();
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (!holderIs(doc, role, providerId)) throw err(403, 'NOT_YOURS', 'Only the provider who did this job can rate the customer.');
  if (!KINDS[kind].earning.done.includes(doc.status)) throw err(409, 'NOT_DONE', 'You can rate the customer once the job is done.');
  const doneAt = doc.completedAt || doc.execution?.completedAt || null;
  if (doneAt && Date.now() - new Date(doneAt).getTime() > RATE_DAYS * 86400e3) throw err(409, 'TOO_LATE', `Ratings close ${RATE_DAYS} days after the job.`);
  const all = [...TAGS.good, ...TAGS.bad];
  const clean = [...new Set(tags)].filter((t) => all.includes(t)).slice(0, 6);

  const row = await Model.findOneAndUpdate(
    { _id: id, 'customerRating.stars': { $exists: false } },
    { $set: { customerRating: { stars, tags: clean, note: String(note || '').slice(0, 300), at: new Date(), byRole: role, by: providerId } } },
    { new: true },
  ).lean();
  if (!row) throw err(409, 'ALREADY_RATED', 'You have already rated this customer.');

  // Running average on the customer (the same fields the first version's orders use).
  const User = require('../user/user.model');
  const u = await User.findById(doc.userId).select('rating ratingCount name phone').lean();
  if (u) {
    const n = (u.ratingCount || 0) + 1;
    const avg = ((u.ratingCount ? u.rating : 0) * (n - 1) + stars) / n;
    await User.updateOne({ _id: doc.userId }, { $set: { rating: Math.round(avg * 100) / 100, ratingCount: n } });
    if (clean.includes('unsafe') || (n >= FLAG_AFTER && avg < FLAG_BELOW)) {
      await User.updateOne({ _id: doc.userId }, { $set: { 'flags.lowCustomerRating': true, 'flags.lowCustomerRatingAt': new Date() } }).catch(() => {});
      require('../messaging/send').send('ops.customer_flagged', {
        to: 'ops', refId: `custflag:${doc.userId}:${n}`,
        ctx: { name: u.name || 'A customer', phone: u.phone || '', avg: Math.round(avg * 10) / 10, count: n, unsafe: clean.includes('unsafe'), reference: doc.reference || '' },
      }).catch(() => {});
    }
  }
  return { ok: true, message: 'Thanks. This helps keep jobs safe and fair.' };
}

/** What a provider sees about a customer on an offer: average and count, or "new". */
async function summaryFor(userId) {
  if (!userId || !mongoose.isValidObjectId(String(userId))) return null;
  const u = await require('../user/user.model').findById(userId).select('rating ratingCount').lean();
  if (!u) return null;
  return u.ratingCount ? { rating: u.rating, count: u.ratingCount } : { rating: null, count: 0 };
}

module.exports = { rate, summaryFor, TAGS, LABEL, RATE_DAYS };
