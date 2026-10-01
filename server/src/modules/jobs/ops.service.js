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

module.exports = { liveJobs, stuckJobs, summarise, since };
