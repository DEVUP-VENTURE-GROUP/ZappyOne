const { Repair } = require('../models/repair.model');
const { RepairBooking, CANCELLABLE_FROM } = require('../models/booking.model');
const s3Service = require('../../../core/storage/s3');
const { RepairQuote } = require('../models/quote.model');
const { DeviceInspection, QAInspection } = require('../models/custody.model');
const { providerCard } = require('../../worker/provider-card');
const { QAChecklist } = require('../models/config.model');
const bookingService = require('../services/booking.service');
const cancellationService = require('../services/cancellation.service');
const handoverService = require('../services/handover.service');
const ratingService = require('../services/rating.service');
const reportService = require('../services/report.service');

/**
 * A repair booking after it is placed: status changes, cancellation, cash,
 * handover codes, quotes, custody, QA, photos and rating.
 */

/* Bookings */

async function createBooking(req, res, next) {
  try {
    const { booking, replayed } = await bookingService.createBooking({
      ...req.body,
      userId: req.auth.sub,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey || null,
    });
    res.status(replayed ? 200 : 201).json({ booking, replayed });
  } catch (err) { next(err); }
}

async function listMyBookings(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;
    const filter = { userId: req.auth.sub };
    if (req.query.status) filter.status = req.query.status;

    const [bookings, total] = await Promise.all([
      RepairBooking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      RepairBooking.countDocuments(filter),
    ]);
    res.json({ bookings, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

/**
 * The service report — what was found and what was done (§26).
 *
 * Same object-level authorisation as the booking itself: a report carries
 * photos of the inside of someone's home and their address, so it is never
 * readable by anyone but the customer, the provider who did the work, and
 * admin.
 *
 * Only for finished work. A report on a job still in progress would show a
 * half-filled checklist as though it were the final result.
 */
async function getBookingReport(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('userId workerId shopId status').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const role = req.auth.role;
    const id = String(req.auth.sub);
    const allowed =
      role === 'admin' ||
      (role === 'user' && String(booking.userId) === id) ||
      (role === 'worker' && String(booking.workerId || '') === id) ||
      (role === 'shop' && String(booking.shopId || '') === id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this booking' });

    if (booking.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'The report is available once the job is complete',
        code: 'REPORT_NOT_READY',
      });
    }

    const data = await reportService.getReportData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Booking not found' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="report-${data.booking.reference}.html"`);
    res.send(reportService.renderHtml(data));
  } catch (err) { next(err); }
}

async function getBooking(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Object-level authorisation — never rely on the client not asking (§37).
    const role = req.auth.role;
    const id = String(req.auth.sub);
    const allowed =
      role === 'admin' ||
      (role === 'user' && String(booking.userId) === id) ||
      (role === 'worker' && String(booking.workerId || '') === id) ||
      (role === 'shop' && String(booking.shopId || '') === id);
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this booking' });

    /**
     * Completion photos are stored as S3 KEYS and the bucket is private, so a
     * key in an `<img src>` loads nothing at all. That is why the customer saw
     * no photos and read it as the upload failing — the upload was fine, the
     * URLs were simply never signed on the way out.
     */
    booking.completionPhotos = await s3Service.signMediaList(booking.completionPhotos);

    const quotes = await RepairQuote.find({ bookingId: booking._id }).sort({ revision: -1 }).lean();

    /**
     * Who is coming, for the person waiting at the door.
     *
     * The tracking screen had a status, a price and an address, and no way to
     * answer the customer's actual first question — who is this, and can I call
     * them? Only the fields a customer legitimately needs are sent: a name, a
     * rating, and a number to ring. Never the provider's own address or id.
     *
     * Withheld until the job is accepted: before that the assignment can still
     * move, and naming someone who never turns up is worse than naming nobody.
     */
    const introduced = !['PENDING', 'CONFIRMED', 'PROVIDER_ASSIGNED'].includes(booking.status);
    const provider = introduced ? await providerCard(booking, { fallbackName: 'Your technician' }) : null;

    /**
     * Whether this booking can still be cancelled — decided HERE.
     *
     * The tracking screen kept its own list of cancellable statuses and the two
     * drifted: the client's was missing DIAGNOSING, QUOTE_PENDING and
     * PICKUP_SCHEDULED. A customer whose device pickup was scheduled had no
     * cancel button at all, while the server would have accepted it perfectly
     * well — they simply had no way to ask.
     *
     * A permission is the server's to state, never the client's to guess.
     */
    res.json({
      booking,
      quotes,
      provider,
      canCancel: CANCELLABLE_FROM.includes(booking.status),
    });
  } catch (err) { next(err); }
}

/** Role is derived from the token, never from the request body. */
function actorFrom(req) {
  const map = { user: 'customer', worker: 'worker', shop: 'shop', admin: 'admin' };
  return { actorRole: map[req.auth.role] || 'customer', actorId: req.auth.sub };
}

async function transitionBooking(req, res, next) {
  try {
    const booking = await bookingService.transition(req.params.id, req.body.status, {
      ...actorFrom(req),
      reason: req.body.reason || '',
      meta: req.body.meta || null,
    });
    res.json({ booking });
  } catch (err) { next(err); }
}

/**
 * "I've taken the cash."
 *
 * Provider-only: the customer does not get to mark their own booking paid, and
 * an online booking is settled by the gateway, never by a button.
 */
async function collectCash(req, res, next) {
  try {
    const { role, sub } = req.auth;
    const result = await bookingService.collectCash({
      bookingId: req.params.id,
      actorRole: role,
      actorId: sub,
    });

    res.json({
      booking: result.booking,
      alreadyPaid: result.alreadyPaid,
      collectedPaise: result.collectedPaise ?? result.booking.priceSnapshot?.totalPaise ?? 0,
    });
  } catch (err) { next(err); }
}

/** Shop owner hands the job to one of their own technicians. */
async function assignWorker(req, res, next) {
  try {
    const result = await bookingService.assignWorker({
      bookingId: req.params.id,
      shopId: req.auth.sub,
      workerId: req.body.workerId,
    });
    res.json({ booking: result.booking, worker: result.worker });
  } catch (err) { next(err); }
}

async function declineBooking(req, res, next) {
  try {
    const booking = await bookingService.declineBooking({
      bookingId: req.params.id,
      actorRole: req.auth.role,
      actorId: req.auth.sub,
      reason: req.body?.reason || '',
    });
    res.json({ booking });
  } catch (err) { next(err); }
}

/**
 * What would cancelling cost? Asked before the customer commits.
 *
 * A fee discovered after the fact is a support ticket. Shown on the confirm
 * dialog, it is an informed choice — and most people simply do not cancel on a
 * technician who is already outside.
 */
/**
 * Find a booking the caller is entitled to act on.
 *
 * Only a CUSTOMER is restricted to their own bookings. The cancel route is open
 * to every authenticated role because a shop, a technician or an admin can all
 * legitimately cancel a job — scoping the lookup to `userId` for all of them
 * turned a provider's cancel button into a 404 on a booking sitting right in
 * front of them.
 */
async function findCancellableBooking(req) {
  const filter = req.auth.role === 'user'
    ? { _id: req.params.id, userId: req.auth.sub }
    : { _id: req.params.id };
  return RepairBooking.findOne(filter).lean();
}

async function previewCancellation(req, res, next) {
  try {
    const booking = await findCancellableBooking(req);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const quote = await cancellationService.quoteCancellation(booking, { userId: booking.userId });
    res.json(quote);
  } catch (err) { next(err); }
}

async function cancelBooking(req, res, next) {
  try {
    const before = await findCancellableBooking(req);
    if (!before) return res.status(404).json({ error: 'Booking not found' });

    /**
     * Priced against the status BEFORE cancelling — afterwards everything looks
     * like 'created' and every cancellation would come out free.
     *
     * The fee is always assessed against the BOOKING'S customer, never against
     * whoever pressed the button: a shop cancelling its own job must not land a
     * penalty on the shop's account, nor count towards its cancellation tier.
     */
    const quote = await cancellationService.quoteCancellation(before, { userId: before.userId });
    if (!quote.allowed) {
      return res.status(409).json({ error: quote.message, code: quote.reason.toUpperCase() });
    }

    /**
     * A PROVIDER backing out is a supply failure, not the end of the job.
     *
     * The customer still wants their device fixed and has done nothing wrong,
     * so before killing the booking we try to hand it to somebody else — the
     * same thing that happens when a provider declines the offer, and what the
     * SLA watchdog does when nobody answers at all.
     *
     * Only while the job is still reassignable: once the device has been
     * collected or opened, there is nothing to hand over and this really is a
     * cancellation.
     */
    const providerBackingOut = ['shop', 'worker'].includes(req.auth.role);
    if (providerBackingOut && bookingService.canReleaseToPool(before)) {
      const result = await bookingService.releaseToPool({
        bookingId: req.params.id,
        ...actorFrom(req),
        reason: req.body.reason || 'Provider cancelled',
      });

      if (result.released) {
        return res.json({
          booking: result.booking,
          reassigned: true,
          reoffered: result.reoffered,
          // No fee either way: the customer did not cancel, and the provider is
          // penalised through their decline record, not the customer's bill.
          cancellation: {
            feePaise: 0, earnedPaise: 0, refundPaise: 0, isGrace: true,
            message: result.reoffered
              ? 'Job released — we are finding another provider.'
              : 'Job released. We are still looking for another provider.',
          },
        });
      }
    }

    const booking = await bookingService.transition(req.params.id, 'CANCELLED', {
      ...actorFrom(req),
      reason: req.body.reason || 'Cancelled by customer',
    });

    /**
     * Assessed AFTER the cancellation succeeds, and never allowed to fail it.
     * The customer asked to cancel; a bookkeeping error must not leave them
     * stuck with a booking they have already walked away from.
     */
    /**
     * A provider or admin cancelling is NOT the customer's doing, so no fee is
     * recorded against them — that would charge someone for a cancellation they
     * did not ask for. Only a customer-initiated cancellation is assessed.
     */
    // Not the customer's doing → whatever they paid online comes back in full.
    const paidOnline = before.paymentStatus === 'paid' ? (before.priceSnapshot?.totalPaise || 0) : 0;
    const settlement = req.auth.role === 'user'
      ? await cancellationService.assess(before, { userId: before.userId, quote })
      : { feePaise: 0, earnedPaise: 0, refundPaise: paidOnline, isGrace: false, message: 'Cancelled.' };

    if (paidOnline > 0 && settlement.refundPaise > 0) {
      await require('../../payment/payment.service').refundBookingPayment({
        source: 'repair', bookingId: before._id, amountPaise: settlement.refundPaise,
        reason: `Cancelled: ${req.body.reason || req.auth.role}`,
      });
    }

    res.json({
      booking,
      cancellation: {
        feePaise: settlement.feePaise,
        earnedPaise: settlement.earnedPaise,
        refundPaise: settlement.refundPaise,
        isGrace: settlement.isGrace,
        message: settlement.message,
      },
    });
  } catch (err) { next(err); }
}

/* Proof and feedback */

/**
 * Photographs of the finished work, attached before the job closes.
 *
 * Evidence for both sides: the customer sees what was done to a device they
 * could not watch being opened, and the technician has something to point at
 * if the work is questioned a week later.
 */
async function attachCompletionPhotos(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('shopId workerId status').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const mine = String(booking.workerId || '') === String(req.auth.sub)
      || String(booking.shopId || '') === String(req.auth.sub);
    if (!mine && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'This is not your job' });
    }

    await RepairBooking.updateOne(
      { _id: req.params.id },
      { $set: { completionPhotos: req.body.photos } },
    );
    res.json({ ok: true, count: req.body.photos.length });
  } catch (err) { next(err); }
}

/**
 * The customer rates the finished repair. Once.
 *
 * A rating that can be rewritten is not a rating — it is a negotiating
 * position, and a technician who can ask for a revision will. `ratedAt` is the
 * lock, checked here rather than trusted from the client.
 */
async function rateRepair(req, res, next) {
  try {
    const booking = await RepairBooking.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('status ratedAt workerId shopId').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status !== 'COMPLETED') {
      return res.status(409).json({
        error: 'You can rate this once the repair is finished',
        code: 'NOT_COMPLETED',
      });
    }
    if (booking.ratedAt) {
      return res.status(409).json({ error: 'You have already rated this repair', code: 'ALREADY_RATED' });
    }

    await RepairBooking.updateOne(
      { _id: req.params.id, ratedAt: null },
      { $set: { rating: req.body.rating, ratingComment: req.body.comment || '', ratedAt: new Date() } },
    );

    // Feed the provider's running average, the same figure matching ranks on.
    await ratingService.applyRepairRating({
      workerId: booking.workerId,
      shopId: booking.shopId,
      rating: req.body.rating,
    }).catch(() => { /* the customer's rating is recorded either way */ });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/* Handover codes */

/**
 * The customer reads their own code.
 *
 * Only the booking's owner, and only the code for the step actually due — a
 * customer has no reason to hold the return code while their device is still
 * being collected, and a leaked full set would defeat the point.
 */
async function myHandoverCode(req, res, next) {
  try {
    const booking = await RepairBooking.findOne({ _id: req.params.id, userId: req.auth.sub })
      .select('+otp.start +otp.handover +otp.return')
      .lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Whichever step is next for this mode, if any.
    const due = ['start', 'handover', 'return']
      .find((kind) => booking.otp?.[kind] && !booking.otpVerified?.[`${kind}At`]);

    if (!due) return res.json({ code: null, kind: null });

    res.json({
      kind: due,
      code: booking.otp[due],
      label: handoverService.LABEL[due],
    });
  } catch (err) { next(err); }
}

/** The technician types what the customer reads out. */
async function verifyHandoverCode(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).select('shopId workerId').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const mine = String(booking.workerId || '') === String(req.auth.sub)
      || String(booking.shopId || '') === String(req.auth.sub);
    if (!mine && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'This is not your job' });
    }

    const result = await handoverService.verify({
      bookingId: req.params.id,
      kind: req.body.kind,
      code: req.body.code,
      actorRole: req.auth.role,
      actorId: req.auth.sub,
    });
    res.json(result);
  } catch (err) { next(err); }
}

/* Quotes */

async function submitQuote(req, res, next) {
  try {
    const { quote, replayed } = await bookingService.submitQuote({
      bookingId: req.params.id,
      ...actorFrom(req),
      ...req.body,
      idempotencyKey: req.get('Idempotency-Key') || null,
    });
    res.status(replayed ? 200 : 201).json({ quote, replayed });
  } catch (err) { next(err); }
}

async function respondToQuote(req, res, next) {
  try {
    const result = await bookingService.respondToQuote({
      quoteId: req.params.quoteId,
      userId: req.auth.sub,
      decision: req.body.decision,
      reason: req.body.reason || '',
    });
    res.json(result);
  } catch (err) { next(err); }
}

/* Device custody + QA */

async function createInspection(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    bookingService.assertActorMayAct(booking, actorFrom(req).actorRole, req.auth.sub);

    const inspection = await DeviceInspection.create({
      bookingId: booking._id,
      ...req.body,
      performedByWorkerId: req.auth.role === 'worker' ? req.auth.sub : null,
    });
    res.status(201).json({ inspection });
  } catch (err) { next(err); }
}

async function getQAChecklist(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const repair = booking.repairCode
      ? await Repair.findOne({ code: booking.repairCode, vertical: booking.vertical }).lean()
      : null;
    const codes = repair?.qaChecklistCodes || [];
    const checklist = codes.length
      ? await QAChecklist.findOne({ code: { $in: codes }, vertical: booking.vertical, isActive: true }).lean()
      : null;

    res.json({ checklist });
  } catch (err) { next(err); }
}

async function submitQA(req, res, next) {
  try {
    const booking = await RepairBooking.findById(req.params.id).lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    bookingService.assertActorMayAct(booking, actorFrom(req).actorRole, req.auth.sub);

    const qa = await QAInspection.create({
      bookingId: booking._id,
      stage: req.body.stage || 'after',
      checklistCode: req.body.checklistCode || '',
      results: req.body.results || [],
      photos: req.body.photos || [],
      notes: req.body.notes || '',
      performedByWorkerId: req.auth.role === 'worker' ? req.auth.sub : null,
    });

    res.status(201).json({
      qa,
      passed: qa.passed,
      // Tell the worker plainly why completion is still blocked.
      blockingCompletion: !qa.passed && qa.stage === 'after',
    });
  } catch (err) { next(err); }
}

module.exports = {
  createBooking,
  listMyBookings,
  getBookingReport,
  getBooking,
  transitionBooking,
  collectCash,
  assignWorker,
  declineBooking,
  previewCancellation,
  cancelBooking,
  attachCompletionPhotos,
  rateRepair,
  myHandoverCode,
  verifyHandoverCode,
  submitQuote,
  respondToQuote,
  createInspection,
  getQAChecklist,
  submitQA,
};
