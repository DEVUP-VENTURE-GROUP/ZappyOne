const { RepairBooking } = require('../../models/booking.model');
const { RepairQuote } = require('../../models/quote.model');
const pricingService = require('../pricing.service');
const eventsService = require('../events.service');
const { httpError } = require('../../../../core/errors');
const { releaseStock } = require('./stock');
const { assertActorMayAct } = require('./lifecycle');

/** Quotes after diagnosis, and the customer's decision on them. */

/**
 * States from which a quote may legitimately be raised — the device is either
 * in front of the technician or already at the workshop. Includes the two quote
 * states themselves so a technician can revise a quote (§31) without first
 * having to move the booking backwards.
 */
const QUOTABLE_STATES = [
  'ARRIVED',
  'DIAGNOSING',
  'AT_WORKSHOP',
  'REPAIR_IN_PROGRESS',
  'QUOTE_PENDING',
  'CUSTOMER_APPROVAL_PENDING',
];

/**
 * Submit a quote after diagnosis. Always a NEW record — quoting twice creates
 * revision 2, it does not overwrite revision 1 (§31).
 */
async function submitQuote({
  bookingId, actorRole, actorId, diagnosisSummary, diagnosisPhotos = [],
  repairCode, qualityCode = null, items = [], warrantyDays = 0,
  estimatedDurationMin = null, idempotencyKey = null,
  isAdditional = false, foundProblemCodes = [], foundNote = '',
}) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');
  assertActorMayAct(booking, actorRole, actorId);

  if (idempotencyKey) {
    const dup = await RepairQuote.findOne({ idempotencyKey }).lean();
    if (dup) return { quote: dup, replayed: true };
  }

  if (!items.length) throw httpError('A quote needs at least one line item', 400, 'EMPTY_QUOTE');

  /**
   * A quote only means something once the device has actually been looked at.
   * Quoting from an earlier state used to silently leave the booking behind —
   * the quote existed but the booking never moved to await approval, so the
   * customer was never asked. Refuse it explicitly instead.
   */
  if (!QUOTABLE_STATES.includes(booking.status)) {
    throw httpError(
      `A quote cannot be raised while the booking is ${booking.status}`,
      409,
      'NOT_QUOTABLE',
      { status: booking.status, quotableFrom: QUOTABLE_STATES },
    );
  }

  const cfg = await pricingService.getConfig(booking.vertical);
  const priced = items.map((i) => ({
    ...i,
    quantity: i.quantity || 1,
    amountPaise: i.amountPaise != null ? i.amountPaise : (i.unitPricePaise || 0) * (i.quantity || 1),
  }));

  const subtotalPaise = priced.reduce((sum, i) => sum + i.amountPaise, 0);
  const taxPaise = Math.round((subtotalPaise * (cfg.taxPct || 0)) / 100);

  /**
   * A fault found mid-repair belongs on the booking, not only on the quote.
   *
   * The booking is the record of what was actually wrong with the device;
   * leaving the discovery in a quote document means the history says the
   * customer reported something we never treated.
   */
  if (isAdditional && foundProblemCodes.length) {
    const merged = new Set([...(booking.problemCodes || []), ...foundProblemCodes]);
    booking.problemCodes = [...merged];
  }

  const prior = await RepairQuote.findOne({ bookingId }).sort({ revision: -1 });

  const quote = await RepairQuote.create({
    bookingId,
    userId: booking.userId,
    shopId: booking.shopId,
    workerId: booking.workerId,
    diagnosisSummary,
    diagnosisPhotos,
    repairCode,
    qualityCode,
    items: priced,
    subtotalPaise,
    taxPaise,
    totalPaise: subtotalPaise + taxPaise,
    warrantyDays,
    estimatedDurationMin,
    status: 'sent',
    revision: prior ? prior.revision + 1 : 1,
    supersedesId: prior ? prior._id : null,
    isAdditional,
    foundProblemCodes,
    foundNote,
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + (cfg.quoteExpiryHours || 48) * 3600 * 1000),
    idempotencyKey,
  });

  // A superseded quote stays readable but can no longer be acted on.
  if (prior && prior.status === 'sent') {
    prior.status = 'superseded';
    prior.supersededAt = new Date();
    await prior.save();
  }

  booking.activeQuoteId = quote._id;

  /**
   * Walk to "awaiting customer approval" through legal intermediate states.
   * A technician quoting from ARRIVED has implicitly diagnosed, so DIAGNOSING
   * is passed through rather than demanded as a separate API call — but it is
   * still RECORDED, so the history shows what actually happened.
   */
  for (const step of ['DIAGNOSING', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING']) {
    if (booking.status === step) continue;
    if (booking.canTransition(step)) {
      booking.applyTransition(step, {
        actorRole: step === 'CUSTOMER_APPROVAL_PENDING' ? 'system' : actorRole,
        actorId: step === 'CUSTOMER_APPROVAL_PENDING' ? null : actorId,
        reason: step === 'QUOTE_PENDING' ? `quote r${quote.revision} submitted` : '',
      });
    }
  }

  if (booking.status !== 'CUSTOMER_APPROVAL_PENDING') {
    // Should be unreachable given QUOTABLE_STATES, but a quote the customer is
    // never asked to approve is worse than a loud failure.
    throw httpError(
      `Quote saved but the booking could not be moved to approval from ${booking.status}`,
      500,
      'QUOTE_TRANSITION_FAILED',
    );
  }

  await booking.save();

  eventsService.announceQuote(booking, quote).catch(() => {});

  return { quote: quote.toObject(), replayed: false };
}

/** Customer decision on a quote. Approval locks the figure permanently. */
async function respondToQuote({ quoteId, userId, decision, reason = '' }) {
  const quote = await RepairQuote.findById(quoteId);
  if (!quote) throw httpError('Quote not found', 404, 'NOT_FOUND');
  if (String(quote.userId) !== String(userId)) throw httpError('You do not have access to this quote', 403, 'FORBIDDEN');
  if (quote.isLocked()) throw httpError('This quote has already been decided', 409, 'QUOTE_LOCKED');
  if (!quote.isActionable()) throw httpError('This quote is no longer valid', 409, 'QUOTE_EXPIRED');

  const booking = await RepairBooking.findById(quote.bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (decision === 'approve') {
    quote.status = 'approved';
    quote.approvedAt = new Date();
    quote.approvedByUserId = userId;
    quote.respondedAt = new Date();
    await quote.save();

    /**
     * If the customer already paid an inspection fee for this visit, credit it
     * against the repair (config-gated). Charging twice for one technician
     * visit is the kind of thing that reads as a scam even when it is not, and
     * it is the reason customers hesitate to book an inspection at all.
     *
     * Only credited when the fee was actually PAID — an unpaid inspection fee
     * is simply superseded by the quote total, not refunded into it.
     */
    const cfg = await pricingService.getConfig(booking.vertical);

    /**
     * Credit the GROSS amount the customer actually paid — fee plus its tax —
     * not the pre-tax fee. Crediting only the net would quietly keep the tax
     * portion of a visit the customer is being billed for again, which is
     * exactly the double-charge this rule exists to prevent.
     *
     * Guarded on `inspection_only` so a normal repair booking's total can never
     * be mistaken for a prepaid inspection and credited against itself.
     */
    const wasInspection = booking.priceSnapshot?.resolutionPath === 'inspection_only';
    const paidForInspection = wasInspection ? (booking.priceSnapshot?.totalPaise || 0) : 0;
    const feeWasPaid = booking.paymentStatus === 'paid';
    const creditPaise = (cfg.inspectionFeeCreditedOnRepair && feeWasPaid)
      ? Math.min(paidForInspection, quote.totalPaise)
      : 0;

    // The approved quote becomes the booking's authoritative price. The original
    // estimate is left intact in history — it is not edited, it is superseded.
    booking.priceSnapshot = {
      ...booking.priceSnapshot,
      subtotalPaise: quote.subtotalPaise,
      taxPaise: quote.taxPaise,
      inspectionCreditPaise: creditPaise,
      totalPaise: Math.max(0, quote.totalPaise - creditPaise),
      warrantyDays: quote.warrantyDays,
      isEstimate: false,
      pricingMode: 'fixed',
      resolutionPath: creditPaise > 0
        ? `quote:r${quote.revision}+inspection_credit`
        : `quote:r${quote.revision}`,
      snapshotAt: new Date(),
    };

    // A credited fee means the earlier payment no longer settles the booking.
    if (creditPaise > 0) booking.paymentStatus = 'unpaid';
    booking.activeQuoteId = quote._id;
    booking.applyTransition('APPROVED', { actorRole: 'customer', actorId: userId, reason: 'quote approved' });
    await booking.save();
    eventsService.announceQuoteDecision(booking, quote, 'approve').catch(() => {});
    return { quote: quote.toObject(), booking: booking.toObject() };
  }

  if (decision === 'clarify') {
    quote.status = 'clarification_requested';
    quote.clarificationNote = reason;
    await quote.save();
    eventsService.announceQuoteDecision(booking, quote, 'clarify').catch(() => {});
    return { quote: quote.toObject(), booking: booking.toObject() };
  }

  quote.status = 'rejected';
  quote.rejectionReason = reason;
  quote.respondedAt = new Date();
  await quote.save();

  if (booking.canTransition('REJECTED')) {
    booking.applyTransition('REJECTED', { actorRole: 'customer', actorId: userId, reason: reason || 'quote rejected' });
    await booking.save();
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId });
  }

  eventsService.announceQuoteDecision(booking, quote, 'reject').catch(() => {});

  return { quote: quote.toObject(), booking: booking.toObject() };
}

module.exports = {
  QUOTABLE_STATES,
  submitQuote,
  respondToQuote,
};
