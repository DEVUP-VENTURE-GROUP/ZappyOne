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

async function overview() {
  const [shopRows, workerList, recent, monthAgg] = await Promise.all([
    require('../shop/shop-dues').owingShops(),
    require('../worker/worker-dues.service').listOwing(),
    payments({ limit: 100 }),
    Transaction.aggregate([
      { $match: { reason: Transaction.REASONS.DUES_PAYMENT, status: 'succeeded', createdAt: { $gte: istMonthStart() } } },
      { $group: { _id: null, paise: { $sum: { $abs: '$amountPaise' } }, n: { $sum: 1 } } },
    ]),
  ]);
  const shops = shopRows || [];
  const workers = workerList.rows || [];
  const owing = [...shops.filter((s) => s.duesPaise > 0), ...workers.filter((w) => w.duesPaise > 0)];
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
    payments: recent,
  };
}

module.exports = { overview, payments, howPaid };
