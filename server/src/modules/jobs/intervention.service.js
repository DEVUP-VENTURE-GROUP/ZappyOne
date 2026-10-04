/**
 * Ops stepping into a live job, for every kind: who could take it, handing it
 * to someone (or moving it from one provider to another), and notes the team
 * leaves on a job.
 *
 * Rules, the same for repairs, pet care and helping:
 *   - only providers verified for the job's service, and not blocked
 *   - assigning puts the job in the kind's "offered" state, so the provider is
 *     rung and still accepts or declines; nobody is made to work blind
 *   - a job can be moved only before the provider reaches the customer;
 *     once work has started at the door it is refused
 *   - the price stays exactly as booked
 *   - every move carries a reason, lands in the job's history and the audit log
 */
const mongoose = require('mongoose');
const { KINDS, lineOf } = require('./kinds');
const { approvedProviders } = require('../onboarding/eligibility');
const { haversineKm } = require('../../core/geo/distance');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

/** Per kind: which statuses ops may assign from, the status it moves to, and who may take it. */
const RULES = {
  repair: {
    from: ['CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY'],
    to: 'PROVIDER_ASSIGNED',
    providers: ['worker', 'shop'],
    history: (by, note) => ({ status: 'PROVIDER_ASSIGNED', at: new Date(), actorRole: 'admin', actorId: by, reason: note }),
  },
  pet: {
    from: ['BOOKED', 'PROVIDER_SEARCHING', 'PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE'],
    to: 'PROVIDER_ASSIGNED',
    providers: ['worker', 'shop'],
    stamp: 'assignedAt',
    history: (by, note) => ({ status: 'PROVIDER_ASSIGNED', at: new Date(), by, byRole: 'admin', note }),
  },
  helping: {
    from: ['CONFIRMED', 'WORKER_SEARCHING', 'WORKER_ASSIGNED', 'WORKER_DECLINED', 'WORKER_ACCEPTED', 'EN_ROUTE'],
    to: 'WORKER_ASSIGNED',
    providers: ['worker'],
    history: (by, note) => ({ status: 'WORKER_ASSIGNED', at: new Date(), by, byRole: 'admin', note }),
  },
};

function ruleFor(kind) {
  const r = RULES[kind];
  if (!r) throw err(400, 'NOT_ASSIGNABLE', 'This kind of booking is not assigned by ops');
  return r;
}

const canIntervene = (kind, status) => !!RULES[kind]?.from.includes(status);

/** Where the job starts, for distances: the kind's own notion of it. */
function startOf(kind, doc) {
  const k = KINDS[kind];
  return k.open?.start?.(doc) || k.ops?.where?.(doc) || null;
}

/** Providers who could take this job: verified for its service, not blocked, nearest and online first. */
async function candidates(kind, id) {
  const rule = ruleFor(kind);
  const doc = await KINDS[kind].model().findById(id).lean();
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  const line = await lineOf(kind, doc);
  if (!line) return { line: null, providers: [] };
  const start = startOf(kind, doc);
  const approved = (await approvedProviders(line)).filter((p) => rule.providers.includes(p.kind));

  const Worker = require('../worker/worker.model');
  const Shop = require('../shop/shop.model');
  const workerIds = approved.filter((p) => p.kind === 'worker').map((p) => p.id);
  const shopIds = approved.filter((p) => p.kind === 'shop').map((p) => p.id);
  const [workers, shops] = await Promise.all([
    Worker.find({ _id: { $in: workerIds }, isBlocked: { $ne: true } }).select('name phone rating reviewCount isOnline currentLocation completedJobs shopId').lean(),
    Shop.find({ _id: { $in: shopIds }, isBlocked: { $ne: true } }).select('businessName phone rating reviewCount isActive address.location').lean(),
  ]);
  const km = (coords) => (start && coords?.length === 2 ? Number(haversineKm(start.lat, start.lng, coords[1], coords[0]).toFixed(1)) : null);
  const current = String(doc.workerId || doc.shopId || '');

  const rows = [
    ...workers.map((w) => ({
      kind: 'worker', id: String(w._id), name: w.name || 'Worker', phone: w.phone || null,
      rating: w.reviewCount ? w.rating : null, jobs: w.completedJobs || 0, online: !!w.isOnline,
      km: km(w.currentLocation?.coordinates), shopTechnician: !!w.shopId,
    })),
    ...shops.map((s) => ({
      kind: 'shop', id: String(s._id), name: s.businessName || 'Shop', phone: s.phone || null,
      rating: s.reviewCount ? s.rating : null, jobs: null, online: s.isActive !== false,
      km: km(s.address?.location?.coordinates), shopTechnician: false,
    })),
  ].map((p) => ({ ...p, current: p.id === current }))
    .sort((a, b) => Number(b.online) - Number(a.online) || (a.km ?? 9999) - (b.km ?? 9999));

  return { line, status: doc.status, assignable: canIntervene(kind, doc.status), providers: rows.slice(0, 40) };
}

/** Hand the job to a provider (first time, or moving it from someone else). */
async function assign({ kind, id, providerKind, providerId, reason, adminId }) {
  const rule = ruleFor(kind);
  const note = String(reason || '').trim();
  if (note.length < 5) throw err(400, 'REASON_REQUIRED', 'Write a short reason (at least 5 characters); it goes in the job history.');
  if (!rule.providers.includes(providerKind)) throw err(400, 'BAD_PROVIDER', 'This booking can only go to an individual worker.');

  const Model = KINDS[kind].model();
  const doc = await Model.findById(id);
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  if (!rule.from.includes(doc.status)) {
    throw err(409, 'TOO_LATE', 'This booking can no longer be moved: the provider is already at the customer or it has ended.');
  }

  const line = await lineOf(kind, doc);
  const ok = (await approvedProviders(line)).some((p) => p.kind === providerKind && p.id === String(providerId));
  if (!ok) throw err(409, 'NOT_VERIFIED', 'That provider is not verified for this service.');
  const Provider = providerKind === 'shop' ? require('../shop/shop.model') : require('../worker/worker.model');
  const provider = await Provider.findById(providerId).select('name businessName isBlocked shopId').lean();
  if (!provider) throw err(404, 'NOT_FOUND', 'Provider not found');
  if (provider.isBlocked) throw err(409, 'PROVIDER_BLOCKED', 'That provider is blocked.');

  const previous = doc.shopId ? { kind: 'shop', id: String(doc.shopId) } : doc.workerId ? { kind: 'worker', id: String(doc.workerId) } : null;
  if (previous && previous.kind === providerKind && previous.id === String(providerId) && doc.status === rule.to) {
    throw err(409, 'ALREADY_THEIRS', 'This booking is already offered to that provider.');
  }

  // A shop takes the job as the shop; one of its technicians is named by the shop.
  // A shop's own technician picked directly keeps the shop on it.
  doc.shopId = providerKind === 'shop' ? new mongoose.Types.ObjectId(providerId) : (provider.shopId || null);
  doc.workerId = providerKind === 'worker' ? new mongoose.Types.ObjectId(providerId) : null;
  doc.status = rule.to;
  if (rule.stamp) doc[rule.stamp] = new Date();
  doc.statusHistory.push(rule.history(adminId, `Ops: ${note}`));
  await doc.save({ validateModifiedOnly: true });

  const events = require('./job-events');
  const plain = doc.toObject();
  // The new provider is rung through the kind's normal offer; the customer's screen refreshes.
  await events.announce(kind, plain, rule.to).catch(() => {});
  // Whoever had it is told it moved, so it leaves their list.
  if (previous && !(previous.kind === providerKind && previous.id === String(providerId))) {
    events.notifyMoved(kind, plain, previous).catch(() => {});
  }
  return { status: doc.status, provider: { kind: providerKind, id: String(providerId), name: provider.businessName || provider.name } };
}

/* Notes: what the team knows about a job, for the next person who opens it. */
const noteSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  text: { type: String, required: true, maxlength: 1000 },
  by: { type: mongoose.Schema.Types.ObjectId, default: null },
  byEmail: { type: String, default: '' },
}, { timestamps: true });
const JobNote = mongoose.models.JobNote || mongoose.model('JobNote', noteSchema);

async function listNotes(kind, id) {
  return JobNote.find({ kind, jobId: id }).sort({ createdAt: -1 }).limit(100).lean();
}

async function addNote({ kind, id, text, adminId, adminEmail }) {
  const clean = String(text || '').trim();
  if (clean.length < 2) throw err(400, 'NOTE_EMPTY', 'Write the note first.');
  return JobNote.create({ kind, jobId: id, text: clean.slice(0, 1000), by: adminId, byEmail: adminEmail || '' });
}

module.exports = { RULES, canIntervene, candidates, assign, listNotes, addNote, JobNote };
