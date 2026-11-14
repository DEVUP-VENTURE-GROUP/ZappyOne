// Errand runners pay no commission; instead a small fee for each window in which they finish enough errands, like a ride app's captain pass (Economics → Errand runners).
const Transaction = require('../payment/transaction.model');
const logger = require('../../core/logger');

const IST_MS = 330 * 60000;
const settings = () => require('../pricing/services/config.service').runnerAccessSettings();

// The window a moment falls in, aligned to India's midnight: 12-hour windows run 00:00 to 12:00 and 12:00 to 24:00.
function windowOf(at, hours) {
  const len = hours * 3600000;
  const from = Math.floor((at.getTime() + IST_MS) / len) * len - IST_MS;
  return { from: new Date(from), to: new Date(from + len) };
}

// ZappyOne's own staff and Family Assist (a staff product) never pay it.
async function exempt(workerId) {
  return require('../workforce/staff').isStaff(workerId);
}

const errandFilter = () => ({ serviceType: { $nin: require('../helping/models/config.model').FAMILY_ASSIST_TYPES } });

// Errands that count toward a window: finished, and not lost in a dispute afterwards.
const COUNTED = { status: { $nin: ['FAILED', 'CANCELLED'] } };

/**
 * Brings one window's pass in line with its errands: charged once it reaches the minimum, returned if a counted errand later fails and it falls below.
 * Each charge and refund has its own numbered key, so a repeat or two at once never double up; the window of an earlier charge is kept even if admin changed the window length since.
 */
async function reconcile(workerId, at = new Date()) {
  const s = await settings();
  if (!workerId || await exempt(workerId)) return null;
  const rows = await Transaction.find({
    'owner.id': workerId, reason: { $in: [Transaction.REASONS.RUNNER_ACCESS_FEE, Transaction.REASONS.RUNNER_ACCESS_REFUND] },
    'metadata.from': { $lte: at }, 'metadata.to': { $gt: at },
  }).select('reason amountPaise metadata').lean();
  const w = rows[0] ? { from: new Date(rows[0].metadata.from), to: new Date(rows[0].metadata.to) } : windowOf(at, s.windowHours);
  const fees = rows.filter((r) => r.reason === Transaction.REASONS.RUNNER_ACCESS_FEE);
  const refunds = rows.filter((r) => r.reason === Transaction.REASONS.RUNNER_ACCESS_REFUND);
  const net = fees.reduce((a, r) => a - r.amountPaise, 0) - refunds.reduce((a, r) => a + r.amountPaise, 0);
  const { HelpingTask } = require('../helping/models/task.model');
  const jobs = await HelpingTask.countDocuments({ workerId, completedAt: { $gte: w.from, $lt: w.to }, ...COUNTED, ...errandFilter() });
  const wallet = require('../wallet/wallet.service');
  const base = `${workerId}:${w.from.toISOString()}`;
  const meta = { from: w.from, to: w.to, jobs };
  if (jobs >= s.minJobs && net <= 0 && s.on && s.feePaise > 0) {
    // The first charge keeps the plain key, so a window charged before refunds existed is recognised.
    await wallet.apply({
      kind: 'worker', id: workerId, type: 'debit', amountPaise: s.feePaise, allowDebt: true, reason: Transaction.REASONS.RUNNER_ACCESS_FEE,
      idempotencyKey: `runner-access:${base}${fees.length ? `:n${fees.length + 1}` : ''}`,
      description: `Errand pass: ${s.minJobs}+ errands done in this ${s.windowHours}-hour window`, metadata: meta,
    });
    await alertIfOver(workerId, s);
    return { charged: s.feePaise, window: w, jobs };
  }
  if (jobs < s.minJobs && net > 0) {
    await wallet.apply({
      kind: 'worker', id: workerId, type: 'credit', amountPaise: net, reason: Transaction.REASONS.RUNNER_ACCESS_REFUND,
      idempotencyKey: `runner-access-refund:${base}:r${refunds.length + 1}`,
      description: 'Errand pass returned: an errand in this window no longer counts', metadata: meta,
    });
    return { refunded: net, window: w, jobs };
  }
  return null;
}

// Called when a runner finishes an errand.
const onJobDone = (workerId, at = new Date()) => reconcile(workerId, at);

// At the runner limit: one push and email, then no new errands until they pay (assertCanTakeErrand).
async function alertIfOver(workerId, s) {
  try {
    const dues = await require('../worker/worker-dues.service').getDuesStatus(workerId);
    if (dues.duesPaise < s.limitPaise) return;
    const { redis } = require('../../config/redis');
    if (!(await redis.set(`dues:runner:${workerId}`, '1', 'EX', 24 * 3600, 'NX'))) return;
    await require('../messaging/send').send('provider.dues', {
      to: { kind: 'worker', id: workerId },
      ctx: { state: 'blocked', duesPaise: dues.duesPaise, limitPaise: s.limitPaise, payInstructions: dues.payInstructions },
    });
  } catch (e) {
    logger.warn({ err: e.message }, '[runner-access] alert failed');
  }
}

// Before a runner takes an errand: the runner limit, on top of the everyday dues limit.
async function assertCanTakeErrand(workerId) {
  const s = await settings();
  return require('../worker/worker-dues.service').assertCanWork(workerId, s.on ? { limitPaise: s.limitPaise } : {});
}

// Of the runners an errand would ring, those under the runner limit (one read for all of them), so a blocked runner is never rung only to be refused.
async function withinLimit(providers) {
  const s = await settings();
  const workers = providers.filter((p) => p.kind === 'worker').map((p) => p.id);
  if (!s.on || !workers.length) return providers;
  const Wallet = require('../wallet/wallet.model');
  const blocked = new Set((await Wallet.find({ 'owner.kind': 'worker', 'owner.id': { $in: workers }, balancePaise: { $lte: -s.limitPaise } }).select('owner.id').lean()).map((w) => String(w.owner.id)));
  return providers.filter((p) => p.kind !== 'worker' || !blocked.has(String(p.id)));
}

// Partner errands carry no commission while the pass is on.
async function commissionFree() {
  return !!(await settings()).on;
}

module.exports = { windowOf, reconcile, onJobDone, assertCanTakeErrand, commissionFree, withinLimit };
