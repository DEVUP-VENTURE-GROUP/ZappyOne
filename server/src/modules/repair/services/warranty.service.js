/**
 * Warranty on a repair, end to end.
 *
 *   set     a shop chooses the warranty it gives per repair (it rides on every
 *           price it has for that repair); an individual gives the ZappyOne
 *           standard warranty with the standard price. The booking freezes the
 *           number at the moment it is made (priceSnapshot.warrantyDays).
 *   shown   the customer sees it before booking and, once the job is done,
 *           until when it runs.
 *   claim   inside that window the customer reports what went wrong. The shop
 *           or technician and ZappyOne ops are told; ops decides (approve,
 *           reject, resolved) and the customer is told each time. One open
 *           claim per booking.
 */
const mongoose = require('mongoose');
const { RepairBooking } = require('../models/booking.model');
const { RepairWarrantyClaim } = require('../models/governance.model');
const { ProviderPricing } = require('../models/pricing.model');
const { httpError } = require('../../../core/errors');

const OPEN = ['submitted', 'under_review', 'approved'];
const send = (...a) => require('../../messaging/send').send(...a).catch(() => {});
const push = (...a) => require('../../jobs/job-events').push(...a).catch(() => {});

function windowOf(booking) {
  const days = booking.priceSnapshot?.warrantyDays || 0;
  if (!days || booking.status !== 'COMPLETED' || !booking.completedAt) return { warrantyDays: days, expiresAt: null, active: false };
  const expiresAt = new Date(new Date(booking.completedAt).getTime() + days * 86400000);
  return { warrantyDays: days, expiresAt, active: expiresAt > new Date() };
}

async function statusFor({ bookingId, userId }) {
  const booking = await RepairBooking.findOne({ _id: bookingId, userId }).select('status completedAt priceSnapshot.warrantyDays').lean();
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');
  const claim = await RepairWarrantyClaim.findOne({ bookingId }).sort({ createdAt: -1 }).lean();
  return { ...windowOf(booking), claim };
}

async function claim({ bookingId, userId, issueDescription, photos = [] }) {
  const booking = await RepairBooking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');
  const w = windowOf(booking);
  if (!w.warrantyDays) throw httpError('This repair did not come with a warranty.', 409, 'NO_WARRANTY');
  if (!w.active) throw httpError(booking.status === 'COMPLETED' ? 'The warranty on this repair has ended.' : 'The warranty starts once the repair is complete.', 409, 'WARRANTY_NOT_ACTIVE');
  if (await RepairWarrantyClaim.exists({ bookingId, status: { $in: OPEN } })) {
    throw httpError('You already have a claim open for this repair. We will update you on it.', 409, 'CLAIM_OPEN');
  }
  const row = await RepairWarrantyClaim.create({
    bookingId, userId, shopId: booking.shopId || null, workerId: booking.workerId || null,
    repairCode: booking.repairCode || 'unknown', issueDescription: String(issueDescription).slice(0, 2000), photos: photos.slice(0, 5),
  });
  const provider = booking.shopId ? { kind: 'shop', id: booking.shopId } : booking.workerId ? { kind: 'worker', id: booking.workerId } : null;
  if (provider) {
    push(provider, {
      title: 'Warranty claim on a repair you did',
      body: `${booking.reference}: "${String(issueDescription).slice(0, 80)}". ZappyOne will be in touch.`,
      deepLink: provider.kind === 'shop' ? '/shop' : '/worker', data: { bookingId: String(bookingId), kind: 'warranty_claim' },
    });
  }
  push({ kind: 'user', id: userId }, {
    title: 'Warranty claim received',
    body: `We have your claim for ${booking.reference}. Our team will reply within a day.`,
    deepLink: `/repair/bookings/${bookingId}`, data: { bookingId: String(bookingId) },
  });
  return row.toObject();
}

/** Ops decides; the customer is told in plain words. */
async function decide({ id, status, note = '', adminId }) {
  if (!['under_review', 'approved', 'rejected', 'resolved'].includes(status)) throw httpError('Unknown decision', 400, 'BAD_STATUS');
  const row = await RepairWarrantyClaim.findByIdAndUpdate(id, {
    $set: { status, reviewedById: adminId || null, reviewedAt: new Date(), reviewNote: String(note || '').slice(0, 500), ...(status === 'resolved' && { resolvedAt: new Date() }), ...(status === 'rejected' && { rejectionReason: String(note || '').slice(0, 500) }) },
  }, { new: true }).lean();
  if (!row) throw httpError('Claim not found', 404, 'NOT_FOUND');
  const copy = {
    under_review: ['We are looking into your claim', note || 'Our team is reviewing it with the provider.'],
    approved: ['Your warranty claim is approved', note || 'We will arrange the fix at no cost to you.'],
    rejected: ['About your warranty claim', note || 'This is not covered by the warranty.'],
    resolved: ['Your warranty claim is resolved', note || 'Thank you for your patience.'],
  }[status];
  push({ kind: 'user', id: row.userId }, { title: copy[0], body: copy[1], deepLink: `/repair/bookings/${row.bookingId}`, data: { bookingId: String(row.bookingId) } });
  return row;
}

/** A shop sets the warranty it gives on a repair: every price it has for that repair carries it. */
async function setShopWarranty({ shopId, vertical, repairCode, warrantyDays }) {
  const r = await ProviderPricing.updateMany(
    { shopId: new mongoose.Types.ObjectId(shopId), vertical, repairCode, supersededAt: null },
    { $set: { warrantyDays } },
  );
  return { updated: r.modifiedCount || 0, repairCode, warrantyDays };
}

module.exports = { statusFor, claim, decide, setShopWarranty, windowOf };
