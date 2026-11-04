/**
 * Everything ServicePro partners owe ZappyOne and pay it, in one view for admin:
 * shops and independent pros together, the totals, and every payment received
 * however it came (Pay now online, a claim admin confirmed, or a payment admin
 * recorded). Read-only; the owing lists come from shop/shop-dues and
 * worker/worker-dues, the payments from their dues_payment transactions.
 */
const Transaction = require('../payment/transaction.model');

const istMonthStart = (now = new Date()) => {
  const ist = new Date(now.getTime() + 330 * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60000);
};

// How a payment arrived, in words admin reads.
function howPaid(t) {
  const m = t.metadata || {};
  const ref = String(m.reference || '');
  if (ref.startsWith('online:') || m.paymentId || t.refs?.paymentIntentId) return 'Pay now (online)';
  if (m.claimId) return 'Their payment, confirmed';
  return 'Recorded by admin';
}

async function payments({ limit = 100 } = {}) {
  const rows = await Transaction.find({ reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded' })
    .sort({ createdAt: -1 }).limit(Math.min(limit, 500)).lean();
  const shopIds = [...new Set(rows.map((t) => t.metadata?.shopId).filter(Boolean))];
  const workerIds = [...new Set(rows.filter((t) => t.owner?.kind === 'worker').map((t) => String(t.owner.id)))];
  const [shops, workers] = await Promise.all([
    require('../shop/shop.model').find({ _id: { $in: shopIds } }).select('businessName phone').lean(),
    require('../worker/worker.model').find({ _id: { $in: workerIds } }).select('name phone').lean(),
  ]);
  const shopBy = new Map(shops.map((s) => [String(s._id), s]));
  const workerBy = new Map(workers.map((w) => [String(w._id), w]));
  return rows.map((t) => {
    const isShop = !!t.metadata?.shopId;
    const who = isShop ? shopBy.get(String(t.metadata.shopId)) : workerBy.get(String(t.owner?.id));
    return {
      id: String(t._id), at: t.createdAt, amountPaise: Math.abs(t.amountPaise),
      partner: { kind: isShop ? 'shop' : 'worker', id: isShop ? String(t.metadata.shopId) : String(t.owner?.id), name: who?.businessName || who?.name || 'Partner', phone: who?.phone || '' },
      how: howPaid(t), reference: String(t.metadata?.reference || '').replace(/^online:/, ''),
    };
  });
}

// A partner's own latest payment, for "Payment done" on their dues card.
async function lastPaidOf(owner) {
  const who = owner.kind === 'shop' ? { 'metadata.shopId': String(owner.id) } : { 'owner.kind': 'worker', 'owner.id': owner.id };
  const t = await Transaction.findOne({ reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded', ...who })
    .sort({ createdAt: -1 }).select('amountPaise createdAt metadata refs').lean();
  return t ? { amountPaise: Math.abs(t.amountPaise), at: t.createdAt, how: howPaid(t) } : null;
}

// Key a dues payment to its partner, the way payments() tells shops and pros apart.
const partnerKey = { $cond: [{ $ifNull: ['$metadata.shopId', false] }, { $concat: ['shop:', { $toString: '$metadata.shopId' }] }, { $concat: ['worker:', { $toString: '$owner.id' }] }] };

// Total paid and last payment per partner, for the owing list (one grouped read over dues payments).
async function paidByPartner() {
  const rows = await Transaction.aggregate([
    { $match: { reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded' } },
    { $group: { _id: partnerKey, paidPaise: { $sum: { $abs: '$amountPaise' } }, lastPaidAt: { $max: '$createdAt' } } },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

// Collected per IST month, oldest first, for the last `n` months (months with nothing show as 0).
async function monthly(n = 6, now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60000);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - (n - 1), 1) - 330 * 60000);
  const rows = await Transaction.aggregate([
    { $match: { reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded', createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } }, paise: { $sum: { $abs: '$amountPaise' } }, count: { $sum: 1 } } },
  ]);
  const by = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - (n - 1 - i), 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, paise: by.get(month)?.paise || 0, count: by.get(month)?.count || 0 };
  });
}

async function overview() {
  const [shopRows, workerList, recent, monthAgg, paid, months] = await Promise.all([
    require('../shop/shop-dues').owingShops(),
    require('../worker/worker-dues.service').listOwing(),
    payments({ limit: 100 }),
    Transaction.aggregate([
      { $match: { reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded', createdAt: { $gte: istMonthStart() } } },
      { $group: { _id: null, paise: { $sum: { $abs: '$amountPaise' } }, n: { $sum: 1 } } },
    ]),
    paidByPartner(),
    monthly(6),
  ]);
  const shops = shopRows || [];
  const workers = workerList.rows || [];
  const owing = [...shops.filter((s) => s.duesPaise > 0), ...workers.filter((w) => w.duesPaise > 0)];
  const warnPaise = workerList.warnAtPaise;
  const row = (kind, id, r, status) => {
    const p = paid.get(`${kind}:${id}`);
    const claims = r.claims || [];
    return {
      kind, id, name: r.businessName || r.name || 'Partner', phone: r.phone || '',
      owedPaise: Math.max(0, r.duesPaise || 0), status,
      claimsCount: claims.length, claimsPaise: claims.reduce((t, c) => t + (c.amountPaise || 0), 0),
      paidPaise: p?.paidPaise || 0, lastPaidAt: p?.lastPaidAt || null,
    };
  };
  // Everyone who owes or has a payment to confirm, most owed first: who to chase, in one list.
  const partners = [
    ...shops.map((s) => row('shop', s.shopId, s, s.blocked ? 'paused' : s.duesPaise >= warnPaise ? 'warned' : 'owes')),
    ...workers.map((w) => row('worker', w.workerId, w, w.status === 'blocked' ? 'paused' : w.status === 'warning' ? 'warned' : w.duesPaise > 0 ? 'owes' : 'clear')),
  ].filter((r) => r.owedPaise > 0 || r.claimsCount > 0).sort((a, b) => b.owedPaise - a.owedPaise);
  return {
    totals: {
      owedPaise: shops.reduce((t, s) => t + Math.max(0, s.duesPaise || 0), 0) + workers.reduce((t, w) => t + Math.max(0, w.duesPaise || 0), 0),
      partnersOwing: owing.length,
      paused: shops.filter((s) => s.blocked).length + (workerList.blocked || 0),
      claimsWaiting: shops.reduce((t, s) => t + (s.claims || []).length, 0) + (workerList.pendingClaims || 0),
      collectedThisMonthPaise: monthAgg[0]?.paise || 0,
      paymentsThisMonth: monthAgg[0]?.n || 0,
    },
    limits: { warnPaise: workerList.warnAtPaise, limitPaise: workerList.limitPaise },
    // Pay now goes through this gateway straight to the account linked to it; null means partners can only pay outside the app.
    onlineGateway: require('../payment/gateway').active(),
    partners,
    monthly: months,
    payments: recent,
  };
}

module.exports = { overview, payments, howPaid, monthly, lastPaidOf };
