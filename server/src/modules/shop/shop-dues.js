// What a partner shop owes ZappyOne from cash jobs, net of what ZappyOne owes it (shop-payout balance); at the workers' dues limit (Economics) it takes no new work until settled.
const mongoose = require('mongoose');

const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

async function duesOf(shopId) {
  const { limits, DuesClaim } = require('../worker/worker-dues.service');
  const [b, lim, claims] = await Promise.all([
    require('./shop-payout').balance(shopId),
    limits(),
    DuesClaim.find({ shopId }).sort({ createdAt: -1 }).limit(5).select('amountPaise method reference status decisionNote createdAt').lean(),
  ]);
  const duesPaise = Math.max(0, b.owedPaise + b.paidOutPaise - b.earnedPaise);
  return { duesPaise, limitPaise: lim.limitPaise, warnPaise: lim.warnPaise, isBlocked: duesPaise >= lim.limitPaise, payInstructions: lim.payInstructions, claims };
}

// The shops in this list at or over the limit, in two aggregate reads however many shops.
async function blockedShops(shopIds) {
  const ids = [...new Set((shopIds || []).map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return new Set();
  const Transaction = require('../payment/transaction.model');
  const { ShopPayout } = require('./shop-payout');
  const [ledger, payouts, { limitPaise }] = await Promise.all([
    Transaction.aggregate([
      { $match: { 'metadata.shopId': { $in: ids }, status: { $in: ['succeeded', 'pending'] } } },
      { $group: { _id: '$metadata.shopId', net: { $sum: '$amountPaise' } } },
    ]),
    ShopPayout.aggregate([
      { $match: { shopId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $in: ['requested', 'paid'] } } },
      { $group: { _id: '$shopId', paise: { $sum: '$amountPaise' } } },
    ]),
    require('../worker/worker-dues.service').limits(),
  ]);
  const out = new Map(payouts.map((p) => [String(p._id), p.paise]));
  return new Set(ledger.filter((r) => Math.max(0, (out.get(String(r._id)) || 0) - r.net) >= limitPaise).map((r) => String(r._id)));
}

// Once when the shop reaches the warning line, and once when new jobs stop; at most daily. Best effort.
async function notifyIfCrossed(shopId) {
  try {
    const d = await duesOf(shopId);
    const state = d.isBlocked ? 'blocked' : d.duesPaise >= d.warnPaise ? 'warning' : null;
    if (!state) return;
    const { redis } = require('../../config/redis');
    if (!(await redis.set(`dues:told:shop:${shopId}:${state}`, '1', 'EX', 24 * 3600, 'NX'))) return;
    await require('../messaging/send').send('provider.dues', {
      to: { kind: 'shop', id: shopId },
      ctx: { state, duesPaise: d.duesPaise, limitPaise: d.limitPaise, payInstructions: d.payInstructions },
    });
  } catch (e) {
    require('../../core/logger').warn({ err: e.message }, '[shop-dues] notify failed');
  }
}

async function assertShopCanWork(shopId) {
  const d = await duesOf(shopId);
  if (!d.isBlocked) return d;
  throw Object.assign(
    new Error(`You owe ZappyOne ${rupees(d.duesPaise)}. Pay at least ${rupees(d.duesPaise - d.limitPaise + 100)} to take new jobs again.`),
    { status: 402, code: 'SHOP_DUES', dues: d },
  );
}

// Money the shop paid ZappyOne directly (UPI or bank), recorded by ops; it lowers what is owed.
// The shop says it paid (UPI or bank, with the reference); admin checks the bank and confirms through recordPayment.
async function claimPayment({ shopId, amountPaise, method = 'upi', reference, note = '' }) {
  const { DuesClaim } = require('../worker/worker-dues.service');
  if (!(amountPaise >= 100)) throw Object.assign(new Error('Enter the amount you paid'), { status: 400, code: 'BAD_AMOUNT' });
  if (!reference) throw Object.assign(new Error('Enter the UPI or bank reference'), { status: 400, code: 'REFERENCE_REQUIRED' });
  if (await DuesClaim.countDocuments({ shopId, status: 'pending' }) >= 3) throw Object.assign(new Error('You already have payments waiting to be checked'), { status: 409, code: 'TOO_MANY_CLAIMS' });
  if (await DuesClaim.exists({ shopId, reference, status: { $ne: 'rejected' } })) throw Object.assign(new Error('This reference is already sent'), { status: 409, code: 'DUPLICATE_REFERENCE' });
  return DuesClaim.create({ shopId, amountPaise, method, reference, note });
}

async function recordPayment({ shopId, amountPaise, reference, adminId, claimId = null }) {
  const { DuesClaim } = require('../worker/worker-dues.service');
  if (claimId) {
    const claim = await DuesClaim.findOne({ _id: claimId, shopId, status: 'pending' }).lean();
    if (!claim) throw Object.assign(new Error('That payment claim was not found or was already decided'), { status: 409, code: 'CLAIM_CLOSED' });
    reference = reference || claim.reference;
    amountPaise = amountPaise || claim.amountPaise;
  }
  if (!(amountPaise > 0)) throw Object.assign(new Error('Enter the amount paid'), { status: 400, code: 'BAD_AMOUNT' });
  if (!reference) throw Object.assign(new Error('Enter the UPI or bank reference'), { status: 400, code: 'REFERENCE_REQUIRED' });
  const Transaction = require('../payment/transaction.model');
  const key = `shop_dues:${shopId}:${reference}`;
  const dup = Object.assign(new Error('This payment reference is already recorded'), { status: 409, code: 'DUPLICATE_REFERENCE' });
  if (await Transaction.exists({ idempotencyKey: key })) throw dup;
  await Transaction.create({
    type: 'credit', owner: { kind: 'platform', id: null }, amountPaise, reason: Transaction.REASONS.DUES_PAYMENT,
    idempotencyKey: key, description: `Dues paid by shop (${reference})`,
    metadata: { shopId: String(shopId), reference, adminId: adminId ? String(adminId) : null }, status: 'succeeded',
  }).catch((e) => { throw e?.code === 11000 ? dup : e; });
  if (claimId) await DuesClaim.updateOne({ _id: claimId, status: 'pending' }, { $set: { status: 'confirmed', decidedBy: adminId || null, decidedAt: new Date(), amountPaise } });
  const after = await duesOf(shopId);
  const { redis } = require('../../config/redis');
  await redis.del(`dues:told:shop:${shopId}:blocked`, `dues:told:shop:${shopId}:warning`).catch(() => {});
  require('../messaging/send').send('provider.dues', {
    to: { kind: 'shop', id: shopId }, refId: `paid:${key}`,
    ctx: { state: 'paid', duesPaise: after.duesPaise, limitPaise: after.limitPaise },
  }).catch(() => {});
  return after;
}

// Every shop that owes anything, most first, for ops.
async function owingShops() {
  const Transaction = require('../payment/transaction.model');
  const { ShopPayout } = require('./shop-payout');
  const ledger = await Transaction.aggregate([
    { $match: { 'metadata.shopId': { $exists: true }, status: { $in: ['succeeded', 'pending'] } } },
    { $group: { _id: '$metadata.shopId', net: { $sum: '$amountPaise' } } },
  ]);
  const ids = ledger.map((r) => r._id).filter((id) => mongoose.isValidObjectId(id));
  const [payouts, shops, { limitPaise }, claims] = await Promise.all([
    ShopPayout.aggregate([{ $match: { shopId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $in: ['requested', 'paid'] } } }, { $group: { _id: '$shopId', paise: { $sum: '$amountPaise' } } }]),
    require('./shop.model').find({ _id: { $in: ids } }).select('businessName phone partnerType').lean(),
    require('../worker/worker-dues.service').limits(),
    require('../worker/worker-dues.service').DuesClaim.find({ status: 'pending', shopId: { $ne: null } }).sort({ createdAt: 1 }).lean(),
  ]);
  const out = new Map(payouts.map((p) => [String(p._id), p.paise]));
  const claimsOf = claims.reduce((m, c) => m.set(String(c.shopId), [...(m.get(String(c.shopId)) || []), c]), new Map());
  const info = new Map(shops.map((s) => [String(s._id), s]));
  return ledger.map((r) => ({ shopId: String(r._id), duesPaise: Math.max(0, (out.get(String(r._id)) || 0) - r.net) }))
    .filter((r) => r.duesPaise > 0 && info.has(r.shopId))
    .map((r) => ({ ...r, ...info.get(r.shopId), blocked: r.duesPaise >= limitPaise, claims: claimsOf.get(r.shopId) || [] }))
    .sort((a, b) => b.duesPaise - a.duesPaise);
}

module.exports = { duesOf, blockedShops, notifyIfCrossed, assertShopCanWork, claimPayment, recordPayment, owingShops };
