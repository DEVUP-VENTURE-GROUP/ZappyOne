/**
 * What finished jobs paid a provider, for every kind in jobs/kinds.js.
 *
 * Each kind says when a job counts as done and what the provider's share was —
 * for a repair that is the settlement run's own split — so a technician's
 * screen, a shop's screen and the actual payout read the same numbers.
 */
const { ALL } = require('./kinds');
const { istDayStart } = require('../../core/time/ist');

const dotted = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);

/** Start of a reporting window; "today" is India's day, not the server's. */
function rangeStart(range = 'today') {
  if (range === 'today') return istDayStart();
  return new Date(Date.now() - (range === 'week' ? 7 : 30) * 86400 * 1000);
}

/**
 * Every job matching `match` (e.g. { workerId } or a shop's $or) finished
 * since `since`, as { kind, paise, platformPaise, cash, at }.
 */
async function finishedJobs(match, since) {
  const finished = [];
  for (const k of ALL.filter((x) => x.earning)) {
    const rows = await k.model().find({
      ...match, status: { $in: k.earning.done }, [k.earning.at]: { $gte: since },
    }).select(k.earning.fields).lean();
    for (const r of rows) {
      finished.push({
        kind: k.kind, paise: k.earning.share(r), platformPaise: k.earning.platform ? k.earning.platform(r) : 0,
        cash: r.paymentMethod === 'cash', at: dotted(r, k.earning.at),
      });
    }
  }
  return finished;
}

module.exports = { rangeStart, finishedJobs };
