/**
 * Every live job, and the stuck ones, across all kinds — for the admin live
 * board, the stuck-jobs list and system alerts. What "live", "where" and
 * "stuck" mean per kind lives in jobs/kinds.js; this only applies it.
 */
const { ALL } = require('./kinds');

/** When the job entered its current status. */
function since(doc) {
  const last = (doc.statusHistory || []).at(-1);
  return new Date(last?.at || doc.updatedAt || doc.createdAt);
}

/** One row per live job, in the same shape whatever its kind. */
async function liveJobs({ now = new Date(), cap = 500 } = {}) {
  const rows = [];
  for (const k of ALL.filter((x) => x.ops)) {
    const docs = await k.model().find({ status: { $nin: k.ops.terminal } })
      .select(k.ops.fields).sort({ updatedAt: -1 }).limit(cap).lean();
    for (const d of docs) {
      const at = since(d);
      const mins = (now - at) / 60000;
      const where = k.ops.where(d);
      rows.push({
        kind: k.kind,
        id: String(d._id),
        reference: d.reference || null,
        title: k.ops.title(d),
        // Which service: repair vertical, pet category or helping type (Insights groups by it).
        vertical: d.vertical || d.categoryCode || d.serviceType || null,
        status: d.status,
        waiting: k.ops.waiting.includes(d.status),
        hasProvider: Boolean(d.workerId || d.shopId || d.partnerId),
        lat: where?.lat ?? null,
        lng: where?.lng ?? null,
        address: where?.address || '',
        since: at,
        minutesInStatus: Math.round(mins),
        stuck: k.ops.stuck(d, mins, now.getTime()),
        createdAt: d.createdAt,
      });
    }
  }
  return rows;
}

/** Live jobs past their kind's limit, longest-stuck first. */
async function stuckJobs({ now = new Date() } = {}) {
  return (await liveJobs({ now }))
    .filter((j) => j.stuck)
    .sort((a, b) => b.minutesInStatus - a.minutesInStatus);
}

/**
 * What needs a person now, for the Bookings → Needs intervention tab: jobs
 * past their time limit, then jobs still waiting for a provider. Longest
 * first in each group.
 */
async function attention({ now = new Date() } = {}) {
  const live = await liveJobs({ now });
  const { JobGiveBack } = require('./give-back');

  // A job two providers have already walked away from needs a person, not a third offer.
  const handed = await JobGiveBack.aggregate([
    { $match: { jobId: { $in: live.map((j) => new (require('mongoose').Types.ObjectId)(j.id)) }, toShop: false, type: { $ne: 'customer_no_show' } } },
    { $group: { _id: '$jobId', n: { $sum: 1 } } },
  ]);
  const handedBy = new Map(handed.map((h) => [String(h._id), h.n]));
  for (const j of live) {
    j.handedBack = handedBy.get(j.id) || 0;
    if (j.handedBack >= 2 && !j.stuck) j.stuck = `handed back by ${j.handedBack} providers`;
  }

  const byWait = (a, b) => b.minutesInStatus - a.minutesInStatus;
  const stuck = live.filter((j) => j.stuck).sort(byWait);
  const waiting = live.filter((j) => !j.stuck && j.waiting && !j.hasProvider).sort(byWait);

  // Providers backing out of jobs today, worst first, before they hit the limit.
  const cfg = await require('../order/cancellation.service').getConfig();
  const day = new Date(now.getTime() - (cfg.workerCancelWindowSec || 86400) * 1000);
  const rows = await JobGiveBack.aggregate([
    { $match: { createdAt: { $gte: day }, type: { $ne: 'customer_no_show' }, toShop: false } },
    { $group: { _id: { kind: '$providerKind', id: '$providerId' }, total: { $sum: 1 }, counted: { $sum: { $cond: ['$counted', 1, 0] } }, noShows: { $sum: { $cond: [{ $eq: ['$type', 'provider_no_show'] }, 1, 0] } }, pausedUntil: { $max: '$pausedUntil' } } },
    { $match: { $or: [{ total: { $gte: 2 } }, { noShows: { $gte: 1 } }] } },
    { $sort: { counted: -1, total: -1 } },
    { $limit: 20 },
  ]);
  const Worker = require('../worker/worker.model');
  const Shop = require('../shop/shop.model');
  const names = new Map([
    ...(await Worker.find({ _id: { $in: rows.filter((r) => r._id.kind === 'worker').map((r) => r._id.id) } }).select('name phone').lean()).map((w) => [String(w._id), w]),
    ...(await Shop.find({ _id: { $in: rows.filter((r) => r._id.kind === 'shop').map((r) => r._id.id) } }).select('businessName phone').lean()).map((x) => [String(x._id), { name: x.businessName, phone: x.phone }]),
  ]);
  const backingOut = rows.map((r) => ({
    kind: r._id.kind, id: String(r._id.id), name: names.get(String(r._id.id))?.name || 'Provider', phone: names.get(String(r._id.id))?.phone || null,
    handedBack: r.total, counted: r.counted, noShows: r.noShows, limit: cfg.workerCancelLimit || 3,
    pausedUntil: r.pausedUntil && r.pausedUntil > now ? r.pausedUntil : null,
  }));

  return { stuck, waiting, backingOut, count: stuck.length + waiting.length };
}

/** Counts for a board header: by kind, waiting, stuck. */
function summarise(jobs) {
  const byKind = {};
  for (const j of jobs) {
    byKind[j.kind] ??= { live: 0, waiting: 0, stuck: 0 };
    byKind[j.kind].live += 1;
    if (j.waiting) byKind[j.kind].waiting += 1;
    if (j.stuck) byKind[j.kind].stuck += 1;
  }
  return {
    live: jobs.length,
    waiting: jobs.filter((j) => j.waiting).length,
    stuck: jobs.filter((j) => j.stuck).length,
    byKind,
  };
}

module.exports = { liveJobs, stuckJobs, attention, summarise, since };
