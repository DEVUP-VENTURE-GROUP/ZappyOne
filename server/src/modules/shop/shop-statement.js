// A partner's month on ZappyOne, from the same ledger rows as its balance (shop-payout): what it earned, the commission it owes from cash jobs, dues it paid and payouts, as JSON or CSV for its accounts.
const mongoose = require('mongoose');

const IST_MS = 330 * 60000;
const KIND = { worker_earning: 'Earning (online job)', platform_commission: 'Commission (cash job)', dues_payment: 'Dues paid to ZappyOne' };

function monthBounds(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  const now = new Date(Date.now() + IST_MS);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  if (mo < 0 || mo > 11) throw Object.assign(new Error('Month must be YYYY-MM'), { status: 400, code: 'BAD_MONTH' });
  const from = new Date(Date.UTC(y, mo, 1) - IST_MS);
  const to = new Date(Date.UTC(y, mo + 1, 1) - IST_MS);
  return { label: `${y}-${String(mo + 1).padStart(2, '0')}`, from, to };
}

async function statement(shopId, month) {
  const { label, from, to } = monthBounds(month);
  const Transaction = require('../payment/transaction.model');
  const { ShopPayout } = require('./shop-payout');
  const [tx, payouts, shop] = await Promise.all([
    Transaction.find({ 'metadata.shopId': String(shopId), status: { $in: ['succeeded', 'pending'] }, createdAt: { $gte: from, $lt: to } })
      .sort({ createdAt: 1 }).select('amountPaise reason description createdAt metadata.bookingId').lean(),
    ShopPayout.find({ shopId: new mongoose.Types.ObjectId(String(shopId)), status: 'paid', decidedAt: { $gte: from, $lt: to } }).sort({ decidedAt: 1 }).lean(),
    require('./shop.model').findById(shopId).select('businessName partnerType kyc.gstNumber agreement').lean(),
  ]);
  const rows = [
    ...tx.map((t) => ({ at: t.createdAt, kind: KIND[t.reason] || t.description || t.reason, reference: t.metadata?.bookingId ? String(t.metadata.bookingId) : '', amountPaise: t.amountPaise })),
    ...payouts.map((p) => ({ at: p.decidedAt, kind: `Payout to ${p.destination?.label || 'your account'}`, reference: p.reference || '', amountPaise: -p.amountPaise })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  const sum = (f) => rows.filter(f).reduce((s, r) => s + r.amountPaise, 0);
  return {
    month: label, business: shop?.businessName || '', gstNumber: shop?.kyc?.gstNumber || '', commissionPct: shop?.agreement?.ratePct ?? null,
    rows,
    totals: {
      earnedPaise: sum((r) => r.kind === KIND.worker_earning),
      commissionOwedPaise: -sum((r) => r.kind === KIND.platform_commission),
      duesPaidPaise: sum((r) => r.kind === KIND.dues_payment),
      paidOutPaise: -sum((r) => r.kind.startsWith('Payout')),
      netPaise: rows.reduce((s, r) => s + r.amountPaise, 0),
    },
  };
}

const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const rupees = (p) => (p / 100).toFixed(2);

function toCsv(st) {
  const day = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
  const lines = [
    [`ZappyOne statement`, st.business, st.month].map(cell).join(','),
    st.gstNumber ? `GSTIN,${cell(st.gstNumber)}` : null,
    '',
    'Date,Entry,Booking,Amount (INR)',
    ...st.rows.map((r) => [day(r.at), r.kind, r.reference, rupees(r.amountPaise)].map(cell).join(',')),
    '',
    `Earned online,${rupees(st.totals.earnedPaise)}`,
    `Commission owed on cash jobs,${rupees(st.totals.commissionOwedPaise)}`,
    `Dues paid,${rupees(st.totals.duesPaidPaise)}`,
    `Paid out to you,${rupees(st.totals.paidOutPaise)}`,
    `Net for the month,${rupees(st.totals.netPaise)}`,
  ].filter((l) => l !== null);
  return `${lines.join('\n')}\n`;
}

module.exports = { statement, toCsv, monthBounds };
