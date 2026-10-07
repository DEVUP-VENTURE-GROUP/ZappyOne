/**
 * A shop's job, and the technician who does it — for every kind in jobs/kinds.js.
 *
 * The customer books the shop; somebody from the shop goes. Two rules hold for
 * every kind of job a shop can take:
 *
 *   - the owner can put any of their own technicians on it, and nobody else's
 *   - the owner may also go themselves; the customer then follows the owner's
 *     phone live (jobs/:id/owner-location), exactly as they would a technician
 */
const { KINDS, findJob } = require('./kinds');

const err = (message, status, code) => Object.assign(new Error(message), { status, code });

/**
 * A shop job may set off with no technician named: the owner is going
 * themselves and is followed live from their own phone. Kept as the single
 * place this rule lives, should it ever need to tighten again.
 */
// eslint-disable-next-line no-unused-vars
function assertSomeoneTravels(kind, doc, next) {}

/** The owner hands a job to one of their own technicians. */
async function assignTechnician({ jobId, shopId, workerId }) {
  const found = await findJob(jobId);
  if (!found) throw err('Job not found', 404, 'NOT_FOUND');
  const { kind } = found;

  // Repairs keep their own service: it also re-rings and records custody.
  if (kind === 'repair') {
    const { assignWorker } = require('../repair/services/booking/assignment');
    const { booking, worker } = await assignWorker({ bookingId: jobId, shopId, workerId });
    return { kind, job: booking, worker };
  }

  const doc = await KINDS[kind].model().findById(jobId).lean();
  if (String(doc.shopId || '') !== String(shopId)) throw err('This job is not yours to assign', 403, 'FORBIDDEN');
  if (KINDS[kind].ops?.terminal?.includes(doc.status)) throw err('This job is already closed', 409, 'JOB_CLOSED');

  const Worker = require('../worker/worker.model');
  const worker = await Worker.findOne({ _id: workerId, shopId }).select('name isBlocked').lean();
  if (!worker) throw err('That technician is not on your team', 400, 'NOT_YOUR_WORKER');
  if (worker.isBlocked) throw err('That technician is blocked and cannot take jobs', 409, 'WORKER_BLOCKED');

  // Only this one field moves, so nothing else about the job is re-validated.
  await KINDS[kind].model().updateOne({ _id: doc._id, shopId }, { $set: { workerId: worker._id } });
  doc.workerId = worker._id;
  // Their screens, and the customer's, pick it up at once.
  require('./job-events').announceAssigned(kind, doc).catch(() => {});
  return { kind, job: doc, worker };
}

module.exports = { assertSomeoneTravels, assignTechnician };
