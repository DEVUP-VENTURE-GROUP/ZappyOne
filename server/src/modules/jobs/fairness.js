// Fair and fast: whoever can arrive within the promise is equal on distance; among them the fewest jobs today, then the longest idle, wins.
const { roughMinutes, PROMISE_MIN } = require('./arrival');

const istDay = (t = Date.now()) => new Date(t + 330 * 60000).toISOString().slice(0, 10);

// Fields to select on Worker/Shop so ranking needs no extra query.
const STATS_FIELDS = 'dispatchStats';

function statsOf(doc, today = istDay()) {
  const s = doc?.dispatchStats;
  return { jobsToday: s?.day === today ? (s.jobs || 0) : 0, lastAt: s?.lastAt ? new Date(s.lastAt).getTime() : 0 };
}

// O(n log n). Each candidate: { km, kind, staff?, stats: statsOf(doc) }; staff on duty stay first.
function fairOrder(candidates, { promiseMin = PROMISE_MIN } = {}) {
  const inBand = (c) => c.km != null && roughMinutes(c.km, c.kind) <= promiseMin;
  return candidates
    .map((c) => ({ c, band: inBand(c), s: c.stats || { jobsToday: 0, lastAt: 0 } }))
    .sort((a, b) => (Number(!!b.c.staff) - Number(!!a.c.staff))
      || (Number(b.band) - Number(a.band))
      || (a.band ? (a.s.jobsToday - b.s.jobsToday) || (a.s.lastAt - b.s.lastAt) : 0)
      || ((a.c.km ?? Infinity) - (b.c.km ?? Infinity)))
    .map((x) => x.c);
}

// Counts a job taken today; called once per acceptance (jobs/job-events).
async function recordTaken({ kind, id }) {
  const Model = kind === 'shop' ? require('../shop/shop.model') : require('../worker/worker.model');
  const day = istDay();
  const now = new Date();
  const r = await Model.updateOne({ _id: id, 'dispatchStats.day': day }, { $inc: { 'dispatchStats.jobs': 1 }, $set: { 'dispatchStats.lastAt': now } });
  if (!r.matchedCount) await Model.updateOne({ _id: id }, { $set: { dispatchStats: { day, jobs: 1, lastAt: now } } });
}

module.exports = { fairOrder, statsOf, recordTaken, istDay, STATS_FIELDS };
