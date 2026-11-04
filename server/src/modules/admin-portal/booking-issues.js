// What went wrong on bookings, for admin: per booking (alerts, reports, the payment story) and across all bookings (every alert, open or done). Read-only.
const { OpsAlert } = require('../admin/ops-alerts');

const REPORTS = { cash_refused: 'Pro said the customer did not pay', customer_no_show: 'Pro said the customer was not there', provider_no_show: 'Customer said the pro did not come', give_back: 'Pro handed the job back' };

const alertRow = (a) => ({
  id: String(a._id), type: a.type, title: a.title, body: a.body, urgent: a.urgent, at: a.createdAt, updatedAt: a.updatedAt,
  doneAt: a.doneAt || null, doneBy: a.doneBy ? String(a.doneBy) : null,
  job: a.data?.kind && a.data?.id ? { kind: a.data.kind, id: String(a.data.id), reference: a.data.reference || null } : null,
});

// The payment story of a pay-direct job, step by step (jobs/pay-direct).
function paymentSteps(raw) {
  const c = raw.payClaim;
  if (!c?.at) return [];
  const rupees = `₹${Math.round((c.amountPaise || 0) / 100).toLocaleString('en-IN')}`;
  return [
    { at: c.at, what: `Customer said they paid ${rupees} by ${c.method === 'upi' ? `UPI${c.utr ? ` (ref ${c.utr})` : ''}` : 'cash'}` },
    c.remindedAt && { at: c.remindedAt, what: 'Pro reminded to confirm' },
    c.remindedAgainAt && { at: c.remindedAgainAt, what: 'Pro reminded again' },
    c.autoReceivedAt && c.autoReceivedAt.getTime?.() > 0 && { at: c.autoReceivedAt, what: 'No answer from the pro: marked received automatically' },
    raw.cashCollectedAt && !c.autoReceivedAt && { at: raw.cashCollectedAt, what: 'Pro tapped Received' },
  ].filter(Boolean);
}

async function issuesFor(source, raw) {
  const [alerts, reports] = await Promise.all([
    OpsAlert.find({ 'data.id': String(raw._id) }).sort({ createdAt: -1 }).limit(50).lean(),
    require('../jobs/give-back').JobGiveBack.find({ jobId: raw._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  return {
    alerts: alerts.map(alertRow),
    reports: reports.map((r) => ({ type: r.type, label: REPORTS[r.type] || r.type, note: r.note || '', at: r.createdAt, resolvedAt: r.resolvedAt || null, resolution: r.resolution || null })),
    payment: paymentSteps(raw),
  };
}

// Every alert, newest first, a page at a time (before = the last row's time).
async function listIssues({ state = 'open', type = '', before = null, limit = 50 } = {}) {
  const q = {
    ...(state === 'open' && { doneAt: null }),
    ...(state === 'done' && { doneAt: { $ne: null } }),
    ...(type && { type }),
    ...(before && !Number.isNaN(Date.parse(before)) && { createdAt: { $lt: new Date(before) } }),
  };
  const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows, open, types] = await Promise.all([
    OpsAlert.find(q).sort({ createdAt: -1 }).limit(n).lean(),
    OpsAlert.countDocuments({ doneAt: null }),
    OpsAlert.distinct('type'),
  ]);
  return { rows: rows.map(alertRow), open, types: types.sort(), next: rows.length === n ? rows[rows.length - 1].createdAt : null };
}

module.exports = { issuesFor, listIssues, paymentSteps };
