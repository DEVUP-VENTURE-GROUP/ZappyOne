/**
 * Offers a worker passes on in a row, for every kind.
 *
 * Passing on one offer is a normal answer and costs nothing. Passing on
 * workerRejectLimit in a row (Economics → Cancellations) says the worker is not
 * really free, so they are set offline: customers stop being matched to someone
 * who will not come, and the worker goes online again with one tap whenever
 * they are ready. Accepting any job resets the count. No money is involved.
 */
const Worker = require('../worker/worker.model');
const logger = require('../../core/logger');

/** A worker passed on an offer. Returns true when that took them offline. */
async function passed(workerId) {
  if (!workerId) return false;
  try {
    const { workerRejectLimit = 5 } = await require('../order/cancellation.service').getConfig();
    const w = await Worker.findOneAndUpdate(
      { _id: workerId },
      { $inc: { 'penalties.totalRejects': 1, 'penalties.rejectStreak': 1 } },
      { new: true },
    ).select('isOnline penalties.rejectStreak').lean();
    if (!w || (w.penalties?.rejectStreak || 0) < workerRejectLimit) return false;
    await Worker.updateOne({ _id: workerId }, {
      $set: { 'penalties.rejectStreak': 0, isOnline: false, isAvailable: false, onlineSince: null },
    });
    if (!w.isOnline) return false;
    await require('../worker/geo.service').markOffline(workerId).catch(() => {});
    require('../messaging/send').send('provider.offers_paused', {
      to: { kind: 'worker', id: workerId }, ctx: { count: workerRejectLimit },
    }).catch(() => {});
    return true;
  } catch (e) {
    logger.warn({ err: e.message, workerId: String(workerId) }, '[offer-streak] could not count a pass');
    return false;
  }
}

/** A worker took a job: the run of passes is over. */
async function took(workerId) {
  if (!workerId) return;
  await Worker.updateOne({ _id: workerId, 'penalties.rejectStreak': { $gt: 0 } }, { $set: { 'penalties.rejectStreak': 0 } })
    .catch(() => {});
}

module.exports = { passed, took };
