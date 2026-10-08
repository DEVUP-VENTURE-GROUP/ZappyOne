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

module.exports = { activeJobs, assertCanTakeAnother };
