/**
 * Worker dues: what a worker owes ZappyOne, and when it stops new work.
 * ----------------------------------------------------------------------------
 * On a cash job the worker keeps the whole amount, so ZappyOne's commission is
 * taken from their wallet, which may go below zero. Hand-back penalties land
 * the same way. Everything owed always lands in the balance (wallet.service,
 * allowDebt), so the number a worker sees is the real one.
 *
 *   below 0                → in debt, works as normal
 *   at the warning line    → warned (dashboard card + push), still works
 *   at the limit           → no new jobs: no alerts, no accepting, cannot go
 *                            online. A job already under way always finishes.
 *
 * Both lines and the "how to pay" text are set in Admin → Economics → Worker
 * dues (CancellationConfig). Online-paid jobs pay the worker into the same
 * wallet, which clears dues on its own; a payment made to ZappyOne directly is
 * recorded by admin (or claimed by the worker and confirmed by admin).
 * ----------------------------------------------------------------------------
 */
const mongoose = require('mongoose');
const Wallet = require('../wallet/wallet.model');
const logger = require('../../core/logger');

async function limits() {
  const cfg = await require('../order/cancellation.service').getConfig();
  return {
    warnPaise: Math.abs(cfg.workerDuesWarnPaise ?? 80000),
    limitPaise: Math.abs(cfg.workerDuesLimitPaise ?? 100000),
    payInstructions: cfg.duesPayInstructions || '',
  };
}

/** A worker's own claim that they paid ZappyOne directly, for admin to confirm. */
const claimSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  amountPaise: { type: Number, required: true, min: 100 },
  method: { type: String, enum: ['upi', 'cash', 'bank'], default: 'upi' },
  reference: { type: String, default: '', maxlength: 80 },
  note: { type: String, default: '', maxlength: 300 },
  status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', index: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: '' },
}, { timestamps: true });
const DuesClaim = mongoose.models.WorkerDuesClaim || mongoose.model('WorkerDuesClaim', claimSchema);

/**
 * Commission that an earlier version parked outside the balance when the old
 * -₹500 floor refused it. Folded into the wallet once, so no debt stays hidden.
 */
async function absorbParked(workerId) {
  const Transaction = require('../payment/transaction.model');
  const parked = await Transaction.find({
    'owner.kind': 'worker', 'owner.id': workerId, status: 'pending',
    reason: Transaction.REASONS.PLATFORM_COMMISSION, idempotencyKey: /cash_commission_unpaid/,
  }).lean();
  for (const row of parked) {
    try {
      await require('../wallet/wallet.service').apply({
        kind: 'worker', id: workerId, type: 'debit', amountPaise: Math.abs(row.amountPaise),
        reason: Transaction.REASONS.PLATFORM_COMMISSION, idempotencyKey: `${row.idempotencyKey}:absorbed`,
        description: row.description, metadata: row.metadata, allowDebt: true,
      });
      await Transaction.updateOne({ _id: row._id }, { $set: { status: 'reversed', 'metadata.absorbedIntoWallet': true } });
    } catch (e) {
      logger.warn({ err: e.message, workerId: String(workerId) }, '[dues] parked commission not absorbed');
    }
  }
}

const statusOf = (balancePaise, { warnPaise, limitPaise }) => (
  balancePaise <= -limitPaise ? 'blocked'
    : balancePaise <= -warnPaise ? 'warning'
      : balancePaise < 0 ? 'in_debt' : 'clear');

async function getDuesStatus(workerId, { detail = false } = {}) {
  await absorbParked(workerId);
  const lim = await limits();
  const wallet = await Wallet.findOne({ 'owner.kind': 'worker', 'owner.id': workerId }).lean();
  const balancePaise = wallet?.balancePaise ?? 0;
  const status = statusOf(balancePaise, lim);
  const duesPaise = balancePaise < 0 ? -balancePaise : 0;
  const out = {
    balancePaise,
    status,
    isBlocked: status === 'blocked',
    needsTopup: status === 'warning' || status === 'blocked',
    duesPaise,
    // Kept under their old names too, for screens that read them.
    softLimitPaise: -lim.warnPaise,
    hardLimitPaise: -lim.limitPaise,
    warnAtPaise: lim.warnPaise,
    limitPaise: lim.limitPaise,
    leftPaise: Math.max(0, lim.limitPaise - duesPaise),
    payInstructions: lim.payInstructions,
  };
  if (!detail) return out;

  // What makes up the debt: the latest charges, and anything claimed as paid.
  const Transaction = require('../payment/transaction.model');
  const [recent, claims] = await Promise.all([
    Transaction.find({ 'owner.kind': 'worker', 'owner.id': workerId, status: 'succeeded' })
      .sort({ createdAt: -1 }).limit(20).select('type amountPaise reason description createdAt').lean(),
    DuesClaim.find({ workerId }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return { ...out, recent, claims };
}

/** Throws when the worker is at the limit. Wherever a worker is about to receive new work. */
async function assertCanWork(workerId) {
  // Staff hold the day's cash until they deposit it at the hub; that never stops them mid-shift.
  if (await require('../workforce/staff').isStaff(workerId)) return;
  const dues = await getDuesStatus(workerId);
  if (dues.isBlocked) {
    const r = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
    throw Object.assign(
      new Error(`You owe ZappyOne ${r(dues.duesPaise)}. Pay at least ${r(dues.duesPaise - dues.limitPaise + 100)} to take new jobs again.`),
      { status: 402, code: 'WALLET_BLOCKED', dues },
    );
  }
  return dues;
}

/** The workers in this list who are not at the limit (string ids). For alerts and matching. */
async function filterWorkingWorkers(workerIds) {
  if (!workerIds?.length) return new Set();
  const { limitPaise } = await limits();
  const wallets = await Wallet.find(
    { 'owner.kind': 'worker', 'owner.id': { $in: workerIds } },
    { 'owner.id': 1, balancePaise: 1 },
  ).lean();
  const blocked = new Set(wallets.filter((w) => w.balancePaise <= -limitPaise).map((w) => String(w.owner.id)));
  // Staff carry the shift's cash until they deposit it at the hub: never held back for it.
  if (blocked.size) {
    const staff = await require('./worker.model').find({ _id: { $in: [...blocked] }, 'employment.type': 'staff' }).select('_id').lean();
    staff.forEach((w) => blocked.delete(String(w._id)));
  }
  return new Set(workerIds.map(String).filter((id) => !blocked.has(id)));
}

/**
 * After something was taken from a worker's wallet: tell them once when they
 * reach the warning line, and once when new jobs stop. Best effort.
 */
async function notifyIfCrossed(workerId) {
  try {
    const dues = await getDuesStatus(workerId);
    if (!['warning', 'blocked'].includes(dues.status)) return;
    const { redis } = require('../../config/redis');
    const key = `dues:told:${workerId}:${dues.status}`;
    if (!(await redis.set(key, '1', 'EX', 24 * 3600, 'NX'))) return;
    // Push + email (messaging/catalog 'provider.dues').
    await require('../messaging/send').send('provider.dues', {
      to: { kind: 'worker', id: workerId },
      ctx: { state: dues.status, duesPaise: dues.duesPaise, limitPaise: dues.limitPaise, payInstructions: dues.payInstructions },
    });
  } catch (e) {
    logger.warn({ err: e.message }, '[dues] notify failed');
  }
}

/** The worker says they paid ZappyOne directly; admin confirms it against the money received. */
async function claimPayment({ workerId, amountPaise, method, reference, note }) {
  const open = await DuesClaim.countDocuments({ workerId, status: 'pending' });
  if (open >= 3) throw Object.assign(new Error('You already have payments waiting to be checked. We will confirm them soon.'), { status: 409 });
  return DuesClaim.create({ workerId, amountPaise, method, reference: reference || '', note: note || '' });
}

/**
 * Admin records money received from a worker (optionally confirming their
 * claim). Credits the wallet; idempotent per claim.
 */
async function recordPayment({ workerId, amountPaise, method = 'upi', reference = '', claimId = null, adminId }) {
  const Transaction = require('../payment/transaction.model');
  if (claimId) {
    const claim = await DuesClaim.findOne({ _id: claimId, workerId });
    if (!claim) throw Object.assign(new Error('That payment claim was not found'), { status: 404 });
    if (claim.status !== 'pending') throw Object.assign(new Error('That claim was already decided'), { status: 409 });
  }
  const before = await getDuesStatus(workerId);
  await require('../wallet/wallet.service').apply({
    kind: 'worker', id: workerId, type: 'credit', amountPaise,
    reason: Transaction.REASONS.DUES_PAYMENT,
    idempotencyKey: claimId ? `dues:claim:${claimId}` : `dues:record:${workerId}:${Date.now()}`,
    description: `Dues paid to ZappyOne (${method}${reference ? `, ${reference}` : ''})`,
    metadata: { adminId: String(adminId), method, reference, claimId: claimId ? String(claimId) : null },
  });
  if (claimId) {
    await DuesClaim.updateOne({ _id: claimId }, { $set: { status: 'confirmed', decidedBy: adminId, decidedAt: new Date(), amountPaise } });
  }
  const after = await getDuesStatus(workerId);
  if (before.isBlocked && !after.isBlocked) {
    const { redis } = require('../../config/redis');
    await redis.del(`dues:told:${workerId}:blocked`, `dues:told:${workerId}:warning`).catch(() => {});
  }
  require('../messaging/send').send('provider.dues', {
    to: { kind: 'worker', id: workerId },
    ctx: { state: 'paid', duesPaise: after.duesPaise, limitPaise: after.limitPaise },
  }).catch(() => {});
  return { before, after };
}

async function rejectClaim({ claimId, adminId, note = '' }) {
  const claim = await DuesClaim.findOneAndUpdate(
    { _id: claimId, status: 'pending' },
    { $set: { status: 'rejected', decidedBy: adminId, decidedAt: new Date(), decisionNote: note } },
    { new: true },
  ).lean();
  if (!claim) throw Object.assign(new Error('That claim was already decided'), { status: 409 });
  require('../jobs/job-events').push({ kind: 'worker', id: claim.workerId }, {
    title: 'Payment not found',
    body: note || 'We could not find the payment you told us about. Check the reference and try again.',
    deepLink: '/worker', data: { kind: 'dues' },
  }).catch(() => {});
  return claim;
}

/** Admin: every worker who owes money, deepest first, with their open claims. */
async function listOwing({ limit = 100 } = {}) {
  const lim = await limits();
  const wallets = await Wallet.find({ 'owner.kind': 'worker', balancePaise: { $lt: 0 } })
    .sort({ balancePaise: 1 }).limit(limit).select('owner balancePaise updatedAt').lean();
  const ids = wallets.map((w) => w.owner.id);
  const Worker = require('./worker.model');
  const [workers, claims] = await Promise.all([
    Worker.find({ _id: { $in: ids } }).select('name phone isOnline').lean(),
    DuesClaim.find({ status: 'pending' }).sort({ createdAt: 1 }).lean(),
  ]);
  const byId = new Map(workers.map((w) => [String(w._id), w]));
  const claimsBy = new Map();
  for (const c of claims) (claimsBy.get(String(c.workerId)) || claimsBy.set(String(c.workerId), []).get(String(c.workerId))).push(c);
  const rows = wallets.map((w) => {
    const id = String(w.owner.id);
    return {
      workerId: id, name: byId.get(id)?.name || 'Worker', phone: byId.get(id)?.phone || null, online: !!byId.get(id)?.isOnline,
      duesPaise: -w.balancePaise, status: statusOf(w.balancePaise, lim), since: w.updatedAt, claims: claimsBy.get(id) || [],
    };
  });
  // Claims from workers not in debt any more still need an answer.
  for (const [id, list] of claimsBy) if (!rows.some((r) => r.workerId === id)) rows.push({ workerId: id, name: 'Worker', duesPaise: 0, status: 'clear', claims: list });
  return {
    rows, warnAtPaise: lim.warnPaise, limitPaise: lim.limitPaise,
    totalPaise: rows.reduce((t, r) => t + r.duesPaise, 0),
    blocked: rows.filter((r) => r.status === 'blocked').length,
    pendingClaims: claims.length,
  };
}

module.exports = {
  getDuesStatus, assertCanWork, filterWorkingWorkers, notifyIfCrossed,
  claimPayment, recordPayment, rejectClaim, listOwing, DuesClaim, limits,
};
