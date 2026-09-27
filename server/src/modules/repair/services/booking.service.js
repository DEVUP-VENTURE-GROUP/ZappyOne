const crypto = require('crypto');
const mongoose = require('mongoose');

const { RepairBooking } = require('../models/booking.model');
const { RepairQuote } = require('../models/quote.model');
const { Repair } = require('../models/repair.model');
const { Problem, ProblemCategory } = require('../models/problem.model');
const { ProviderInventory } = require('../models/inventory.model');
const { QAInspection } = require('../models/custody.model');
const { QAChecklist } = require('../models/config.model');
const { DeviceConfiguration } = require('../models/catalog.model');
const pricingService = require('./pricing.service');
const matchingService = require('./matching.service');
const eventsService = require('./events.service');
const slaService = require('./sla.service');
const handoverService = require('./handover.service');
const settlementService = require('./settlement.service');

/**
 * Booking lifecycle: creation, transitions, quoting, completion.
 *
 * Three hard rules are enforced here rather than in controllers, so they hold
 * no matter which surface calls in (customer app, worker app, admin panel):
 *
 *   §46 IDEMPOTENCY — a repeated create/approve must not produce a second
 *       booking or a second approved quote. Enforced by a unique index on
 *       `idempotencyKey`, caught as a duplicate-key error and turned back into
 *       the original record rather than an error the client has to interpret.
 *
 *   §45 CONCURRENCY — stock is reserved with an atomic conditional update, so
 *       two customers racing for the last screen cannot both win. The update
 *       matches on available quantity, so it either reserves or it does not.
 *
 *   §31 PRICE INTEGRITY — an approved quote is never edited. Extra work creates
 *       a new revision that the customer must approve separately.
 */

const DUPLICATE_KEY = 11000;

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

function newReference() {
  // Short, unambiguous, safe to read out over a phone call.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `ZR${out}`;
}

function httpError(message, status, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

/**
 * Reserve one unit atomically. The filter itself asserts availability, so the
 * check and the write cannot drift apart under concurrency.
 */
async function reserveStock({ shopId, workerId, partId, session = null }) {
  if (!partId) return { reserved: false, needed: false };
  const owner = shopId ? { shopId } : { workerId };

  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, $expr: { $gt: [{ $subtract: ['$quantity', '$reserved'] }, 0] } },
    { $inc: { reserved: 1 } },
    { new: true, ...(session ? { session } : {}) },
  );

  if (!res) return { reserved: false, needed: true };
  // Keep the derived status honest after a raw $inc.
  res.recomputeStatus();
  await res.save({ ...(session ? { session } : {}) });
  return { reserved: true, needed: true, inventoryId: res._id };
}

/** Release a reservation that never became a completed job. */
async function releaseStock({ shopId, workerId, partId }) {
  if (!partId) return;
  const owner = shopId ? { shopId } : { workerId };
  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, reserved: { $gt: 0 } },
    { $inc: { reserved: -1 } },
    { new: true },
  );
  if (res) { res.recomputeStatus(); await res.save(); }
}

/** Consume a reservation on completion — stock leaves the shelf for good. */
async function consumeStock({ shopId, workerId, partId }) {
  if (!partId) return;
  const owner = shopId ? { shopId } : { workerId };
  const res = await ProviderInventory.findOneAndUpdate(
    { ...owner, partId, quantity: { $gt: 0 }, reserved: { $gt: 0 } },
    { $inc: { quantity: -1, reserved: -1 } },
    { new: true },
  );
  if (res) { res.recomputeStatus(); await res.save(); }
}

/**
 * Create a booking with a frozen price snapshot.
 *
 * The snapshot is built here, once, from whatever the resolver returns at this
 * instant — never recomputed later. That is the §22 guarantee.
 */
async function createBooking({
  userId,
  vertical = 'mobile',
  brandCode,
  modelCode,
  modelId = null,
  variantLabel = '',
  fuelType = '',
  configurationCode = null,
  problemCodes = [],
  diagnosticFlowCode = null,
  diagnosticAnswers = null,
  diagnosisSummary = '',
  repairCode = null,
  qualityCode = null,
  addOnCodes = [],
  serviceMode = 'doorstep',
  shopId = null,
  workerId = null,
  zappyRecommended = false,
  location,
  scheduledAt = null,
  slotLabel = '',
  discountPaise = 0,
  paymentMethod = 'cash',
  idempotencyKey = null,
}) {
  if (!location?.coordinates?.length || !location.address) {
    throw httpError('A pickup location with coordinates and an address is required', 400, 'LOCATION_REQUIRED');
  }

  // Replay protection before any work is done.
  if (idempotencyKey) {
    const existing = await RepairBooking.findOne({ idempotencyKey }).lean();
    if (existing) return { booking: existing, replayed: true };
  }

  const repair = repairCode
    ? await Repair.findOne({ code: repairCode, vertical, isActive: true }).lean()
    : null;
  if (repairCode && !repair) throw httpError('Unknown repair', 400, 'UNKNOWN_REPAIR');

  /**
   * A configuration must belong to the model being booked.
   *
   * Taking the pair on trust would let a booking claim a touch panel on a
   * machine that never shipped with one — exactly the mis-order this catalog
   * layer exists to prevent, so the pairing is checked rather than assumed.
   */
  let configuration = null;
  if (configurationCode) {
    configuration = await DeviceConfiguration.findOne({
      code: String(configurationCode).toLowerCase(),
      modelCode: String(modelCode).toLowerCase(),
      isActive: true,
      isArchived: false,
    }).lean();
    if (!configuration) {
      throw httpError('That configuration does not belong to this model', 400, 'UNKNOWN_CONFIGURATION');
    }
  }

  // A symptom flagged as diagnosis-only overrides any repair the client sent —
  // the client does not get to decide that a water-damaged phone is a battery job.
  const problems = problemCodes.length
    ? await Problem.find({ code: { $in: problemCodes }, vertical }).lean()
    : [];
  if (problems.length) {
    const live = await ProblemCategory.find({
      vertical, code: { $in: [...new Set(problems.map((p) => p.categoryCode))] }, isActive: true, isArchived: false,
    }).distinct('code');
    const hidden = problems.find((p) => !p.isActive || p.isArchived || !live.includes(p.categoryCode));
    if (hidden) throw httpError(`"${hidden.name}" is not offered right now`, 400, 'PROBLEM_UNAVAILABLE');
  }
  const problemForcesDiagnosis = problems.some((p) => p.requiresDiagnosis);
  const needsDiagnosis = problemForcesDiagnosis || !repair || repair.pricingMode === 'diagnosis_required';

  /**
   * `diagnosis_only` is an inspection booking, not a way of performing the
   * repair — so it is always permitted regardless of which modes the repair
   * itself supports. Every other mode must be one the repair allows.
   */
  const isInspectionOnly = serviceMode === 'diagnosis_only';
  /**
   * Online payment is refused unless a gateway is actually configured.
   *
   * The flag existed on RepairConfig but nothing read it, so a client could ask
   * for `online` and get a booking the platform has no means of charging —
   * completed work, no money, and no error anywhere to explain it. Cash is
   * always available, so this is a hard refusal rather than a silent downgrade:
   * quietly changing how someone pays is its own kind of wrong.
   */
  if (paymentMethod === 'online') {
    const payCfg = await pricingService.getConfig(vertical);
    if (!payCfg?.onlinePaymentsEnabled) {
      const err = new Error('Online payment is not available yet — this booking can be paid in cash.');
      err.status = 400;
      err.code = 'ONLINE_PAYMENTS_DISABLED';
      throw err;
    }
  }

  if (repair && !isInspectionOnly && !repair.allowedServiceModes.includes(serviceMode)) {
    throw httpError('This repair is not available in that service mode', 400, 'SERVICE_MODE_NOT_ALLOWED');
  }

  const ctx = {
    repairCode: repairCode || null,
    brandCode,
    modelCode,
    qualityCode,
    serviceMode,
    cityCode: location.cityCode || null,
  };

  const referencePrice = repairCode ? await pricingService.resolveReferencePrice(ctx) : null;

  /**
   * The chosen provider's own price, wherever they have one.
   *
   * This used to be skipped entirely whenever the symptom needed diagnosing, so
   * a shop that had set ₹750 for a Galaxy S23 Ultra screen watched the customer
   * be quoted ₹1,638 off a generic national band. The shop's number is the best
   * estimate that exists for that shop — it is what they will actually charge —
   * and a band built from market research is a distant second.
   *
   * It stays an ESTIMATE either way: a black display might be the panel or the
   * board, and the binding figure is still the quote raised after inspection.
   * What changes is whose number the customer sees first.
   */
  const providerPrice = (shopId || workerId) && repairCode
    ? await pricingService.resolveProviderPrice(ctx, { shopId, workerId })
    : null;

  if (repairCode && !needsDiagnosis && !providerPrice && !referencePrice) {
    throw httpError('No price is configured for this repair yet', 409, 'NO_PRICE_AVAILABLE');
  }

  /**
   * An inspection booking is priced even with no repair chosen — that is the
   * whole product. A symptom-only booking with no repair AND no inspection
   * intent is the only case that carries no price yet.
   */
  /**
   * How far the device has to travel, for the collection fee.
   *
   * Straight-line, from the provider's service-area pin. It is a fee input, not
   * a routing promise, and a road-distance lookup per booking would cost an API
   * call to move the number by a few rupees.
   */
  const distanceKm = serviceMode === 'pickup_repair'
    ? await providerDistanceKm({ shopId, workerId, coordinates: location.coordinates })
    : null;

  /**
   * Add-ons are priced from the SAME provider doing the main job, and only
   * when there is a main job to attach them to — an inspection-only visit has
   * nothing to add disinfection to yet.
   */
  const { addOns, addOnsTotalPaise, addOnsCommissionPaise } = (repairCode && !isInspectionOnly)
    ? await pricingService.buildAddOnSnapshots({
      vertical, addOnCodes, primaryRepairCode: repairCode, ctx, shopId, workerId,
    })
    : { addOns: [], addOnsTotalPaise: 0, addOnsCommissionPaise: 0 };

  const priceSnapshot = (repairCode || isInspectionOnly)
    ? await pricingService.buildPriceSnapshot({
      vertical, repairCode, providerPrice, referencePrice, serviceMode, discountPaise, distanceKm,
      addOnsTotalPaise, addOnsCommissionPaise,
    })
    : {
      subtotalPaise: 0, totalPaise: 0, currency: 'INR',
      pricingMode: 'diagnosis_required', isEstimate: true,
      resolutionPath: 'no_repair_selected', snapshotAt: new Date(),
    };

  // Reserve the part only when we know both the provider and the exact part.
  let reservedPartId = null;
  if ((shopId || workerId) && repair && !needsDiagnosis) {
    const inv = await matchingService.checkInventory({
      shopId, workerId, repair, brandCode, modelCode, qualityCode,
    });
    if (inv.needsPart) {
      if (!inv.inStock) throw httpError('That provider no longer has the part in stock', 409, 'OUT_OF_STOCK');

      /**
       * `needed` is the difference between "somebody else got it" and "there was
       * nothing to reserve".
       *
       * reserveStock returns { reserved: false, needed: false } when no partId
       * was given — which is now the NORMAL case, because providers quote a
       * part-inclusive price and are no longer asked to keep a stock list. The
       * caller checked only `reserved`, so having nothing to reserve was
       * reported to the customer as "that part was just taken by another
       * booking" and the booking was refused. Every part-based repair — screens,
       * batteries, ports — failed this way.
       */
      const r = await reserveStock({ shopId, workerId, partId: inv.partId });
      if (r.needed && !r.reserved) {
        throw httpError('That part was just taken by another booking', 409, 'STOCK_RACE_LOST');
      }
      reservedPartId = r.reserved ? inv.partId : null;
    }
  }

  try {
    const booking = await RepairBooking.create({
      reference: newReference(),
      userId,
      vertical,
      brandCode,
      modelCode,
      modelId,
      variantLabel,
      fuelType,
      configurationCode: configuration?.code || null,
      configurationId: configuration?._id || null,
      configurationLabel: configuration?.name || '',
      problemCodes,
      diagnosticFlowCode,
      diagnosticAnswers,
      diagnosisSummary,
      repairCode,
      qualityCode,
      addOns,
      partId: reservedPartId,
      serviceMode,
      shopId,
      workerId,
      zappyRecommended,
      paymentMethod,
      location: { ...location, type: 'Point' },
      scheduledAt,
      slotLabel,
      priceSnapshot,
      status: 'PENDING',
      statusHistory: [{ status: 'PENDING', at: new Date(), actorRole: 'customer', actorId: userId }],
      idempotencyKey,
    });

    /**
     * Advance the booking out of PENDING immediately.
     *
     * This is a marketplace, not an auction — the customer already chose the
     * provider, so there is nothing to broadcast or bid on. Leaving the booking
     * at PENDING meant the provider was named on it but never told, and the job
     * sat invisible until someone moved it by hand.
     *
     * With a provider chosen we go straight to PROVIDER_ASSIGNED (which fires
     * their notification). Without one — an inspection, or a diagnosis-first
     * booking with no provider yet — we stop at CONFIRMED for assignment.
     */
    const hasProvider = !!(workerId || shopId);
    booking.applyTransition('CONFIRMED', { actorRole: 'system', reason: 'booking created' });
    if (hasProvider) {
      booking.applyTransition('PROVIDER_ASSIGNED', { actorRole: 'system', reason: 'provider chosen by customer' });
    }

    // Creation moves the booking without calling transition(), so the accept
    // clock is started here. A provider-assigned booking with no deadline is
    // invisible to the watchdog — the one stage where the customer is waiting
    // on nobody at all.
    Object.assign(booking, await slaService.deadlineFor(booking, booking.status));

    await booking.save();

    // Announced after the save, so nothing is advertised that could roll back.
    eventsService.announceTransition(booking, booking.status).catch(() => {});

    return { booking: booking.toObject(), replayed: false };
  } catch (err) {
    // Lost an idempotency race — return the winner instead of failing.
    if (err.code === DUPLICATE_KEY && idempotencyKey) {
      const existing = await RepairBooking.findOne({ idempotencyKey }).lean();
      if (existing) {
        if (reservedPartId) await releaseStock({ shopId, workerId, partId: reservedPartId });
        return { booking: existing, replayed: true };
      }
    }
    if (reservedPartId) await releaseStock({ shopId, workerId, partId: reservedPartId });
    throw err;
  }
}

/**
 * Move a booking through its state machine, with authorisation.
 *
 * Ownership is asserted here — §51: a worker's app claiming a booking id is not
 * evidence that the booking is theirs.
 */
async function transition(bookingId, next, { actorRole, actorId, reason = '', meta = null } = {}) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  /**
   * Possession is proved, not asserted.
   *
   * Placed here rather than in a route handler so there is no way around it —
   * no admin action, background job or second endpoint can move a device into
   * "collected" or "returned" without the customer's code having been typed in
   * front of them.
   */
  await handoverService.assertGatePassed(booking, next);

  // Completion is gated on QA, not on the worker's say-so.
  if (next === 'COMPLETED') {
    const gate = await assertQAPassed(booking);
    if (!gate.ok) throw httpError(gate.message, 409, gate.code);

    // …and on the money actually being in hand for a cash job.
    const cash = assertCashCollected(booking);
    if (!cash.ok) throw httpError(cash.message, 409, cash.code);
  }

  /**
   * Start the clock on the stage being entered.
   *
   * Computed before the transition is applied so the deadline lands in the same
   * save — a booking that moved but has no deadline is invisible to the
   * watchdog, which is the one place a missed job must never hide.
   */
  const timing = await slaService.deadlineFor(booking, next);

  if (!booking.applyTransition(next, { actorRole, actorId, reason, meta })) {
    throw httpError(
      `Cannot move a booking from ${booking.status} to ${next}`,
      409,
      'INVALID_TRANSITION',
      { from: booking.status, to: next },
    );
  }

  Object.assign(booking, timing);

  await booking.save();

  // Stock accounting follows the state, so it cannot drift from reality.
  if (next === 'COMPLETED') {
    await consumeStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId });
    await issueWarranty(booking);
    // Pays the provider. Never throws — a wallet outage must not un-complete
    // a finished repair; failures are logged for reconciliation instead.
    await settlementService.settleSafely(booking);
  } else if (['CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED'].includes(next)) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId });
  }

  /**
   * Put the NEXT code in the customer's hands now, not when it is asked for.
   *
   * Generating it at the moment the technician asks leaves two people standing
   * in a doorway waiting for a push notification. Issued one step ahead, the
   * customer is already looking at it. Never allowed to fail the transition —
   * the code can be re-issued, a half-applied status change cannot.
   */
  handoverService.issueForUpcoming(booking).catch((err) => {
    require('../../../utils/logger').warn(
      { bookingId: String(booking._id), err: err.message },
      '[repair] could not pre-issue handover code',
    );
  });

  // Announced after the state is durably saved — never notify about something
  // that might still roll back.
  eventsService.announceTransition(booking, next).catch(() => {});

  return booking.toObject();
}

/**
 * Issue the warranty card on completion (§33).
 *
 * The term comes from the price the customer actually agreed to — the approved
 * quote if there was one, otherwise the booking snapshot — never from today's
 * catalog default, which may have changed since. Best effort: a warranty write
 * failing must not un-complete a finished repair.
 */
async function issueWarranty(booking) {
  try {
    if (booking.warrantyId) return null;

    const days = booking.priceSnapshot?.warrantyDays || 0;
    if (days <= 0) return null;

    const Warranty = require('../../service/warranty.model');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + days * 86400 * 1000);

    const warranty = await Warranty.create({
      orderId: booking._id,
      userId: booking.userId,
      workerId: booking.workerId,
      service: booking.repairCode || 'repair',
      warrantyDays: days,
      issuedAt,
      expiresAt,
      status: 'active',
    });

    await RepairBooking.updateOne({ _id: booking._id }, { $set: { warrantyId: warranty._id } });
    return warranty;
  } catch (err) {
    require('../../../utils/logger').warn(
      { err: err.message, bookingId: String(booking._id) },
      '[repair] warranty issuance failed',
    );
    return null;
  }
}

/** Object-level authorisation — the customer, the assigned provider, or admin. */
function assertActorMayAct(booking, actorRole, actorId) {
  if (actorRole === 'admin' || actorRole === 'system') return;
  const id = String(actorId || '');
  if (actorRole === 'customer' && String(booking.userId) === id) return;
  if (actorRole === 'worker' && booking.workerId && String(booking.workerId) === id) return;
  if (actorRole === 'shop' && booking.shopId && String(booking.shopId) === id) return;
  throw httpError('You do not have access to this booking', 403, 'FORBIDDEN');
}


/**
 * The technician has the customer's cash in hand.
 *
 * Recorded by the provider at the moment it happens, because the alternative —
 * assuming payment on completion — means a job marked done and paid that was
 * never actually paid, and nobody notices until the week's accounts.
 *
 * Only the provider on this booking can record it, and only for a cash job:
 * an online booking is settled by the gateway webhook, never by a button.
 */
async function collectCash({ bookingId, actorRole, actorId }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  if (booking.paymentMethod !== 'cash') {
    throw httpError('This booking is paid online, not in cash', 409, 'NOT_A_CASH_BOOKING');
  }
  if (booking.paymentStatus === 'paid') {
    // Idempotent: a second tap on a patchy connection must not double-record.
    return { booking, alreadyPaid: true };
  }

  const due = booking.priceSnapshot?.totalPaise || 0;
  if (due <= 0) throw httpError('There is nothing to collect on this booking', 409, 'NOTHING_DUE');

  booking.paymentStatus = 'paid';
  booking.cashCollectedAt = new Date();
  booking.cashCollectedById = actorId;
  await booking.save();

  return { booking, alreadyPaid: false, collectedPaise: due };
}



/**
 * A shop owner puts one of their own technicians on the job.
 *
 * The shop is the counterparty on the booking — the customer chose the shop,
 * and the shop is paid — but somebody has to actually hold the screwdriver.
 * Naming them here means the technician sees the job in their own app, gets
 * rung about it, and the custody record says who had the device.
 *
 * The worker must belong to THIS shop. Without that check an owner could park
 * a job on any technician on the platform, who would then be answerable for a
 * device they never agreed to touch.
 */
async function assignWorker({ bookingId, shopId, workerId }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (String(booking.shopId || '') !== String(shopId)) {
    throw httpError('This booking is not yours to assign', 403, 'FORBIDDEN');
  }

  const Worker = require('../../worker/worker.model');
  const worker = await Worker.findOne({ _id: workerId, shopId }).select('name phone isBlocked').lean();
  if (!worker) {
    throw httpError('That technician is not on your team', 400, 'NOT_YOUR_WORKER');
  }
  if (worker.isBlocked) {
    throw httpError('That technician is blocked and cannot take jobs', 409, 'WORKER_BLOCKED');
  }

  const settled = ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'REFUNDED'];
  if (settled.includes(booking.status)) {
    throw httpError('This job is already closed', 409, 'BOOKING_CLOSED');
  }

  booking.workerId = worker._id;
  booking.statusHistory.push({
    status: booking.status,
    at: new Date(),
    actorRole: 'shop',
    actorId: shopId,
    reason: `assigned to ${worker.name || 'technician'}`,
  });
  await booking.save();

  // Ring the technician the same way any other job would — being handed work by
  // your own shop should not feel different from being handed it by dispatch.
  eventsService.announceOffer(booking);

  return { booking, worker };
}

/**
 * The provider passes on a job.
 *
 * Declining is a legitimate answer — the technician may be mid-job, out of the
 * part, or too far — and treating it as a failure teaches providers to let
 * offers rot instead, which is worse for the customer. The booking goes back to
 * unassigned so dispatch can try someone else, and the reason is kept.
 */
/**
 * Offer a released job to the next provider.
 *
 * Both ways a job comes loose — the provider passed on it, or never answered
 * and the watchdog reclaimed it — left the booking at CONFIRMED with nobody
 * assigned and NOTHING looking for a replacement. The customer had paid
 * attention to "we'll find someone else" and we then looked for nobody: the job sat
 * there until a human noticed. Orders have a dispatch loop; repairs did not.
 *
 * Anyone already on `declines` is skipped, so a provider who passed is not
 * handed the same job thirty seconds later. When nobody else can take it the
 * booking stays CONFIRMED and unassigned — which is honest, and is the state
 * ops can query for — rather than being cancelled out from under the customer.
 */
/**
 * Straight-line kilometres from a provider's base to the customer.
 *
 * Returns null when either end is unknown, so the fee falls back to the flat
 * rate rather than being computed from a guess.
 */
async function providerDistanceKm({ shopId, workerId, coordinates }) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  if (!shopId && !workerId) return null;

  const { ProviderServiceArea } = require('../models/config.model');
  const area = await ProviderServiceArea.findOne({
    ...(shopId ? { shopId } : { workerId }),
    isActive: true,
    'center.coordinates.0': { $exists: true },
  }).select('center').lean();

  const from = area?.center?.coordinates;
  if (!Array.isArray(from) || from.length !== 2) return null;

  const R = 6371;
  const dLat = ((coordinates[1] - from[1]) * Math.PI) / 180;
  const dLng = ((coordinates[0] - from[0]) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((from[1] * Math.PI) / 180) * Math.cos((coordinates[1] * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

async function redispatch(bookingId) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) return { assigned: false, reason: 'not_found' };
  if (booking.status !== 'CONFIRMED' || booking.shopId || booking.workerId) {
    return { assigned: false, reason: 'not_awaiting_provider' };
  }

  const coords = booking.location?.coordinates;
  if (!booking.repairCode || !Array.isArray(coords) || coords.length !== 2) {
    return { assigned: false, reason: 'insufficient_context' };
  }

  const tried = new Set((booking.declines || []).map((d) => String(d.providerId)));

  const { providers } = await matchingService.findProviders({
    vertical: booking.vertical,
    repairCode: booking.repairCode,
    brandCode: booking.brandCode,
    modelCode: booking.modelCode,
    qualityCode: booking.qualityCode || null,
    serviceMode: booking.serviceMode,
    lat: coords[1],
    lng: coords[0],
    cityCode: booking.location?.cityCode || null,
  });

  const next = (providers || []).find((p) => !tried.has(String(p.shopId || p.workerId)));
  if (!next) return { assigned: false, reason: 'no_one_left' };

  booking.shopId = next.shopId || null;
  booking.workerId = next.workerId || null;
  booking.applyTransition('PROVIDER_ASSIGNED', {
    actorRole: 'system',
    reason: 'reoffered after release',
  });
  Object.assign(booking, await slaService.deadlineFor(booking, booking.status));
  await booking.save();

  // Ring them, exactly as the first offer did.
  eventsService.announceOffer(booking);
  eventsService.announceTransition(booking, 'PROVIDER_ASSIGNED').catch(() => {});

  return { assigned: true, provider: next };
}

/**
 * States a provider may still WALK AWAY from without ending the job.
 *
 * The line is custody. Up to and including arrival, nothing of the customer's
 * has changed hands and another provider can simply take the work. Once the
 * device is picked up, or the technician has started diagnosing or repairing,
 * handing the booking to someone else is meaningless — the phone is in the
 * first provider's van. Those are real cancellations with real consequences.
 */
const RELEASABLE_FROM = [
  'CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'PICKUP_SCHEDULED',
];

/** Can this provider hand the job back rather than kill it? */
function canReleaseToPool(booking) {
  return RELEASABLE_FROM.includes(booking.status);
}

/**
 * A provider walks away from a job the customer still wants.
 *
 * Reported from production: when a shop cancelled, the booking simply died.
 * The customer — who had done nothing wrong and still needed their phone
 * fixed — was left with a CANCELLED booking and had to start again from the
 * first screen, re-entering their device, their fault and their address.
 *
 * A provider cancelling is not the customer changing their mind. It is supply
 * failing, and the platform's job is to find other supply. So the provider is
 * released, the job returns to the pool, and it is offered to the next one —
 * exactly what already happens when a provider DECLINES an offer, and the same
 * thing the SLA watchdog does when nobody answers.
 *
 * Returns `{ released: false }` when the job has gone too far to reassign, and
 * the caller falls back to a genuine cancellation.
 */
async function releaseToPool({ bookingId, actorRole, actorId, reason = '' }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  if (!canReleaseToPool(booking)) return { released: false, booking: booking.toObject() };

  // Release whatever was held for them, so the next provider is offered a job
  // that is genuinely available.
  if (booking.partId) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId })
      .catch(() => {});
    booking.partId = null;
  }

  /*
   * Recorded as a decline against THIS provider.
   *
   * It has to be on the record: a provider who accepts jobs and then abandons
   * them costs the customer more than one who never accepted, and the matcher
   * and the ops team both need to see that pattern. `redispatch` also reads
   * this list so the same provider is not immediately offered the job back.
   */
  booking.declines = booking.declines || [];
  booking.declines.push({
    providerKind: booking.shopId ? 'shop' : 'worker',
    providerId: booking.shopId || booking.workerId,
    reason: reason || 'provider_cancelled',
    at: new Date(),
  });

  booking.shopId = null;
  booking.workerId = null;
  booking.status = 'CONFIRMED';
  booking.statusHistory.push({
    status: 'CONFIRMED', at: new Date(), actorRole, actorId, reason: reason || 'provider_cancelled',
  });

  await booking.save();

  // Hand it straight to the next provider. A failure here must not undo the
  // release — an unassigned booking is recoverable, a stuck one is not.
  const handed = await redispatch(booking._id).catch((err) => {
    require('../../../utils/logger').error(
      { bookingId: String(booking._id), err: err.message },
      '[repair] could not re-dispatch after provider cancelled',
    );
    return null;
  });

  const fresh = await RepairBooking.findById(booking._id).lean();
  return { released: true, reoffered: !!handed, booking: fresh };
}

async function declineBooking({ bookingId, actorRole, actorId, reason = '' }) {
  const booking = await RepairBooking.findById(bookingId);
  if (!booking) throw httpError('Booking not found', 404, 'NOT_FOUND');

  assertActorMayAct(booking, actorRole, actorId);

  if (!['PROVIDER_ASSIGNED', 'CONFIRMED'].includes(booking.status)) {
    throw httpError(
      'This job can no longer be passed on — it has already started',
      409,
      'TOO_LATE_TO_DECLINE',
      { status: booking.status },
    );
  }

  // Release whatever was held for them, so the next provider is offered a job
  // that is genuinely available.
  if (booking.partId) {
    await releaseStock({ shopId: booking.shopId, workerId: booking.workerId, partId: booking.partId })
      .catch(() => {});
    booking.partId = null;
  }

  booking.declines = booking.declines || [];
  booking.declines.push({
    providerKind: booking.shopId ? 'shop' : 'worker',
    providerId: booking.shopId || booking.workerId,
    reason,
    at: new Date(),
  });

  booking.shopId = null;
  booking.workerId = null;
  booking.status = 'CONFIRMED';
  booking.statusHistory.push({
    status: 'CONFIRMED', at: new Date(), actorRole, actorId, reason: reason || 'provider_declined',
  });

  await booking.save();

  // Hand it straight to the next provider. Failure here must not undo the
  // decline itself — the provider has passed either way, and an unassigned
  // booking is recoverable where a stuck one is not.
  const handed = await redispatch(booking._id).catch((err) => {
    require('../../../utils/logger').error(
      { bookingId: String(booking._id), err: err.message },
      '[repair] re-dispatch after decline failed',
    );
    return { assigned: false, reason: 'error' };
  });

  return handed.assigned ? RepairBooking.findById(booking._id) : booking;
}

/**
 * A cash job cannot be completed before the money is in hand.
 *
 * Completion triggers settlement, which bills the provider their commission on
 * the assumption they were paid. Letting it run first would take commission on
 * a job nobody paid for.
 */
function assertCashCollected(booking) {
  if (booking.paymentMethod !== 'cash') return { ok: true };
  if (booking.paymentStatus === 'paid') return { ok: true };
  if ((booking.priceSnapshot?.totalPaise || 0) <= 0) return { ok: true };
  return {
    ok: false,
    code: 'CASH_NOT_COLLECTED',
    message: 'Collect the payment from the customer before completing this job',
  };
}

/** A repair may not be declared complete while required QA items fail (§27). */
async function assertQAPassed(booking) {
  if (!booking.repairCode) return { ok: true };
  const repair = await Repair.findOne({ code: booking.repairCode, vertical: booking.vertical }).lean();
  const codes = repair?.qaChecklistCodes || [];
  if (!codes.length) return { ok: true };

  const checklist = await QAChecklist.findOne({
    code: { $in: codes }, vertical: booking.vertical, isActive: true,
  }).lean();
  if (!checklist) return { ok: true };

  const qa = await QAInspection.findOne({ bookingId: booking._id, stage: 'after' })
    .sort({ performedAt: -1 })
    .lean();

  if (!qa) return { ok: false, code: 'QA_REQUIRED', message: 'Post-repair QA must be completed first' };
  if (!qa.passed) {
    return {
      ok: false,
      code: 'QA_FAILED',
      message: `${qa.failedRequiredCount} required QA check(s) failed — resolve them before completing`,
    };
  }
  return { ok: true };
}

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
  createBooking,
  transition,
  submitQuote,
  respondToQuote,
  assertActorMayAct,
  assertQAPassed,
  assertCashCollected,
  collectCash,
  declineBooking,
  releaseToPool,
  canReleaseToPool,
  RELEASABLE_FROM,
  redispatch,
  assignWorker,
  issueWarranty,
  reserveStock,
  releaseStock,
  consumeStock,
  newReference,
  QUOTABLE_STATES,
};
