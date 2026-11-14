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

// Called when a runner finishes an errand: the fee once per window, from the job that reaches the minimum (the key makes a second charge impossible).
async function onJobDone(workerId, at = new Date()) {
  const s = await settings();
  if (!s.on || !(s.feePaise > 0) || !workerId || await exempt(workerId)) return null;
  const w = windowOf(at, s.windowHours);
  const { HelpingTask } = require('../helping/models/task.model');
  const jobs = await HelpingTask.countDocuments({ workerId, completedAt: { $gte: w.from, $lt: w.to }, ...errandFilter() });
  if (jobs < s.minJobs) return null;
  const idempotencyKey = `runner-access:${workerId}:${w.from.toISOString()}`;
  // Already charged for this window: one read, before relying on the ledger's unique key alone.
  if (await Transaction.exists({ idempotencyKey })) return null;
  await require('../wallet/wallet.service').apply({
    kind: 'worker', id: workerId, type: 'debit', amountPaise: s.feePaise, allowDebt: true,
    reason: Transaction.REASONS.RUNNER_ACCESS_FEE,
    idempotencyKey,
    description: `Errand pass: ${s.minJobs}+ errands done in this ${s.windowHours}-hour window`,
    metadata: { from: w.from, to: w.to, jobs },
  });
  await alertIfOver(workerId, s);
  return { feePaise: s.feePaise, window: w, jobs };
}

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

// Partner errands carry no commission while the pass is on.
async function commissionFree() {
  return !!(await settings()).on;
}

module.exports = { windowOf, onJobDone, assertCanTakeErrand, commissionFree };
