/**
 * How many jobs a worker holds at once, across every kind.
 *
 * A job is held from the moment it is accepted until it is finished or
 * cancelled. Accepting more than a person can actually do (one tester took
 * nine at once) leaves customers waiting on someone who cannot come; the cap
 * is set in Economics (maxActiveJobs). Shops are not capped: they hand jobs to
 * their team.
 */
const mongoose = require('mongoose');
const { KINDS } = require('./kinds');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

async function activeJobs(workerId) {
  const id = new mongoose.Types.ObjectId(String(workerId));
  let n = 0;
  for (const kind of ['repair', 'pet', 'helping']) {
    const k = KINDS[kind];
    if (!k?.ops) continue;
    // Touched in the last 48 h: a job abandoned mid-way long ago is ops' to clear
    // (it shows as stuck), not a reason to keep someone from working today.
    n += await k.model().countDocuments({
      workerId: id, status: { $nin: [...k.ops.terminal, ...k.ops.waiting] }, updatedAt: { $gte: new Date(Date.now() - 48 * 3600e3) },
    });
  }
  return n;
}

/** Throws when this worker already holds as many jobs as they may. */
async function assertCanTakeAnother(workerId) {
  const { maxActiveJobs = 2 } = await require('../order/cancellation.service').getConfig();
  const n = await activeJobs(workerId);
  if (n >= maxActiveJobs) {
    throw err(409, 'TOO_MANY_JOBS', n === 1
      ? 'Finish your current job first, then take the next one.'
      : `You already have ${n} jobs going. Finish one first, then take the next.`);
  }
}

/**
 * The last stretch of a job, when the next offer may already come in (as ride
 * apps do a few minutes before a drop): the device is being checked or is on
 * its way back, the helper is on the final leg, the pet job is only waiting on
 * payment. A worker in the middle of a job is not offered more.
 */
const FINISHING = {
  repair: ['QA_PENDING', 'READY_FOR_RETURN', 'OUT_FOR_RETURN'],
  helping: ['RETURNING', 'AT_DROPOFF', 'HANDED_OVER'],
  pet: ['SERVICE_COMPLETED', 'CUSTOMER_CONFIRMATION', 'PAYMENT_PENDING'],
};

/**
 * Sort workers for a new offer: `free` (no job, or the last stretch of one with
 * room for another), `busy` (in the middle of a job but with room for one
 * more: offered only when nobody free is near, with a later arrival), and the
 * rest (at their cap) who are not offered at all.
 */
async function classify(workerIds = []) {
  const ids = [...new Set(workerIds.map(String))];
  if (!ids.length) return { free: new Set(), busy: new Set() };
  const { maxActiveJobs = 2 } = await require('../order/cancellation.service').getConfig();
  const oids = ids.map((i) => new mongoose.Types.ObjectId(i));
  const since = new Date(Date.now() - 48 * 3600e3);
  const held = new Map(); // workerId -> { n, midway }
  for (const kind of ['repair', 'pet', 'helping']) {
    const k = KINDS[kind];
    if (!k?.ops) continue;
    const rows = await k.model().find({
      workerId: { $in: oids }, status: { $nin: [...k.ops.terminal, ...k.ops.waiting] }, updatedAt: { $gte: since },
    }).select('workerId status').lean();
    for (const r of rows) {
      const h = held.get(String(r.workerId)) || { n: 0, midway: false };
      h.n += 1;
      if (!FINISHING[kind].includes(r.status)) h.midway = true;
      held.set(String(r.workerId), h);
    }
  }
  const free = new Set(); const busy = new Set();
  for (const id of ids) {
    const h = held.get(id);
    if (!h || (h.n < maxActiveJobs && !h.midway)) free.add(id);
    else if (h.n < maxActiveJobs) busy.add(id);
  }
  return { free, busy };
}

/** Of these workers, the ones free for a new job right now (string ids). */
async function offerable(workerIds = []) {
  return (await classify(workerIds)).free;
}

/** Extra minutes before a busy worker can reach a new job (their current one finishes first). */
const BUSY_EXTRA_MIN = 60;

module.exports = { activeJobs, assertCanTakeAnother, offerable, classify, FINISHING, BUSY_EXTRA_MIN };
