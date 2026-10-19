// Staff-only services (ServiceLine.staffOnly): every ZappyOne staff member holds an approved enrolment for each, nobody else does.
const { ProviderEnrolment, ServiceLine } = require('./onboarding.model');
const Worker = require('../worker/worker.model');

const NOTE = 'ZappyOne staff';

async function staffLines() {
  return ServiceLine.find({ staffOnly: true, isArchived: { $ne: true } }).select('code domainCode').lean();
}

async function approve(workerIds, lines) {
  if (!workerIds.length || !lines.length) return 0;
  const now = new Date();
  const ops = workerIds.flatMap((workerId) => lines.map((l) => ({
    updateOne: {
      filter: { workerId, lineCode: l.code },
      update: {
        $set: { status: 'approved', reviewNote: NOTE, reviewedAt: now },
        $setOnInsert: { providerKind: 'individual', shopId: null, domainCode: l.domainCode, acceptedDeclarations: true, submittedAt: now },
      },
      upsert: true,
    },
  })));
  const r = await ProviderEnrolment.bulkWrite(ops, { ordered: false });
  return (r.upsertedCount || 0) + (r.modifiedCount || 0);
}

/** One worker after their employment changed: staff gain every staff-only service, anyone else loses them. */
async function syncWorker(workerId) {
  const [w, lines] = await Promise.all([Worker.findById(workerId).select('employment shopId').lean(), staffLines()]);
  if (!w || !lines.length) return 0;
  if (w.employment?.type === 'staff' && !w.shopId) return approve([w._id], lines);
  const r = await ProviderEnrolment.deleteMany({ workerId: w._id, lineCode: { $in: lines.map((l) => l.code) } });
  return r.deletedCount || 0;
}

/** Every staff member, every staff-only service: run when a staff-only service launches. */
async function syncAllStaff() {
  const [staff, lines] = await Promise.all([
    Worker.find({ 'employment.type': 'staff', shopId: null }).select('_id').lean(),
    staffLines(),
  ]);
  const approved = await approve(staff.map((w) => w._id), lines);
  const ids = staff.map((w) => w._id);
  const removed = await ProviderEnrolment.deleteMany({ lineCode: { $in: lines.map((l) => l.code) }, workerId: { $nin: ids } });
  return { staff: staff.length, lines: lines.length, approved, removed: removed.deletedCount || 0 };
}

module.exports = { syncWorker, syncAllStaff };
