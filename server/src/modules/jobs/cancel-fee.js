/**
 * What a customer pays to cancel, for every kind that uses the shared fee
 * schedule (repairs and helping; pet care has its own per-service policy).
 *
 * The schedule, the repeat tiers and the harm scores are the first version's
 * (order/shield.service), so one business decision applies everywhere. On top
 * of the schedule, three moments are always free:
 *
 *   - the first cancel in 30 days while we are still finding someone
 *   - the first minutes after a provider accepts (freeCancelWindowSec, the same
 *     window the first version gave), so a mistaken booking is not punished
 *   - any time after a provider handed the job back or did not turn up: that
 *     was not the customer's doing
 *
 * A customer no-show is charged as a cancellation at the door, with none of the
 * free moments.
 */
const shieldService = require('../order/shield.service');
const { enteredAt, RULES } = require('./give-back');

const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

async function feeFor({ kind, doc, userId, stage, noShow = false }) {
  const cfg = await shieldService.getConfig();
  const recent = userId ? await shieldService.countRecentUserCancels(userId) : 0;
  const tier = Math.min(recent, 2);
  const schedule = (s) => (cfg.feeSchedule?.[s] ?? [0, 0, 0])[tier] || 0;
  const base = {
    stage: noShow ? 'arrived' : stage,
    harmScore: cfg.harmScores?.[noShow ? 'arrived' : stage] ?? 0,
    cancelsInPeriod: recent,
  };
  if (noShow) return { ...base, feePaise: schedule('arrived'), isGrace: false, free: null };

  if (await require('./give-back').wasHandedBack(doc._id)) {
    return { ...base, feePaise: 0, isGrace: true, free: 'provider_changed' };
  }
  // Nobody has accepted yet: always free, however often (fees start once someone accepts).
  if (stage === 'searching' || stage === 'created') return { ...base, feePaise: 0, isGrace: true, free: 'not_accepted' };
  if (stage === 'assigned') {
    const { freeCancelWindowSec = 120 } = await require('../order/cancellation.service').getConfig();
    const accepted = enteredAt(doc, RULES[kind]?.accepted || []);
    if (accepted && Date.now() - accepted.getTime() < freeCancelWindowSec * 1000) {
      return { ...base, feePaise: 0, isGrace: true, free: 'just_accepted' };
    }
  }
  return { ...base, feePaise: schedule(stage), isGrace: false, free: null };
}

/** The customer-facing sentence, the same on every surface. */
function messageFor({ feePaise, earnedPaise = 0, refundPaise, paidPaise, free, noun = 'provider' }) {
  if (free === 'provider_changed') return 'No charge: your provider could not make it, so cancelling is free.';
  if (free === 'just_accepted') return 'No charge if you cancel now. After a couple of minutes a fee applies.';
  if (free === 'not_accepted') return `No charge: no ${noun} has accepted yet.`;
  if (free === 'first') return `No charge this time, but please avoid cancelling once a ${noun} is on the way.`;
  const parts = [];
  if (earnedPaise > 0) parts.push(`${rupees(earnedPaise)} for the inspection already done`);
  if (feePaise > 0) parts.push(`a ${rupees(feePaise)} cancellation fee`);
  if (!parts.length) return 'You can cancel this booking free of charge.';
  const owed = parts.join(' and ');
  if (paidPaise > 0) return `We will keep ${owed}, and refund you ${rupees(refundPaise)}.`;
  return `Cancelling now means ${owed}.`;
}

/* Helping */

const HELPING_STAGE = {
  DRAFT: 'created', REQUESTED: 'created', PAYMENT_PENDING: 'created', CONFIRMED: 'searching',
  WORKER_SEARCHING: 'searching', WORKER_ASSIGNED: 'searching', WORKER_DECLINED: 'searching',
  WORKER_ACCEPTED: 'assigned', EN_ROUTE: 'on_the_way', ARRIVED: 'arrived',
};
/** A customer cancels a task themselves only until the helper starts; after that, support decides. */
const HELPING_SELF_CANCELLABLE = Object.keys(HELPING_STAGE);

async function quoteHelping(task, { noShow = false } = {}) {
  if (!HELPING_SELF_CANCELLABLE.includes(task.status)) {
    return {
      allowed: false, reason: 'work_started',
      message: 'Your helper has already started. Contact support and we will sort it out with them.',
    };
  }
  const f = await feeFor({ kind: 'helping', doc: task, userId: task.userId, stage: HELPING_STAGE[task.status], noShow });
  const paidPaise = task.paymentStatus === 'paid' ? (task.charge?.serviceChargePaise || 0) : 0;
  const feePaise = Math.min(f.feePaise, paidPaise || f.feePaise);
  const refundPaise = Math.max(0, paidPaise - feePaise);
  return {
    allowed: true, ...f, feePaise, earnedPaise: 0, paidPaise, refundPaise,
    message: messageFor({ feePaise, refundPaise, paidPaise, free: f.free, noun: 'helper' }),
  };
}

/** Write the fee down once per job; cash fees ride on the customer's record. */
async function record(kind, doc, q) {
  if (q.free === 'provider_changed') return null; // not theirs to count
  const CancellationFeeRecord = require('../order/cancellation-shield.model');
  try {
    const rec = await CancellationFeeRecord.create({
      kind, jobId: doc._id, userId: doc.userId, workerId: doc.workerId || null, shopId: doc.shopId || null,
      cancelledAtStage: q.stage, feePaise: q.feePaise, earnedFeePaise: q.earnedPaise || 0,
      refundedPaise: q.refundPaise || 0, isGrace: q.isGrace, harmScore: q.harmScore, cancelsInPeriod: q.cancelsInPeriod,
      collectionStatus: q.isGrace ? 'grace' : q.feePaise === 0 ? 'zero_fee' : 'pending_next_order',
      warningIssuedAt: q.isGrace ? new Date() : null,
    });
    return await collectNow(rec, { keptFromRefund: q.feePaise > 0 && (q.paidPaise || 0) >= q.feePaise });
  } catch (e) {
    if (e.code !== 11000) require('../../core/logger').error({ err: e.message, id: String(doc._id) }, '[cancel-fee] not recorded');
    return null;
  }
}

/** Refund what is due on an online-paid job; a gateway failure is flagged for ops, never lost. */
async function refund(source, doc, amountPaise, reason) {
  if (amountPaise > 0) {
    await require('../payment/payment.service').refundBookingPayment({ source, bookingId: doc._id, amountPaise, reason });
  }
}

/** The customer cancels a helping task: priced first, then cancelled, then recorded and refunded. */
async function cancelHelping({ task, byRole, actorId, reason = '', noShow = false }) {
  const asCustomer = byRole === 'user' || noShow;
  const q = asCustomer ? await quoteHelping(task, { noShow }) : null;
  if (q && !q.allowed) throw Object.assign(new Error(q.message), { status: 409, code: 'NOT_CANCELLABLE' });

  const money = require('../helping/services/money.service');
  task.cancellationReason = reason || '';
  task.transitionTo('CANCELLED', { by: actorId, byRole: noShow ? 'worker' : byRole, note: reason });
  // Nothing is bought before the helper starts, so a held item budget goes back whole.
  await money.releaseHold(task, { amountPaise: money.unspentHoldPaise(task), why: 'Task cancelled, budget returned' });
  await task.save();

  const paid = task.paymentStatus === 'paid' ? (task.charge?.serviceChargePaise || 0) : 0;
  if (q) {
    await record('helping', task, q);
    await refund('helping', task, q.refundPaise, `Cancelled: ${reason || 'by customer'}`);
  } else {
    // Ops cancelling is never the customer's cost: everything paid comes back.
    if (paid > 0) {
      await require('../payment/payment.service').refundBookingPayment({ source: 'helping', bookingId: task._id, reason: `Cancelled: ${reason || byRole}` });
    }
  }
  return q || { feePaise: 0, refundPaise: paid, message: 'Cancelled. You will not be charged.' };
}

/** The provider reports the customer absent: the job closes as the customer's cancellation at the door. */
async function cancelForNoShow({ kind, doc, actor, reason }) {
  if (kind === 'helping') {
    const out = await cancelHelping({ task: doc, byRole: 'user', actorId: actor.id, reason, noShow: true });
    return { feePaise: out.feePaise };
  }
  if (kind === 'repair') {
    const cancellation = require('../repair/services/cancellation.service');
    const before = doc.toObject();
    const q = await cancellation.quoteCancellation(before, { userId: before.userId, noShow: true });
    await require('../repair/services/booking.service').transition(doc._id, 'CANCELLED', { actorRole: actor.kind, actorId: actor.id, reason });
    const s = await cancellation.assess(before, { userId: before.userId, quote: q });
    if (before.paymentStatus === 'paid') await refund('repair', before, s.refundPaise, `Cancelled: ${reason}`);
    return { feePaise: s.feePaise || 0 };
  }
  if (kind === 'pet') {
    // Pet care's own policy, at its no-show tier.
    const out = await require('../pet/services/booking.service').cancelBooking({ bookingId: doc._id, actorId: doc.userId, by: 'customer', reason, noShow: true });
    return { feePaise: out.penaltyPaise || 0 };
  }
  throw Object.assign(new Error('Not supported for this booking'), { status: 400 });
}

/*
 * Getting the fee in, and into the Worker Shield Fund (order/shield.service).
 *
 *   paid online      kept out of the refund          → collected now
 *   wallet balance   taken from the customer wallet   → collected now
 *   otherwise        rides on their next booking as its own line, paid with
 *                    it in cash or online, and collected when that job settles
 *
 * Collected fees go into this week's fund and the provider who lost the trip
 * gets a harm entry; the Monday run pays providers their share of the pool
 * (Economics → Cancellations). A fee left unpaid for FEE_WRITE_OFF_DAYS is
 * written off rather than chased forever.
 */
const FEE_WRITE_OFF_DAYS = 60;
const shield = () => require('../order/shield.service');
const Records = () => require('../order/cancellation-shield.model');
const DEAD = ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REJECTED'];

/** Collect a just-recorded fee if we can; otherwise it waits for the next booking. */
async function collectNow(rec, { keptFromRefund = false } = {}) {
  if (!rec || rec.feePaise <= 0 || rec.collectionStatus !== 'pending_next_order') return rec;
  let status = null;
  if (keptFromRefund) status = 'collected_refund';
  else {
    try {
      const Transaction = require('../payment/transaction.model');
      await require('../wallet/wallet.service').apply({
        kind: 'user', id: rec.userId, type: 'debit', amountPaise: rec.feePaise,
        reason: Transaction.REASONS.CANCELLATION_FEE, idempotencyKey: `cancelfee:wallet:${rec._id}`,
        description: 'Cancellation fee, paid from your wallet',
      });
      status = 'collected_wallet';
    } catch { /* no balance: it rides on the next booking */ }
  }
  if (!status) return rec;
  await Records().updateOne({ _id: rec._id }, { $set: { collectionStatus: status, collectedAt: new Date() } });
  await shield().addToFund(rec._id, rec.feePaise, rec.workerId, rec.harmScore);
  return { ...(rec.toObject?.() || rec), collectionStatus: status };
}

const modelOf = (kind) => require('./kinds').KINDS[kind]?.model();

/** Fees this customer still owes, tidied first: too old → written off; riding on a cancelled job → back to waiting. */
async function pendingFor(userId) {
  const R = Records();
  const cutoff = new Date(Date.now() - FEE_WRITE_OFF_DAYS * 86400000);
  await R.updateMany({ userId, collectionStatus: 'pending_next_order', createdAt: { $lt: cutoff } }, { $set: { collectionStatus: 'written_off' } });
  const riding = await R.find({ userId, collectionStatus: 'on_next_booking' }).select('carriedOnJobId').lean();
  for (const r of riding) {
    const found = r.carriedOnJobId ? await require('./kinds').findJob(r.carriedOnJobId, 'status') : null;
    if (!found || DEAD.includes(found.doc.status)) {
      await R.updateOne({ _id: r._id, collectionStatus: 'on_next_booking' }, { $set: { collectionStatus: 'pending_next_order', carriedOnJobId: null } });
    }
  }
  // Fees from the retired order flow stay with it.
  const records = await R.find({ userId, collectionStatus: 'pending_next_order', kind: { $ne: 'order' } }).sort({ createdAt: 1 }).lean();
  return { totalPaise: records.reduce((t, r) => t + r.feePaise, 0), records };
}

/** Put what the customer still owes on a booking they just made. Each fee rides on one booking only. */
async function attachCarried(kind, jobId, userId) {
  try {
    const { records } = await pendingFor(userId);
    const claimed = [];
    for (const r of records) {
      const ok = await Records().updateOne(
        { _id: r._id, collectionStatus: 'pending_next_order' },
        { $set: { collectionStatus: 'on_next_booking', carriedOnJobId: jobId } },
      );
      if (ok.modifiedCount) claimed.push(r);
    }
    if (!claimed.length) return null;
    const carried = { paise: claimed.reduce((t, r) => t + r.feePaise, 0), recordIds: claimed.map((r) => r._id), from: claimed[0].createdAt, settledAt: null };
    await modelOf(kind).updateOne({ _id: jobId }, { $set: { carriedFee: carried } });
    return carried;
  } catch (e) {
    require('../../core/logger').warn({ err: e.message, jobId: String(jobId) }, '[cancel-fee] could not carry fees onto booking');
    return null;
  }
}

/** The earlier fee riding on this booking, in paise. */
const carriedPaise = (doc) => (doc?.carriedFee?.paise > 0 ? doc.carriedFee.paise : 0);

/**
 * The booking carrying a fee was settled: the fee was paid with it. On a cash
 * job the provider holds it, so it comes off their wallet like commission; it
 * then goes into the shield fund. Idempotent per booking.
 */
async function settleCarried(kind, bookingId) {
  const Model = modelOf(kind);
  if (!Model) return null;
  const doc = await Model.findOneAndUpdate(
    { _id: bookingId, 'carriedFee.paise': { $gt: 0 }, 'carriedFee.settledAt': null },
    { $set: { 'carriedFee.settledAt': new Date() } },
    { new: true },
  ).lean();
  if (!doc) return null;
  const paise = doc.carriedFee.paise;
  if (doc.paymentMethod === 'cash' && doc.workerId && !doc.shopId) {
    const Transaction = require('../payment/transaction.model');
    await require('../wallet/wallet.service').apply({
      kind: 'worker', id: doc.workerId, type: 'debit', amountPaise: paise, allowDebt: true,
      reason: Transaction.REASONS.CANCELLATION_FEE, idempotencyKey: `cancelfee:carried:${kind}:${doc._id}`,
      description: `A customer's earlier cancellation fee, collected by you in cash on ${doc.reference || 'a job'}`,
    }).catch((e) => require('../../core/logger').error({ err: e.message }, '[cancel-fee] carried fee not taken from wallet'));
    require('../worker/worker-dues.service').notifyIfCrossed(doc.workerId);
  }
  if (doc.paymentMethod === 'cash' && doc.shopId) {
    // Shops have no wallet rail yet: booked as owed by the shop, like their commission.
    const Transaction = require('../payment/transaction.model');
    await Transaction.create({
      type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -paise,
      reason: Transaction.REASONS.CANCELLATION_FEE, idempotencyKey: `cancelfee:carried_shop:${kind}:${doc._id}`,
      description: `Earlier cancellation fee collected in cash by the shop on ${doc.reference || 'a job'}`,
      metadata: { shopId: String(doc.shopId), bookingId: String(doc._id), cash: true }, status: 'succeeded',
    }).catch((e) => { if (e.code !== 11000) throw e; });
  }
  for (const id of doc.carriedFee.recordIds || []) {
    const rec = await Records().findOneAndUpdate(
      { _id: id, collectionStatus: 'on_next_booking' },
      { $set: { collectionStatus: 'collected_next_order', collectedAt: new Date() } },
      { new: true },
    ).lean();
    if (rec) await shield().addToFund(rec._id, rec.feePaise, rec.workerId, rec.harmScore);
  }
  return paise;
}

module.exports = {
  feeFor, messageFor, quoteHelping, cancelHelping, cancelForNoShow, record, HELPING_STAGE, HELPING_SELF_CANCELLABLE,
  collectNow, pendingFor, attachCarried, carriedPaise, settleCarried, FEE_WRITE_OFF_DAYS,
};

