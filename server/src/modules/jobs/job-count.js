// "Jobs done" on shop and pro profiles, for every job kind: counted once, the first time a job reaches a done status (kinds.js earning.done).
const { KINDS } = require('./kinds');

const MODELS = { shop: () => require('../shop/shop.model'), worker: () => require('../worker/worker.model') };

function earners(doc) {
  const out = [];
  if (doc.shopId) out.push(['shop', doc.shopId]);
  if (doc.workerId) out.push(['worker', doc.workerId]);
  return out;
}

async function onStatus(kind, doc, status) {
  const k = KINDS[kind];
  if (!k?.earning?.done?.includes(status) || !earners(doc).length) return false;
  // The stamp makes it once per job, even when a job passes through several done statuses or two saves race.
  const claimed = await k.model().collection.updateOne({ _id: doc._id, jobCountedAt: { $exists: false } }, { $set: { jobCountedAt: new Date() } });
  if (!claimed.modifiedCount) return false;
  await Promise.all(earners(doc).map(([who, id]) => MODELS[who]().updateOne({ _id: id }, { $inc: { completedJobs: 1 } })));
  return true;
}

// Done jobs from before this counter existed: counted the same way, once each. Safe to run again.
async function backfill() {
  const added = { shop: 0, worker: 0 };
  for (const [kind, k] of Object.entries(KINDS)) {
    if (!k.earning?.done) continue;
    const cursor = k.model().collection.find({ status: { $in: k.earning.done }, jobCountedAt: { $exists: false }, $or: [{ shopId: { $ne: null } }, { workerId: { $ne: null } }] }, { projection: { shopId: 1, workerId: 1, status: 1 } });
    for await (const doc of cursor) {
      if (await onStatus(kind, doc, doc.status)) earners(doc).forEach(([who]) => { added[who] += 1; });
    }
  }
  return added;
}

module.exports = { onStatus, backfill };
