const err = (status, code, message) => Object.assign(new Error(message), { status, code });

// Workers who said "never send me this customer again"; every dispatch path leaves them out.
async function blockersOf(userId) {
  if (!userId) return new Set();
  const rows = await require('../worker/worker.model').find({ 'trust.blockedFromUserIds': userId }).select('_id').limit(500).lean();
  return new Set(rows.map((r) => String(r._id)));
}

// From a job the worker did: the customer comes off their future offers, and ops can review why.
async function blockFromJob({ kind, doc, workerId, reason = '' }) {
  if (String(doc.workerId || '') !== String(workerId)) throw err(403, 'FORBIDDEN', 'This job is not yours');
  await require('../worker/worker.model').updateOne({ _id: workerId }, { $addToSet: { 'trust.blockedFromUserIds': doc.userId } });
  require('../../core/logger').info({ workerId: String(workerId), kind, jobId: String(doc._id), reason: String(reason).slice(0, 300) }, '[customer-block] customer blocked by worker');
  return { blocked: true, message: 'Done. You will not get jobs from this customer again.' };
}

module.exports = { blockersOf, blockFromJob };
