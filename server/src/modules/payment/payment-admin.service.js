/**
 * What finance and ops do with payments: see them, and resolve the ones that
 * need a human.
 *
 *   needs action  = a captured payment whose side-effects failed (reconciliation)
 *                 + a refund the gateway refused (manual_required)
 *
 * Resolving never edits money silently: a retried refund goes back through the
 * one refund path, and a refund done outside the gateway is recorded with the
 * bank reference so it can be traced.
 */

const mongoose = require('mongoose');
const PaymentIntent = require('./payment-intent.model');
const paymentService = require('./payment.service');
const { httpError } = require('../../core/errors');

const PAGE_SIZE = 30;
const OWNER_MODELS = { user: () => require('../user/user.model'), worker: () => require('../worker/worker.model') };
const BOOKING_REFS = {
  repair: () => require('../repair/models/booking.model').RepairBooking,
  pet: () => require('../pet/models/booking.model').PetBooking,
  helping: () => require('../helping/models/task.model').HelpingTask,
};

/** Names and booking references for a page of intents, in a fixed number of queries. */
async function enrich(intents) {
  const byKind = { user: new Set(), worker: new Set() };
  const byBooking = { repair: new Set(), pet: new Set(), helping: new Set() };
  for (const i of intents) {
    if (i.owner?.kind && byKind[i.owner.kind]) byKind[i.owner.kind].add(String(i.owner.id));
    if (i.bookingSource && i.bookingId) byBooking[i.bookingSource].add(String(i.bookingId));
  }
  const [owners, bookings] = await Promise.all([
    Promise.all(Object.entries(byKind).map(async ([kind, ids]) => (ids.size
      ? OWNER_MODELS[kind]().find({ _id: { $in: [...ids] } }).select('name phone').lean()
      : []))),
    Promise.all(Object.entries(byBooking).map(async ([src, ids]) => (ids.size
      ? BOOKING_REFS[src]().find({ _id: { $in: [...ids] } }).select('reference status').lean()
      : []))),
  ]);
  const ownerMap = new Map(owners.flat().map((o) => [String(o._id), o]));
  const bookingMap = new Map(bookings.flat().map((b) => [String(b._id), b]));
  return intents.map((i) => {
    const owner = ownerMap.get(String(i.owner?.id));
    const booking = i.bookingId ? bookingMap.get(String(i.bookingId)) : null;
    return {
      id: String(i._id),
      cfOrderId: i.cfOrderId,
      cfPaymentId: i.cfPaymentId || null,
      purpose: i.purpose,
      bookingSource: i.bookingSource || null,
      bookingId: i.bookingId ? String(i.bookingId) : null,
      bookingReference: booking?.reference || null,
      owner: { kind: i.owner?.kind, id: String(i.owner?.id || ''), name: owner?.name || null, phone: owner?.phone || null },
      amountPaise: i.amountPaise,
      breakdown: i.breakdown || null,
      status: i.status,
      refund: i.refund?.status && i.refund.status !== 'none' ? i.refund : null,
      needsReconciliation: !!i.reconciliationRequired && !i.reconciledAt,
      reconciliationReason: i.reconciliationReason || null,
      createdAt: i.createdAt,
      appliedAt: i.appliedAt || null,
    };
  });
}

const NEEDS_ACTION = {
  $or: [
    { reconciliationRequired: true, reconciledAt: { $exists: false } },
    { 'refund.status': 'manual_required' },
  ],
};

async function list({ status, purpose, source, needsAction, q, page = 1 }) {
  const filter = {};
  if (status) filter.status = status;
  if (purpose) filter.purpose = purpose;
  if (source) filter.bookingSource = source;
  if (needsAction) Object.assign(filter, NEEDS_ACTION);
  if (q) {
    const term = String(q).trim();
    if (mongoose.isValidObjectId(term)) filter.$or = [{ _id: term }, { bookingId: term }, { 'owner.id': term }];
    else filter.$or = [{ cfOrderId: term }, { cfPaymentId: term }];
  }
  const skip = (Math.max(1, Number(page)) - 1) * PAGE_SIZE;
  const [rows, total] = await Promise.all([
    PaymentIntent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(PAGE_SIZE).lean(),
    PaymentIntent.countDocuments(filter),
  ]);
  return { items: await enrich(rows), total, page: Number(page), pageSize: PAGE_SIZE };
}

/** Headline numbers for the Money page. Captured money is counted net of refunds already processed. */
async function summary({ days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [captured, failed, refunds, needsAction] = await Promise.all([
    PaymentIntent.aggregate([
      { $match: { status: { $in: ['captured', 'refunded'] }, createdAt: { $gte: since } } },
      { $group: { _id: '$purpose', n: { $sum: 1 }, paise: { $sum: '$amountPaise' } } },
    ]),
    PaymentIntent.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
    PaymentIntent.aggregate([
      { $match: { 'refund.status': { $in: ['requested', 'processed', 'manual_required'] }, 'refund.at': { $gte: since } } },
      { $group: { _id: '$refund.status', n: { $sum: 1 }, paise: { $sum: '$refund.amountPaise' } } },
    ]),
    PaymentIntent.countDocuments(NEEDS_ACTION),
  ]);
  const refundBy = Object.fromEntries(refunds.map((r) => [r._id, r]));
  return {
    windowDays: days,
    collectedPaise: captured.reduce((s, r) => s + r.paise, 0),
    collectedCount: captured.reduce((s, r) => s + r.n, 0),
    byPurpose: captured.map((r) => ({ purpose: r._id, count: r.n, paise: r.paise })),
    failedCount: failed,
    refundedPaise: refundBy.processed?.paise || 0,
    refundsInFlight: refundBy.requested?.n || 0,
    refundsManual: refundBy.manual_required?.n || 0,
    needsActionCount: needsAction,
  };
}

async function findByCfOrderId(cfOrderId) {
  if (!/^zpy_[a-z0-9_]{4,60}$/.test(String(cfOrderId))) throw httpError('Invalid payment reference', 400, 'BAD_REFERENCE');
  const intent = await PaymentIntent.findOne({ cfOrderId });
  if (!intent) throw httpError('Payment not found', 404, 'NOT_FOUND');
  return intent;
}

/** Ask the gateway again for a refund it refused earlier. */
async function retryRefund({ cfOrderId }) {
  const intent = await findByCfOrderId(cfOrderId);
  if (intent.refund?.status !== 'manual_required') {
    throw httpError('This payment has no failed refund to retry', 409, 'NO_FAILED_REFUND');
  }
  const out = await paymentService.refundIntent(intent, {
    amountPaise: intent.refund.amountPaise, reason: intent.refund.reason || 'Refund retry', label: 'admin_retry', ref: intent._id,
  });
  if (out.refunded) {
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { reconciledAt: new Date() } });
  }
  return out;
}

/** The money was returned outside the gateway (bank/UPI transfer); record the proof. */
async function markRefundedManually({ cfOrderId, reference, adminId }) {
  const ref = String(reference || '').trim();
  if (ref.length < 6) throw httpError('Enter the bank/UPI transfer reference (UTR)', 400, 'REFERENCE_REQUIRED');
  const intent = await PaymentIntent.findOneAndUpdate(
    { cfOrderId, 'refund.status': 'manual_required' },
    {
      $set: {
        status: 'refunded', 'refund.status': 'processed', 'refund.cfRefundId': `manual:${ref}`,
        reconciledAt: new Date(), reconciledBy: adminId,
      },
      $push: { events: { event: 'refund_manual', payload: { reference: ref, adminId: String(adminId) } } },
    },
    { new: true },
  );
  if (!intent) throw httpError('This payment is not waiting for a manual refund', 409, 'NOT_AWAITING_REFUND');
  if (intent.bookingSource && intent.bookingId) {
    const booking = await BOOKING_REFS[intent.bookingSource]().findById(intent.bookingId);
    if (booking) {
      booking.paymentStatus = intent.refund.amountPaise < intent.amountPaise
        ? (intent.bookingSource === 'repair' ? 'partial_refund' : 'partially_refunded')
        : 'refunded';
      await booking.save();
    }
  }
  return intent;
}

/** A captured payment whose side-effects failed was fixed by hand; close it. */
async function markReconciled({ cfOrderId, adminId, notes = '' }) {
  const intent = await PaymentIntent.findOneAndUpdate(
    { cfOrderId, reconciliationRequired: true, reconciledAt: { $exists: false } },
    { $set: { reconciledAt: new Date(), reconciledBy: adminId }, $push: { events: { event: 'reconciled', payload: { notes, adminId: String(adminId) } } } },
    { new: true },
  );
  if (!intent) throw httpError('Nothing to reconcile on this payment', 409, 'NOT_PENDING');
  return intent;
}

module.exports = { list, summary, retryRefund, markRefundedManually, markReconciled, findByCfOrderId };
