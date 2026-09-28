const crypto = require('crypto');
const { RepairBooking } = require('../../models/booking.model');
const { Repair } = require('../../models/repair.model');
const { Problem, ProblemCategory } = require('../../models/problem.model');
const { DeviceConfiguration } = require('../../models/catalog.model');
const pricingService = require('../pricing.service');
const zoneService = require('../../../zone/zone.service');
const matchingService = require('../matching.service');
const eventsService = require('../events.service');
const slaService = require('../sla.service');
const { httpError } = require('../../../../core/errors');
const DUPLICATE_KEY = 11000;
const { reserveStock, releaseStock } = require('./stock');
const { providerDistanceKm } = require('./assignment');

/** Placing a repair booking. */

function newReference() {
  // Short, unambiguous, safe to read out over a phone call.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `ZR${out}`;
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
  await zoneService.assertBookableLocation(location);

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
    require('../../../payment/payables').assertOnlineAvailable(paymentMethod);
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

module.exports = {
  newReference,
  createBooking,
};
