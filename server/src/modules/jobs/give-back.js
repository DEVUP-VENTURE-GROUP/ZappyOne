/**
 * A provider backing out of a job they accepted, and no-shows on either side,
 * for every kind in jobs/kinds.js.
 *
 * Backing out is supply failing, not the customer changing their mind: the job
 * goes back to the pool and the next provider is rung, the customer is never
 * charged for it, and they may now cancel free. The provider pays for it the
 * way the first version did (order/cancellation.service): the reasons, the
 * penalty, the late multiplier, the daily limit and the no-show penalty are the
 * same settings, read from the same CancellationConfig.
 *
 *   - genuine reasons (breakdown, emergency, customer unreachable, wrong job
 *     details, part not available) cost nothing and are not counted, up to
 *     GENUINE_FREE_PER_WINDOW in the window; past that they count like any other
 *   - the first counted give-back in the window is a warning, not a charge
 *   - after that: the base penalty, times the late multiplier once on the way
 *   - reaching the limit takes a worker offline for the rest of the window
 *   - a shop's technician hands it back to their shop, never to the pool
 *
 * Penalties are debited from the provider's wallet, the same ledger their
 * commission dues sit on; a wallet failure never blocks the give-back.
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { KINDS } = require('./kinds');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

/** The first version's reasons, plus the one only a repair has. */
const REASONS = [
  ...require('../order/cancellation.service').WORKER_CANCEL_REASONS.filter((r) => r.code !== 'other'),
  { code: 'part_unavailable', label: 'Part not available', genuine: true, kinds: ['repair'] },
  { code: 'other', label: 'Other reason', genuine: false },
];
const reasonOf = (code) => REASONS.find((r) => r.code === code);
const GENUINE_FREE_PER_WINDOW = 2;

/**
 * Per kind: where a provider holds the job before work starts (and may give it
 * back), which of those mean they set off (late), where they are at the
 * customer (customer no-show), and the status the job returns to.
 */
const RULES = {
  repair: {
    held: ['WORKER_ACCEPTED', 'PICKUP_SCHEDULED', 'ON_THE_WAY', 'ARRIVED'],
    late: ['ON_THE_WAY', 'ARRIVED'],
    atCustomer: () => ['ARRIVED'],
    accepted: ['WORKER_ACCEPTED'],
    travelling: ['ON_THE_WAY'],
  },
  pet: {
    held: ['PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED'],
    late: ['PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED'],
    atCustomer: (b) => (b.serviceMode === 'provider_location' ? [] : ['PROVIDER_ARRIVED']),
    accepted: ['PROVIDER_ACCEPTED'],
    travelling: ['PROVIDER_EN_ROUTE'],
    pool: 'PROVIDER_SEARCHING',
    seen: 'declinedBy',
  },
  helping: {
    held: ['WORKER_ACCEPTED', 'EN_ROUTE', 'ARRIVED'],
    late: ['EN_ROUTE', 'ARRIVED'],
    // Only returns and exchanges start at the customer's door.
    atCustomer: (t) => (['return', 'exchange'].includes(t.serviceType) ? ['ARRIVED'] : []),
    accepted: ['WORKER_ACCEPTED'],
    travelling: ['EN_ROUTE'],
    pool: 'WORKER_SEARCHING',
    seen: 'releasedBy',
  },
};

/** Minutes a provider waits at the door before "customer not here" opens. */
const CUSTOMER_WAIT_MIN = 10;
/** Minutes past the booked time (or acceptance) before "provider not coming" opens. */
const PROVIDER_LATE_MIN = 30;

/* The record: one row per give-back or no-show, for limits, ops and the funnel. */
const giveBackSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  providerKind: { type: String, enum: ['worker', 'shop'], required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  /** give_back: they backed out · provider_no_show: the customer reported them · customer_no_show: they reported the customer. */
  type: { type: String, enum: ['give_back', 'provider_no_show', 'customer_no_show'], default: 'give_back' },
  reason: { type: String, default: '' },
  note: { type: String, default: '', maxlength: 300 },
  status: { type: String, default: '' },
  late: { type: Boolean, default: false },
  genuine: { type: Boolean, default: false },
  counted: { type: Boolean, default: false },
  penaltyPaise: { type: Number, default: 0 },
  penaltyCharged: { type: Boolean, default: false },
  pausedUntil: { type: Date, default: null },
  toShop: { type: Boolean, default: false },
}, { timestamps: true });
giveBackSchema.index({ providerId: 1, createdAt: -1 });
giveBackSchema.index({ createdAt: -1 });
const JobGiveBack = mongoose.models.JobGiveBack || mongoose.model('JobGiveBack', giveBackSchema);

/** When the job last entered one of these statuses, from its own history. */
function enteredAt(doc, statuses) {
  const hit = [...(doc.statusHistory || [])].reverse().find((h) => statuses.includes(h.status));
  return hit?.at ? new Date(hit.at) : null;
}

/** Who is acting on the job, if they hold it: a worker, their shop, or the shop owner. */
function holderOf(doc, actor) {
  if (actor.kind === 'worker' && String(doc.workerId || '') === String(actor.id)) return { kind: 'worker', id: String(actor.id) };
  if (actor.kind === 'shop' && String(doc.shopId || '') === String(actor.id)) return { kind: 'shop', id: String(actor.id) };
  return null;
}

async function load(kind, id) {
  const rule = RULES[kind];
  if (!rule) throw err(400, 'NOT_SUPPORTED', 'This kind of booking cannot be handed back here.');
  const doc = await KINDS[kind].model().findById(id);
  if (!doc) throw err(404, 'NOT_FOUND', 'Booking not found');
  return { rule, doc };
}

/** What backing out would cost this provider right now. Nothing changes. */
async function quote({ kind, doc, provider, reason, type = 'give_back' }) {
  const rule = RULES[kind];
  const cfg = await require('../order/cancellation.service').getConfig();
  const since = new Date(Date.now() - (cfg.workerCancelWindowSec || 86400) * 1000);
  const [counted, genuineUsed] = await Promise.all([
    JobGiveBack.countDocuments({ providerId: provider.id, counted: true, createdAt: { $gte: since } }),
    JobGiveBack.countDocuments({ providerId: provider.id, genuine: true, counted: false, createdAt: { $gte: since } }),
  ]);
  const late = rule.late.includes(doc.status);
  const r = reasonOf(reason);
  const genuine = type === 'give_back' && !!r?.genuine && genuineUsed < GENUINE_FREE_PER_WINDOW;
  const toShop = provider.kind === 'worker' && !!doc.shopId;

  let penaltyPaise = 0;
  let isWarning = false;
  if (type === 'provider_no_show') penaltyPaise = cfg.workerNoShowPenaltyPaise || 0;
  else if (!genuine && !toShop) {
    if (counted === 0) isWarning = true;
    else penaltyPaise = Math.round((cfg.workerCancelPenaltyPaise || 0) * (late ? cfg.lateWorkerCancelMultiplier || 1 : 1));
  }
  const counts = !genuine && !toShop;
  const limit = cfg.workerCancelLimit || 3;
  const pauses = counts && provider.kind === 'worker' && counted + 1 >= limit;
  const rupees = (p) => `₹${Math.round(p / 100)}`;

  let message;
  if (toShop) message = 'The job goes back to your shop owner to give to someone else.';
  else if (type === 'provider_no_show') message = `Reported as a no-show: ${rupees(penaltyPaise)} is taken from your wallet.`;
  else if (genuine) message = 'No charge for this reason. We will find someone else for the customer.';
  else if (isWarning) message = 'No charge this time. The next job you hand back today costs you money, so only accept what you can do.';
  else message = `Handing this back costs ${rupees(penaltyPaise)}${late ? ' because you had already set off' : ''}. It is taken from your wallet.`;
  if (pauses) message += ` This is your ${limit}th today, so you will be taken offline until tomorrow.`;

  return {
    allowed: rule.held.includes(doc.status), late, genuine, counts, isWarning, penaltyPaise, pauses, toShop,
    countedInWindow: counted, limit, message,
    reasons: REASONS.filter((x) => !x.kinds || x.kinds.includes(kind)).map(({ code, label }) => ({ code, label })),
  };
}

/** Charge, count and (at the limit) pause. Best effort: the give-back already happened. */
async function consequences({ kind, doc, provider, q, type, reason, note, from }) {
  const cfg = await require('../order/cancellation.service').getConfig();
  const pausedUntil = q.pauses ? new Date(Date.now() + (cfg.workerCancelWindowSec || 86400) * 1000) : null;
  const row = await JobGiveBack.create({
    kind, jobId: doc._id, providerKind: provider.kind, providerId: provider.id, type,
    reason, note: String(note || '').slice(0, 300), status: from, late: q.late, genuine: q.genuine,
    counted: q.counts, penaltyPaise: q.penaltyPaise, pausedUntil, toShop: q.toShop,
  });

  if (q.penaltyPaise > 0) {
    try {
      const Transaction = require('../payment/transaction.model');
      await require('../wallet/wallet.service').apply({
        kind: provider.kind, id: provider.id, type: 'debit', amountPaise: q.penaltyPaise,
        reason: Transaction.REASONS.ADMIN_ADJUSTMENT_DEBIT,
        idempotencyKey: `giveback:${row._id}`,
        allowDebt: true,
        refs: kind === 'helping' ? { helpingTaskId: doc._id } : {},
        description: type === 'provider_no_show' ? `No-show on ${doc.reference || 'a job'}` : `Handed back ${doc.reference || 'a job'}`,
      });
      await JobGiveBack.updateOne({ _id: row._id }, { $set: { penaltyCharged: true } });
      if (provider.kind === 'worker') require('../worker/worker-dues.service').notifyIfCrossed(provider.id);
    } catch (e) {
      logger.error({ err: e.message, jobId: String(doc._id) }, '[give-back] penalty not charged');
    }
  }

  if (provider.kind === 'worker') {
    const Worker = require('../worker/worker.model');
    await Worker.updateOne({ _id: provider.id }, {
      $inc: { [type === 'provider_no_show' ? 'penalties.totalNoShows' : 'penalties.totalCancels']: 1 },
      $set: {
        'penalties.lastPenaltyAt': new Date(),
        ...(pausedUntil ? { isOnline: false, isAvailable: false, 'penalties.pausedUntil': pausedUntil } : {}),
      },
    }).catch(() => {});
    if (pausedUntil) {
      await require('../worker/geo.service').markOffline(provider.id).catch(() => {});
      require('./job-events').push({ kind: 'worker', id: provider.id }, {
        title: 'You are offline until tomorrow',
        body: `You handed back ${q.limit} jobs today. You can go online again after ${pausedUntil.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
        deepLink: '/worker', data: { kind: 'paused' },
      }).catch(() => {});
    }
  }
  return row;
}

/** Put the job back in the pool (or back with the shop) and tell everyone. */
async function release({ kind, doc, provider, reasonLabel, toShop, actor }) {
  const events = require('./job-events');
  const id = String(doc._id);

  if (kind === 'repair') {
    const assignment = require('../repair/services/booking/assignment');
    if (toShop) {
      await assignment.passBackToShop(doc, provider.id, reasonLabel);
    } else {
      const res = await assignment.releaseToPool({ bookingId: id, actorRole: actor.kind, actorId: actor.id, reason: reasonLabel });
      if (!res.released) throw err(409, 'TOO_LATE', 'This job can no longer be handed back. Call support.');
    }
  } else if (toShop) {
    // The shop keeps the job; only the technician comes off it.
    await KINDS[kind].model().updateOne({ _id: doc._id }, { $set: { workerId: null } });
    events.toProvider('shop', doc.shopId, 'job.update', { kind, id, status: doc.status, at: new Date().toISOString() });
    events.push({ kind: 'shop', id: doc.shopId }, {
      title: 'A technician handed a job back', body: `${reasonLabel}. Give it to someone else on your team.`,
      deepLink: KINDS[kind].providerLink(id), data: { kind, id },
    }).catch(() => {});
  } else {
    const rule = RULES[kind];
    // A direct move, like ops reassigning: the provider is cleared and the job is open again.
    doc.workerId = null;
    if ('shopId' in doc.toObject()) doc.shopId = null;
    if (kind === 'pet') doc.assignedAt = null;
    doc[rule.seen] = [...(doc[rule.seen] || []), provider.id].filter(Boolean);
    doc.status = rule.pool;
    doc.statusHistory.push({ status: rule.pool, at: new Date(), by: actor.id, byRole: actor.kind, note: `Handed back: ${reasonLabel}` });
    await doc.save({ validateModifiedOnly: true });
    await events.announce(kind, doc.toObject(), rule.pool).catch(() => {});
  }

  if (!toShop) {
    // The customer hears it from us, not by watching the map go blank.
    events.push({ kind: 'user', id: doc.userId }, {
      title: 'Finding you someone else',
      body: 'Your provider could not make it. We are finding the next one now. You can also cancel free.',
      deepLink: KINDS[kind].link(id), data: { kind, id, status: 'PROVIDER_CHANGED' },
    }).catch(() => {});
    events.toProvider(provider.kind, provider.id, 'job.update', { kind, id, status: 'MOVED', at: new Date().toISOString() });
  }
}

/** Preview for the provider's sheet. */
async function preview({ kind, id, actor, reason = 'other' }) {
  const { doc } = await load(kind, id);
  const provider = holderOf(doc, actor);
  if (!provider) throw err(403, 'FORBIDDEN', 'This job is not yours');
  return quote({ kind, doc, provider, reason });
}

/** The provider hands an accepted job back. */
async function giveBack({ kind, id, actor, reason, note = '' }) {
  const { rule, doc } = await load(kind, id);
  const provider = holderOf(doc, actor);
  if (!provider) throw err(403, 'FORBIDDEN', 'This job is not yours');
  const r = reasonOf(reason);
  if (!r || (r.kinds && !r.kinds.includes(kind))) throw err(400, 'BAD_REASON', 'Choose why you are handing this job back');
  if (reason === 'other' && String(note || '').trim().length < 5) throw err(400, 'NOTE_REQUIRED', 'Say in a few words why you cannot do it');
  if (!rule.held.includes(doc.status)) {
    throw err(409, 'TOO_LATE', 'Work has started, so this job cannot be handed back. Call support if something is wrong.');
  }
  const q = await quote({ kind, doc, provider, reason });
  const from = doc.status;
  await release({ kind, doc, provider, reasonLabel: r.label, toShop: q.toShop, actor });
  await consequences({ kind, doc, provider, q, type: 'give_back', reason, note, from })
    .catch((e) => logger.error({ err: e.message, id }, '[give-back] record failed'));
  return { handedBack: true, toShop: q.toShop, penaltyPaise: q.penaltyPaise, paused: q.pauses, message: q.message };
}

/**
 * The customer says the provider is not coming. Opens PROVIDER_LATE_MIN after
 * the booked time (or acceptance, for a job wanted now) while nobody has
 * arrived. The provider is charged the no-show penalty and the job goes to the
 * next provider; the customer may also cancel free.
 */
function providerLateAt(kind, doc) {
  const rule = RULES[kind];
  if (!rule || !doc.workerId && !doc.shopId) return null;
  if (![...rule.accepted, ...rule.travelling].includes(doc.status)) return null;
  const base = doc.scheduledAt || doc.checkInAt || enteredAt(doc, rule.accepted);
  if (!base) return null;
  const startOf = Math.max(new Date(base).getTime(), enteredAt(doc, rule.accepted)?.getTime() || 0);
  return new Date(startOf + PROVIDER_LATE_MIN * 60000);
}

async function reportProviderAbsent({ kind, id, userId }) {
  const { doc } = await load(kind, id);
  if (String(doc.userId) !== String(userId)) throw err(404, 'NOT_FOUND', 'Booking not found');
  const at = providerLateAt(kind, doc);
  if (!at) throw err(409, 'NOT_NOW', 'Your provider has already arrived, or this booking is not waiting on them.');
  if (Date.now() < at.getTime()) {
    throw err(409, 'TOO_SOON', `Give them until ${at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}. You can call them from this screen meanwhile.`);
  }
  const provider = doc.shopId ? { kind: 'shop', id: String(doc.shopId) } : { kind: 'worker', id: String(doc.workerId) };
  const q = await quote({ kind, doc, provider, reason: 'no_show', type: 'provider_no_show' });
  const from = doc.status;
  await release({ kind, doc, provider, reasonLabel: 'Did not turn up', toShop: false, actor: { kind: 'user', id: userId } });
  await consequences({ kind, doc, provider, q, type: 'provider_no_show', reason: 'no_show', from })
    .catch((e) => logger.error({ err: e.message, id }, '[give-back] no-show record failed'));
  return { reassigned: true, message: 'Sorry about that. We are finding you someone else now, or you can cancel free.' };
}

/**
 * The provider waited at the door and nobody came. Opens CUSTOMER_WAIT_MIN
 * after arriving. The job ends as the customer's late cancellation: the
 * arrived-stage fee, part of which compensates the provider's trip.
 */
function customerWaitAt(kind, doc) {
  const rule = RULES[kind];
  if (!rule || !rule.atCustomer(doc).includes(doc.status)) return null;
  const arrived = enteredAt(doc, rule.atCustomer(doc));
  return arrived ? new Date(arrived.getTime() + CUSTOMER_WAIT_MIN * 60000) : null;
}

async function reportCustomerAbsent({ kind, id, actor }) {
  const { doc } = await load(kind, id);
  const provider = holderOf(doc, actor);
  if (!provider) throw err(403, 'FORBIDDEN', 'This job is not yours');
  const at = customerWaitAt(kind, doc);
  if (!at) throw err(409, 'NOT_NOW', 'Mark yourself arrived at the customer first.');
  if (Date.now() < at.getTime()) {
    const mins = Math.ceil((at.getTime() - Date.now()) / 60000);
    throw err(409, 'TOO_SOON', `Wait ${mins} more minute${mins === 1 ? '' : 's'} and try calling the customer first.`);
  }
  const reason = 'Customer not there';
  const out = await require('./cancel-fee').cancelForNoShow({ kind, doc, actor, reason });
  await JobGiveBack.create({
    kind, jobId: doc._id, providerKind: provider.kind, providerId: provider.id, type: 'customer_no_show',
    reason: 'customer_no_show', status: doc.status,
  }).catch(() => {});
  require('./job-events').push({ kind: 'user', id: doc.userId }, {
    title: 'Booking closed: nobody was there',
    body: 'Your provider waited at the address and could not reach you. A missed-visit fee applies.',
    deepLink: KINDS[kind].link(String(doc._id)), data: { kind, id: String(doc._id), status: 'CANCELLED' },
  }).catch(() => {});
  return { closed: true, feePaise: out.feePaise, message: 'Closed. The customer is charged for the missed visit and part of it comes to you.' };
}

/** Has a provider handed this job back? Then the customer may cancel free. */
async function wasHandedBack(jobId) {
  return !!(await JobGiveBack.exists({ jobId, type: { $in: ['give_back', 'provider_no_show'] }, toShop: false }));
}

/** What the customer's screen may offer: a changed provider, and "not coming" when it opens. */
async function customerView(kind, doc) {
  const last = await JobGiveBack.findOne({ jobId: doc._id, toShop: false, type: { $ne: 'customer_no_show' } }).sort({ createdAt: -1 }).lean();
  const lateAt = providerLateAt(kind, doc);
  return {
    providerChangedAt: last?.createdAt || null,
    providerAbsent: lateAt ? { opensAt: lateAt, open: Date.now() >= lateAt.getTime() } : null,
  };
}

/** What the provider's screen may offer. */
function providerView(kind, doc) {
  const rule = RULES[kind];
  const waitAt = customerWaitAt(kind, doc);
  return {
    canGiveBack: !!rule?.held.includes(doc.status),
    customerAbsent: waitAt ? { opensAt: waitAt, open: Date.now() >= waitAt.getTime() } : null,
  };
}

module.exports = {
  REASONS, RULES, JobGiveBack, preview, giveBack, reportProviderAbsent, reportCustomerAbsent,
  wasHandedBack, customerView, providerView, enteredAt, CUSTOMER_WAIT_MIN, PROVIDER_LATE_MIN,
};
