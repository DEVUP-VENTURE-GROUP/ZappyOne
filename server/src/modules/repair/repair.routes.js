const express = require('express');
const Joi = require('joi');
const ctrl = require('./repair.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { requireKnownVertical, VERTICALS } = require('./vertical');
const { SERVICE_MODES } = require('./service-modes');
const { validate } = require('../../middlewares/validate');
const { makeLimiter, ratingLimiter } = require('../../middlewares/rateLimit');

/**
 * Six digits is guessable if you are allowed to keep trying at someone's door.
 * Ten attempts in five minutes is generous for reading a number aloud and
 * nowhere near enough to search the space.
 */
const otpVerifyLimiter = makeLimiter({ windowMs: 5 * 60_000, max: 10, prefix: 'rotp' });

/**
 * Repair API surface.
 *
 * Route order matters: literal segments are declared before `/:id` so a path
 * like `/bookings/mine` is never swallowed by the id parameter.
 *
 * Authorisation is layered — `authenticate` proves who you are, `requireRole`
 * proves what you may attempt, and the service layer re-checks that the
 * specific record belongs to you (§51). A route guard alone is not enough,
 * because "is a worker" does not mean "is THIS booking's worker".
 */

const router = express.Router();

const objectId = Joi.string().pattern(/^[a-f0-9]{24}$/i);

const locationSchema = Joi.object({
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  address: Joi.string().max(300).required(),
  landmark: Joi.string().max(150).allow('', null),
  flatNumber: Joi.string().max(60).allow('', null),
  cityCode: Joi.string().max(60).allow('', null),
  pincode: Joi.string().max(10).allow('', null),
});

/* ─── Catalog (any signed-in user) ─────────────────────────────────────── */

/**
 * Deep catalog. Literal segments precede the parameterised model route so
 * `/models/:modelCode/configurations` is never swallowed by a brand path.
 */
router.get('/product-types', authenticate, requireKnownVertical, ctrl.listProductTypes);
router.get('/brands', authenticate, requireKnownVertical, ctrl.listBrands);
router.get('/brands/:brandCode/families', authenticate, requireKnownVertical, ctrl.listFamilies);
router.get('/brands/:brandCode/series', authenticate, requireKnownVertical, ctrl.listSeries);
router.get('/brands/:brandCode/models', authenticate, requireKnownVertical, ctrl.listModels);
router.get('/models/:modelCode/configurations', authenticate, requireKnownVertical, ctrl.listConfigurations);
router.get('/problems', authenticate, requireKnownVertical, ctrl.listProblems);
router.get('/repairs', authenticate, requireKnownVertical, ctrl.listRepairs);
router.get('/addons', authenticate, requireKnownVertical, ctrl.listAddOns);
router.get('/part-qualities', authenticate, ctrl.listPartQualities);

/* ─── Model identification (§7) ────────────────────────────────────────── */

/**
 * The customer cannot name their machine. Rather than guess — and order the
 * wrong part — take whatever they can give us and let a human resolve it.
 */
router.get('/identify/mine', authenticate, requireKnownVertical, ctrl.listMyIdentificationRequests);

router.post(
  '/identify',
  authenticate,
  requireKnownVertical,
  validate(Joi.object({
    vertical: Joi.string().max(30),
    brandCode: Joi.string().max(60).allow('', null),
    brandName: Joi.string().max(120).allow('', null),
    modelText: Joi.string().max(200).allow('', null),
    productNumber: Joi.string().max(80).allow('', null),
    serialNumber: Joi.string().max(80).allow('', null),
    notes: Joi.string().max(1000).allow('', null),
    imageUrls: Joi.array().items(Joi.string().max(500)).max(5).default([]),
  })),
  ctrl.submitIdentificationRequest,
);

/* ─── Diagnostics ──────────────────────────────────────────────────────── */

router.get('/diagnostics/:problemCode', authenticate, ctrl.getDiagnosticFlow);
router.post(
  '/diagnostics/:problemCode',
  authenticate,
  validate(Joi.object({ answers: Joi.object().unknown(true).default({}) })),
  ctrl.submitDiagnostic,
);

/* ─── Pricing preview + provider discovery ─────────────────────────────── */

router.get('/price-preview', authenticate, ctrl.previewPrice);
router.get('/providers', authenticate, ctrl.findProviders);

/* ─── Catalog gap requests (§67) ───────────────────────────────────────── */

router.post(
  '/catalog-requests',
  authenticate,
  validate(Joi.object({
    kind: Joi.string().valid('brand', 'model', 'problem').required(),
    brandName: Joi.string().max(120).allow('', null),
    modelName: Joi.string().max(120).allow('', null),
    variantName: Joi.string().max(120).allow('', null),
    problemText: Joi.string().max(500).allow('', null),
    notes: Joi.string().max(1000).allow('', null),
    imageUrls: Joi.array().items(Joi.string().max(500)).max(5),
  })),
  ctrl.submitCatalogRequest,
);

/* ─── Bookings ─────────────────────────────────────────────────────────── */

// Literal path first — otherwise `/bookings/:id` would match "mine".
router.get('/bookings/mine', authenticate, requireRole('user'), ctrl.listMyBookings);

router.post(
  '/bookings',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    vertical: Joi.string().max(30),
    brandCode: Joi.string().max(60).required(),
    modelCode: Joi.string().max(120).required(),
    modelId: objectId.allow(null),
    variantLabel: Joi.string().max(120).allow('', null),
    // Listed here or `stripUnknown` deletes it on the way in and the booking
    // is written with no powertrain at all — the exact failure that filed
    // laptop prices under mobile.
    fuelType: Joi.string().max(30).allow('', null),
    // The exact build, where the vertical has one. Mobile omits it.
    configurationCode: Joi.string().max(120).allow('', null),
    problemCodes: Joi.array().items(Joi.string().max(80)).default([]),
    diagnosticFlowCode: Joi.string().max(80).allow(null),
    diagnosticAnswers: Joi.object().unknown(true).allow(null),
    diagnosisSummary: Joi.string().max(2000).allow('', null),
    repairCode: Joi.string().max(80).allow(null),
    qualityCode: Joi.string().max(60).allow(null),
    // Must be declared: `stripUnknown` deletes anything the schema does not
    // name, so an omission here silently drops every add-on the customer chose.
    addOnCodes: Joi.array().items(Joi.string().max(80)).max(10).default([]),
    serviceMode: Joi.string().valid(...SERVICE_MODES).default('doorstep'),
    shopId: objectId.allow(null),
    workerId: objectId.allow(null),
    zappyRecommended: Joi.boolean().default(false),
    location: locationSchema.required(),
    scheduledAt: Joi.date().allow(null),
    slotLabel: Joi.string().max(80).allow('', null),
    discountPaise: Joi.number().integer().min(0).default(0),
    // Cash until the gateway is live; the server still decides what is allowed.
    paymentMethod: Joi.string().valid('cash', 'online').default('cash'),
    idempotencyKey: Joi.string().max(120).allow(null),
  })),
  ctrl.createBooking,
);

/* ─── Saved assets — the customer's own tanks, phones, vehicles ──────────── */

const assetBody = Joi.object({
  vertical: Joi.string().max(30).required(),
  brandCode: Joi.string().max(60).required(),
  modelCode: Joi.string().max(120).allow(null, ''),
  label: Joi.string().max(80).allow('', null),
  notes: Joi.string().max(1000).allow('', null),
  // Uploaded keys, never a pasted link.
  photos: Joi.array().items(Joi.string().max(500)).max(10).default([]),
  lastServicedAt: Joi.date().allow(null),
  installedAt: Joi.date().allow(null),
  lat: Joi.number().min(-90).max(90).allow(null),
  lng: Joi.number().min(-180).max(180).allow(null),
  address: Joi.string().max(300).allow('', null),
});

router.get('/assets', authenticate, requireRole('user'), ctrl.listMyAssets);
router.post('/assets', authenticate, requireRole('user'), validate(assetBody), ctrl.createMyAsset);
router.patch('/assets/:id', authenticate, requireRole('user'),
  validate(assetBody.fork(['vertical', 'brandCode'], (f) => f.optional())), ctrl.updateMyAsset);
router.delete('/assets/:id', authenticate, requireRole('user'), ctrl.archiveMyAsset);
router.get('/assets/:id/history', authenticate, requireRole('user'), ctrl.getAssetHistory);

router.get('/bookings/:id', authenticate, ctrl.getBooking);
// Rendered HTML, same approach as the order invoice — printable and mailable.
router.get('/bookings/:id/report', authenticate, ctrl.getBookingReport);

router.post(
  '/bookings/:id/status',
  authenticate,
  validate(Joi.object({
    status: Joi.string().max(40).required(),
    reason: Joi.string().max(300).allow('', null),
    meta: Joi.object().unknown(true).allow(null),
  })),
  ctrl.transitionBooking,
);

/**
 * Cash collected, recorded by whoever took it. Provider-side only.
 */
/**
 * A shop puts one of its own technicians on a job it was given.
 */
router.post(
  '/bookings/:id/assign-worker',
  authenticate,
  requireRole('shop'),
  validate(Joi.object({ workerId: objectId.required() })),
  ctrl.assignWorker,
);

/**
 * Passing on a job is a normal answer, not a failure — see declineBooking.
 */
router.post(
  '/bookings/:id/decline',
  authenticate,
  requireRole('worker', 'shop'),
  validate(Joi.object({ reason: Joi.string().max(300).allow('', null) })),
  ctrl.declineBooking,
);

router.post(
  '/bookings/:id/collect-cash',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  ctrl.collectCash,
);

/**
 * What cancelling would cost, before anything is cancelled.
 *
 * A GET on purpose: asking the price must be free of side effects, so a
 * customer can open the confirm dialog, read the number, and back out.
 */
router.get('/bookings/:id/cancellation-quote', authenticate, ctrl.previewCancellation);

router.post(
  '/bookings/:id/cancel',
  authenticate,
  validate(Joi.object({ reason: Joi.string().max(300).allow('', null) })),
  ctrl.cancelBooking,
);

/* ─── Proof and feedback ───────────────────────────────────────────────── */

/** Photographs of the finished work, attached by whoever did it. */
router.post(
  '/bookings/:id/completion-photos',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  validate(Joi.object({
    photos: Joi.array().items(Joi.string().max(500)).max(5).required(),
  })),
  ctrl.attachCompletionPhotos,
);

/** The customer rates the finished repair. Once — see the controller. */
router.post(
  '/bookings/:id/rate',
  authenticate,
  requireRole('user'),
  ratingLimiter,
  validate(Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).allow('', null),
  })),
  ctrl.rateRepair,
);

/* ─── Handover codes ───────────────────────────────────────────────────── */

/**
 * The customer's own code for whichever step is next.
 *
 * Owner only, and only the code currently due — a full set in one response is
 * a full set to leak.
 */
router.get('/bookings/:id/handover-code', authenticate, requireRole('user'), ctrl.myHandoverCode);

/**
 * The technician types what the customer reads out.
 *
 * Rate-limited: six digits is guessable given enough tries at someone's door,
 * and a wrong code is never a typo worth retrying fifty times.
 */
router.post(
  '/bookings/:id/handover-code/verify',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  otpVerifyLimiter,
  validate(Joi.object({
    kind: Joi.string().valid('start', 'handover', 'return').required(),
    code: Joi.string().pattern(/^[0-9]{6}$/).required(),
  })),
  ctrl.verifyHandoverCode,
);

/* ─── Quotes ───────────────────────────────────────────────────────────── */

// Only the provider side may quote; the customer only responds.
router.post(
  '/bookings/:id/quotes',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  validate(Joi.object({
    diagnosisSummary: Joi.string().max(2000).required(),
    diagnosisPhotos: Joi.array().items(Joi.string().max(500)).max(10).default([]),
    // Raised because something else turned up once the device was open.
    isAdditional: Joi.boolean().default(false),
    foundProblemCodes: Joi.array().items(Joi.string().max(80)).max(10).default([]),
    foundNote: Joi.string().max(1000).allow('', null),
    repairCode: Joi.string().max(80).required(),
    qualityCode: Joi.string().max(60).allow(null),
    warrantyDays: Joi.number().integer().min(0).default(0),
    estimatedDurationMin: Joi.number().integer().min(1).allow(null),
    items: Joi.array().items(Joi.object({
      kind: Joi.string().valid('part', 'labour', 'consumable', 'travel', 'pickup', 'return', 'diagnosis', 'other').required(),
      label: Joi.string().max(200).required(),
      partId: objectId.allow(null),
      partSku: Joi.string().max(80).allow(null),
      qualityCode: Joi.string().max(60).allow(null),
      quantity: Joi.number().integer().min(1).default(1),
      unitPricePaise: Joi.number().integer().min(0).required(),
      amountPaise: Joi.number().integer().min(0),
      warrantyDays: Joi.number().integer().min(0).default(0),
      note: Joi.string().max(300).allow('', null),
    })).min(1).required(),
  })),
  ctrl.submitQuote,
);

router.post(
  '/quotes/:quoteId/respond',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    decision: Joi.string().valid('approve', 'reject', 'clarify').required(),
    reason: Joi.string().max(500).allow('', null),
  })),
  ctrl.respondToQuote,
);

/* ─── Provider self-service (§18) ──────────────────────────────────────── */

// Everything below is scoped to the caller's own records by the controller,
// which resolves the owner from the token rather than from any path or body.
const provider = require('./repair-provider.controller');
const providerOnly = [authenticate, requireRole('worker', 'shop')];

router.get('/provider/onboarding', ...providerOnly, provider.onboardingStatus);
router.get('/provider/jobs', ...providerOnly, provider.listJobs);

router.get('/provider/work-catalog', ...providerOnly, provider.workCatalog);
router.get('/provider/capabilities', ...providerOnly, provider.listCapabilities);

/**
 * A screenful of choices saved in one request — see bulkCapabilities.
 * `candidateCodes` bounds what may be removed, so one heading cannot wipe
 * work claimed under another.
 */
router.put(
  '/provider/capabilities/bulk',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().max(30),
    repairCodes: Joi.array().items(Joi.string().max(80)).default([]),
    candidateCodes: Joi.array().items(Joi.string().max(80)).default([]),
    brandCodes: Joi.array().items(Joi.string().max(60)).default([]),
    serviceModes: Joi.array().items(Joi.string().valid(...SERVICE_MODES)).default(['doorstep']),
    skillLevel: Joi.number().integer().min(1).max(10).default(1),
  })),
  provider.bulkCapabilities,
);
router.put(
  '/provider/capabilities',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().valid(...VERTICALS),
    repairCode: Joi.string().max(80).required(),
    brandCodes: Joi.array().items(Joi.string().max(60)).default([]),
    modelCodes: Joi.array().items(Joi.string().max(120)).default([]),
    qualityCodes: Joi.array().items(Joi.string().max(60)).default([]),
    serviceModes: Joi.array().items(Joi.string().valid(...SERVICE_MODES)).min(1),
    skillLevel: Joi.number().integer().min(1).max(10).default(1),
    estimatedDurationMin: Joi.number().integer().min(1).allow(null),
  })),
  provider.upsertCapability,
);
router.delete('/provider/capabilities/:id', ...providerOnly, provider.removeCapability);

router.get('/provider/service-areas', ...providerOnly, provider.listServiceAreas);
router.put(
  '/provider/service-areas',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().valid(...VERTICALS),
    cityCode: Joi.string().max(60).required(),
    areaNames: Joi.array().items(Joi.string().max(120)).default([]),
    pincodes: Joi.array().items(Joi.string().max(10)).default([]),
    center: Joi.array().items(Joi.number()).length(2),
    // 20km is the practical ceiling for doorstep work in an Indian city —
    // beyond it the travel eats the job and the customer waits all day.
    radiusKm: Joi.number().min(1).max(20).default(10),
    serviceModes: Joi.array().items(Joi.string().valid(...SERVICE_MODES)).min(1),
    workshopAddress: Joi.string().max(300).allow('', null),
    workshopLocation: Joi.array().items(Joi.number()).length(2),
  })),
  provider.upsertServiceArea,
);

router.get('/provider/catalog-requests', ...providerOnly, provider.listCatalogRequests);
router.post(
  '/provider/catalog-requests',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().max(30),
    categoryCode: Joi.string().max(80).allow('', null),
    proposedName: Joi.string().max(120).required(),
    description: Joi.string().max(1000).allow('', null),
    cityCode: Joi.string().max(60).allow('', null),
  })),
  provider.requestCatalogAddition,
);

router.get('/provider/parts', ...providerOnly, provider.listStockableParts);
router.get('/provider/inventory', ...providerOnly, provider.listInventory);
router.put(
  '/provider/inventory',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().valid(...VERTICALS),
    partId: objectId.required(),
    quantity: Joi.number().integer().min(0).default(0),
    costPaise: Joi.number().integer().min(0).default(0),
    lowStockThreshold: Joi.number().integer().min(0).default(2),
    onOrder: Joi.boolean().default(false),
  })),
  provider.upsertInventory,
);

router.get('/provider/pricing/reference', ...providerOnly, provider.getReferenceBand);
router.get('/provider/pricing', ...providerOnly, provider.listPricing);
router.post(
  '/provider/pricing',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().valid(...VERTICALS),
    repairCode: Joi.string().max(80).required(),
    brandCode: Joi.string().max(60).allow(null),
    modelCode: Joi.string().max(120).allow(null),
    qualityCode: Joi.string().max(60).allow(null),
    serviceMode: Joi.string().valid(...SERVICE_MODES).allow(null),
    cityCode: Joi.string().max(60).allow(null),
    partCostPaise: Joi.number().integer().min(0).default(0),
    labourPaise: Joi.number().integer().min(0).default(0),
    consumablesPaise: Joi.number().integer().min(0).default(0),
    travelPaise: Joi.number().integer().min(0).default(0),
    pickupPaise: Joi.number().integer().min(0).default(0),
    returnPaise: Joi.number().integer().min(0).default(0),
    totalPaise: Joi.number().integer().min(0).required(),
    warrantyDays: Joi.number().integer().min(0).default(0),
    estimatedDurationMin: Joi.number().integer().min(1).allow(null),
  })),
  provider.submitPricing,
);

/**
 * A model's whole price sheet, saved in one request — see bulkPricing.
 *
 * Capped at 200 rows. A provider pricing one model across every repair and part
 * grade lands well inside that; anything larger is a script, and each row does
 * its own reference lookup and approval write, so an unbounded batch would hold
 * a request open long enough to time out halfway through.
 */
router.post(
  '/provider/pricing/bulk',
  ...providerOnly,
  validate(Joi.object({
    vertical: Joi.string().valid(...VERTICALS),
    rows: Joi.array().min(1).max(200).items(Joi.object({
      repairCode: Joi.string().max(80).required(),
      brandCode: Joi.string().max(60).allow(null),
      modelCode: Joi.string().max(120).allow(null),
      qualityCode: Joi.string().max(60).allow(null),
      serviceMode: Joi.string().valid(...SERVICE_MODES).allow(null),
      cityCode: Joi.string().max(60).allow(null),
      partCostPaise: Joi.number().integer().min(0).default(0),
      labourPaise: Joi.number().integer().min(0).default(0),
      consumablesPaise: Joi.number().integer().min(0).default(0),
      travelPaise: Joi.number().integer().min(0).default(0),
      pickupPaise: Joi.number().integer().min(0).default(0),
      returnPaise: Joi.number().integer().min(0).default(0),
      totalPaise: Joi.number().integer().min(0).required(),
      warrantyDays: Joi.number().integer().min(0).default(0),
      estimatedDurationMin: Joi.number().integer().min(1).allow(null),
    })).required(),
  })),
  provider.bulkPricing,
);

/* ─── Device custody + QA (provider side) ──────────────────────────────── */

router.post(
  '/bookings/:id/inspections',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  validate(Joi.object({
    stage: Joi.string().valid('check_in', 'pre_repair', 'post_repair', 'return').required(),
    imei: Joi.string().max(30).allow('', null),
    serialNumber: Joi.string().max(60).allow('', null),
    observedModel: Joi.string().max(120).allow('', null),
    powersOn: Joi.boolean().allow(null),
    conditions: Joi.array().items(Joi.object({
      item: Joi.string().max(60).required(),
      status: Joi.string().valid('ok', 'minor_damage', 'major_damage', 'not_applicable').default('ok'),
      note: Joi.string().max(300).allow('', null),
    })).default([]),
    accessories: Joi.array().items(Joi.string().max(60)).default([]),
    photos: Joi.array().items(Joi.object({
      url: Joi.string().max(500).required(),
      angle: Joi.string().max(40).allow('', null),
    })).default([]),
    notes: Joi.string().max(1000).allow('', null),
  })),
  ctrl.createInspection,
);

router.get('/bookings/:id/qa-checklist', authenticate, ctrl.getQAChecklist);

router.post(
  '/bookings/:id/qa',
  authenticate,
  requireRole('worker', 'shop', 'admin'),
  validate(Joi.object({
    stage: Joi.string().valid('before', 'after').default('after'),
    checklistCode: Joi.string().max(80).allow('', null),
    results: Joi.array().items(Joi.object({
      itemCode: Joi.string().max(60).required(),
      label: Joi.string().max(200).required(),
      required: Joi.boolean().default(true),
      result: Joi.string().valid('pass', 'fail', 'not_applicable', 'not_tested').default('not_tested'),
      note: Joi.string().max(300).allow('', null),
    })).default([]),
    photos: Joi.array().items(Joi.object({
      url: Joi.string().max(500).required(),
      angle: Joi.string().max(40).allow('', null),
    })).default([]),
    notes: Joi.string().max(1000).allow('', null),
  })),
  ctrl.submitQA,
);

module.exports = router;
