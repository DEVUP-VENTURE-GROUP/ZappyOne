/**
 * What ZappyOne owes a shop, and the shop asking for it — until online
 * payouts are switched on, ops pays by bank / UPI and marks it paid here.
 *
 *   balance   earned on the platform's books for this shop (online jobs, tips,
 *             surge shares: credits tagged with the shop) minus what the shop
 *             owes from cash jobs (commission, ZappyOne's surge share: debts
 *             tagged with the shop) minus payouts already asked for or paid.
 *   request   to one of the shop's saved bank accounts or UPI ids, at least
 *             MIN_PAISE, never more than the balance; one open request at a time.
 *   ops       Admin → Money → Payouts → Shop payouts: mark paid (with the bank
 *             reference) or reject (with a reason); the owner is told.
 */
const mongoose = require('mongoose');

const MIN_PAISE = 10000; // ₹100

const schema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  destination: {
    type: { type: String, enum: ['bank', 'upi'], required: true },
    label: String, accountName: String, accountLast4: String, ifsc: String, bankName: String, upiId: String,
  },
  status: { type: String, enum: ['requested', 'paid', 'rejected'], default: 'requested', index: true },
  reference: { type: String, default: '' },
  reason: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });
// One open request per shop, enforced by the database so two quick taps cannot both pass the check.
schema.index({ shopId: 1 }, { unique: true, partialFilterExpression: { status: 'requested' }, name: 'one_open_request' });
const ShopPayout = mongoose.models.ShopPayout || mongoose.model('ShopPayout', schema);

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

async function balance(shopId) {
  const Transaction = require('../payment/transaction.model');
  const id = String(shopId);
  const [rows] = await Transaction.aggregate([
    { $match: { 'metadata.shopId': id, status: { $in: ['succeeded', 'pending'] } } },
    { $group: {
      _id: null,
      earned: { $sum: { $cond: [{ $gt: ['$amountPaise', 0] }, '$amountPaise', 0] } },
      owed: { $sum: { $cond: [{ $lt: ['$amountPaise', 0] }, { $multiply: ['$amountPaise', -1] }, 0] } },
    } },
  ]);
  const [paid] = await ShopPayout.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(id), status: { $in: ['requested', 'paid'] } } },
    { $group: { _id: null, paise: { $sum: '$amountPaise' } } },
  ]);
  const earned = rows?.earned || 0; const owed = rows?.owed || 0; const out = paid?.paise || 0;
  return { earnedPaise: earned, owedPaise: owed, paidOutPaise: out, availablePaise: Math.max(0, earned - owed - out), minPaise: MIN_PAISE };
}

async function mine(shopId) {
  const [b, history] = await Promise.all([balance(shopId), ShopPayout.find({ shopId }).sort({ createdAt: -1 }).limit(30).lean()]);
  return { ...b, history, open: history.some((h) => h.status === 'requested') };
}

async function request({ shopId, amountPaise, type, accountId }) {
  const Shop = require('./shop.model');
  const shop = await Shop.findById(shopId).select('businessName savedBankAccounts savedUpiIds').lean();
  if (!shop) throw err(404, 'NOT_FOUND', 'Shop not found');
  if (await ShopPayout.exists({ shopId, status: 'requested' })) throw err(409, 'OPEN_REQUEST', 'You already have a payout on its way. Ask again once it is paid.');
  const b = await balance(shopId);
  if (amountPaise < MIN_PAISE) throw err(400, 'TOO_SMALL', `The least you can withdraw is ${rupees(MIN_PAISE)}.`);
  if (amountPaise > b.availablePaise) throw err(400, 'TOO_MUCH', `You can withdraw up to ${rupees(b.availablePaise)}.`);
  let destination;
  if (type === 'upi') {
    const u = (shop.savedUpiIds || []).find((x) => String(x._id) === String(accountId));
    if (!u) throw err(400, 'NO_ACCOUNT', 'Choose one of your saved UPI ids.');
    destination = { type: 'upi', label: u.label || u.upiId, upiId: u.upiId };
  } else {
    const a = (shop.savedBankAccounts || []).find((x) => String(x._id) === String(accountId));
    if (!a) throw err(400, 'NO_ACCOUNT', 'Choose one of your saved bank accounts.');
    destination = { type: 'bank', label: a.label || a.bankName || 'Bank', accountName: a.accountName, accountLast4: String(a.accountNumber).slice(-4), ifsc: a.ifsc, bankName: a.bankName };
  }
  const row = await ShopPayout.create({ shopId, amountPaise, destination }).catch((e) => {
    if (e?.code === 11000) throw err(409, 'OPEN_REQUEST', 'You already have a payout on its way. Ask again once it is paid.');
    throw e;
  });
  require('../messaging/send').send('ops.shop_payout', {
    to: 'ops', refId: `shoppayout:${row._id}`, ctx: { shop: shop.businessName, amount: rupees(amountPaise), to: destination.label },
  }).catch(() => {});
  return { payout: row.toObject(), message: `Asked for ${rupees(amountPaise)}. It reaches ${destination.label} within 2 working days.` };
}

/* Ops */

async function adminList({ status = 'requested' } = {}) {
  const rows = await ShopPayout.find(status === 'all' ? {} : { status }).sort({ createdAt: 1 }).limit(200).lean();
  const shops = await require('./shop.model').find({ _id: { $in: rows.map((r) => r.shopId) } }).select('businessName ownerName phone').lean();
  const by = new Map(shops.map((s) => [String(s._id), s]));
  return rows.map((r) => ({ ...r, shop: by.get(String(r.shopId)) || null }));
}

async function decide({ id, decision, reference = '', reason = '', adminId }) {
  const set = decision === 'paid'
    ? { status: 'paid', reference: String(reference).slice(0, 80) }
    : { status: 'rejected', reason: String(reason).slice(0, 300) };
  if (decision === 'paid' && !set.reference) throw err(400, 'REFERENCE_REQUIRED', 'Add the bank or UPI reference of the transfer.');
  if (decision === 'rejected' && !set.reason) throw err(400, 'REASON_REQUIRED', 'Tell the shop why.');
  const row = await ShopPayout.findOneAndUpdate({ _id: id, status: 'requested' }, { $set: { ...set, decidedBy: adminId, decidedAt: new Date() } }, { new: true }).lean();
  if (!row) throw err(409, 'ALREADY_DECIDED', 'This payout was already decided.');
  require('../jobs/job-events').push({ kind: 'shop', id: row.shopId }, {
    title: decision === 'paid' ? `${rupees(row.amountPaise)} sent to you` : 'Payout not sent',
    body: decision === 'paid' ? `Sent to ${row.destination.label}. Reference ${row.reference}.` : row.reason,
    deepLink: '/shop/withdraw', data: { type: 'shop_payout' },
  }).catch(() => {});
  return row;
}

module.exports = { balance, mine, request, adminList, decide, ShopPayout, MIN_PAISE };
