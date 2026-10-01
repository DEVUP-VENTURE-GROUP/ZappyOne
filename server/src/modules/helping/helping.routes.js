const express = require('express');
const Joi = require('joi');
const ctrl = require('./helping.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { makeLimiter } = require('../../middlewares/rateLimit');
const { SERVICE_TYPES, OFFERED_PAYMENT_MODELS } = require('./models/config.model');
const { PROOF_KINDS, ITEM_STATUSES, RETURN_METHODS } = require('./models/task.model');

/**
 * Helping Services API.
 *
 * Literal segments are declared before `/:id` so a path like `/tasks/available`
 * is never swallowed by the id route.
 *
 * A note on these schemas: `validate` runs with `stripUnknown`, so a field
 * missing here is silently deleted rather than rejected. Every field the
 * service layer reads must therefore be named — an omission is a silent data
 * loss bug, not a validation error.
 */

const router = express.Router();
const objectId = Joi.string().hex().length(24);

const locationSchema = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  address: Joi.string().max(300).allow('', null),
});

const itemSchema = Joi.object({
  name: Joi.string().max(200).required(),
  description: Joi.string().max(500).allow('', null),
  quantity: Joi.number().integer().min(1).default(1),
  preferredBrand: Joi.string().max(100).allow('', null),
  preferredSize: Joi.string().max(100).allow('', null),
  preferredVariant: Joi.string().max(100).allow('', null),
  maxApprovedPricePaise: Joi.number().integer().min(0).default(0),
  // Uploaded key, never a pasted link.
  referenceImageKey: Joi.string().max(500).allow('', null),
  referenceUrl: Joi.string().max(1000).allow('', null),
  notes: Joi.string().max(500).allow('', null),
});

const stopSchema = Joi.object({
  label: Joi.string().max(120).allow('', null),
  address: Joi.string().max(300).allow('', null),
  location: locationSchema,
  purpose: Joi.string().valid('shop', 'pickup', 'dropoff', 'merchant', 'courier').default('shop'),
});

const returnDetailSchema = Joi.object({
  merchantName: Joi.string().max(200).allow('', null),
  orderId: Joi.string().max(120).allow('', null),
  returnId: Joi.string().max(120).allow('', null),
  productName: Joi.string().max(200).allow('', null),
  quantity: Joi.number().integer().min(1).default(1),
  returnReason: Joi.string().max(500).allow('', null),
  returnMethod: Joi.string().valid(...RETURN_METHODS).default('store_dropoff'),
  returnDeadline: Joi.date().allow(null),
  merchantInstructions: Joi.string().max(2000).allow('', null),
  // The customer asserts eligibility; ZappyOne never does (§24).
  customerConfirmedEligibility: Joi.boolean().default(false),
  packagingConfirmed: Joi.boolean().default(false),
  desiredReplacement: Joi.string().max(200).allow('', null),
});

/* Public-ish: catalog and pricing */

router.get('/services', authenticate, ctrl.listServices);

router.post('/quote',
  authenticate,
  validate(Joi.object({
    serviceType: Joi.string().valid(...SERVICE_TYPES).required(),
    pickupLocation: locationSchema.allow(null),
    destination: locationSchema.allow(null),
    stops: Joi.array().items(stopSchema).max(5).default([]),
    items: Joi.array().items(itemSchema).max(30).default([]),
    specialHandling: Joi.boolean().default(false),
  })),
  ctrl.quote);

/* Worker — literal paths first */

router.get('/tasks/available', authenticate, requireRole('worker'), ctrl.listAvailable);
router.get('/tasks/assigned', authenticate, requireRole('worker'), ctrl.listAssigned);

/* Customer */

router.post('/tasks',
  authenticate, requireRole('user'),
  validate(Joi.object({
    serviceType: Joi.string().valid(...SERVICE_TYPES).required(),
    title: Joi.string().max(200).allow('', null),
    instructions: Joi.string().max(2000).allow('', null),
    pickupLocation: locationSchema.required(),
    destination: locationSchema.allow(null),
    stops: Joi.array().items(stopSchema).max(5).default([]),
    items: Joi.array().items(itemSchema).max(30).default([]),
    returnDetail: returnDetailSchema.allow(null),
    scheduledAt: Joi.date().allow(null),
    paymentMethod: Joi.string().valid('cash', 'online').default('cash'),
    paymentModel: Joi.string().valid(...OFFERED_PAYMENT_MODELS).default('worker_advance'),
    specialHandling: Joi.boolean().default(false),
    idempotencyKey: Joi.string().max(120).allow(null),
  })),
  ctrl.createTask);

router.get('/tasks', authenticate, requireRole('user'), ctrl.listMyTasks);
router.get('/tasks/:id', authenticate, ctrl.getTask);

router.post('/tasks/:id/approvals/:approvalId',
  authenticate, requireRole('user'),
  validate(Joi.object({ approved: Joi.boolean().required() })),
  ctrl.respondToApproval);

router.post('/tasks/:id/rate',
  authenticate, requireRole('user'),
  validate(Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).allow('', null),
  })),
  ctrl.rateTask);

router.post('/tasks/:id/cancel',
  authenticate, requireRole('user'),
  validate(Joi.object({ reason: Joi.string().max(500).allow('', null) })),
  ctrl.cancelTask);

/* Worker execution */

router.post('/tasks/:id/accept', authenticate, requireRole('worker'), ctrl.acceptTask);

// Rate-limited: a 4-digit code is guessable given enough tries.
const startCodeLimiter = makeLimiter({ windowMs: 5 * 60_000, max: 10, prefix: 'helpcode' });
router.post('/tasks/:id/status',
  authenticate, requireRole('worker'), startCodeLimiter,
  validate(Joi.object({
    status: Joi.string().required(),
    note: Joi.string().max(500).allow('', null),
    code: Joi.string().pattern(/^[0-9]{4,6}$/).allow('', null),
  })),
  ctrl.advanceStatus);

router.patch('/tasks/:id/items/:itemId',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    status: Joi.string().valid(...ITEM_STATUSES).required(),
    // Named explicitly: without it stripUnknown deletes the price and the
    // purchase is recorded as free.
    actualPricePaise: Joi.number().integer().min(0).allow(null),
    reason: Joi.string().max(500).allow('', null),
    receiptKey: Joi.string().max(500).allow('', null),
  })),
  ctrl.updateItem);

router.post('/tasks/:id/items/:itemId/alternative',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    name: Joi.string().max(200).required(),
    brand: Joi.string().max(100).allow('', null),
    variant: Joi.string().max(100).allow('', null),
    quantity: Joi.number().integer().min(1).default(1),
    pricePaise: Joi.number().integer().min(0).required(),
    photoKey: Joi.string().max(500).allow('', null),
    note: Joi.string().max(500).allow('', null),
  })),
  ctrl.proposeAlternative);

router.post('/tasks/:id/advance',
  authenticate, requireRole('worker'),
  validate(Joi.object({ amountPaise: Joi.number().integer().min(1).required() })),
  ctrl.recordAdvance);

router.post('/tasks/:id/proof',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    kind: Joi.string().valid(...PROOF_KINDS).required(),
    key: Joi.string().max(500).required(),
    note: Joi.string().max(500).allow('', null),
    lat: Joi.number().min(-90).max(90).allow(null),
    lng: Joi.number().min(-180).max(180).allow(null),
  })),
  ctrl.addProof);

router.post('/tasks/:id/handover',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    trackingNumber: Joi.string().max(120).allow('', null),
    acknowledgement: Joi.string().max(500).allow('', null),
    proofKeys: Joi.array().items(Joi.string().max(500)).min(1).required(),
  })),
  ctrl.recordHandover);

router.post('/tasks/:id/complete', authenticate, requireRole('worker'), startCodeLimiter,
  validate(Joi.object({ code: Joi.string().pattern(/^[0-9]{4,6}$/).allow('', null), })), ctrl.completeTask);
router.post('/tasks/:id/collect-cash', authenticate, requireRole('worker'), ctrl.collectCash);

module.exports = router;

/* Admin router, mounted under the admin slug */

const adminRouter = express.Router();

adminRouter.get('/tasks', authenticate, requireRole('admin'), ctrl.adminListTasks);
adminRouter.get('/config', authenticate, requireRole('admin'), ctrl.adminGetConfig);

adminRouter.put('/config/:serviceType',
  authenticate, requireRole('admin'),
  validate(Joi.object({
    baseFeePaise: Joi.number().integer().min(0),
    distanceSlabs: Joi.array().items(Joi.object({
      fromKm: Joi.number().min(0).required(),
      toKm: Joi.number().allow(null),
      feePaise: Joi.number().integer().min(0).required(),
      requiresQuote: Joi.boolean().default(false),
    })),
    freeWaitingMinutes: Joi.number().integer().min(0),
    waitingPerMinutePaise: Joi.number().integer().min(0),
    includedStops: Joi.number().integer().min(1),
    additionalStopFeePaise: Joi.number().integer().min(0),
    maxStops: Joi.number().integer().min(1),
    timeExtensionBlockMinutes: Joi.number().integer().min(1),
    timeExtensionFeePaise: Joi.number().integer().min(0),
    specialHandlingFeePaise: Joi.number().integer().min(0),
    matchRadiusKm: Joi.number().min(1).max(50),
    commissionPct: Joi.number().min(0).max(100),
    platformFeePaise: Joi.number().integer().min(0),
    taxPct: Joi.number().min(0).max(100),
    allowedPaymentModels: Joi.array().items(Joi.string().valid(...OFFERED_PAYMENT_MODELS)),
    maxWorkerAdvancePaise: Joi.number().integer().min(0),
    maxItemBudgetPaise: Joi.number().integer().min(0),
    priceTolerancePct: Joi.number().min(0).max(100),
    maxItems: Joi.number().integer().min(1),
    defaultDurationMinutes: Joi.number().integer().min(1),
    restrictedItemCategories: Joi.array().items(Joi.string().max(60)),
    disclaimer: Joi.string().max(1000).allow('', null),
    isActive: Joi.boolean(),
  })),
  ctrl.adminUpdateConfig);

// Platform cancellation, before any work or item money is involved.
adminRouter.post('/tasks/:id/cancel',
  authenticate, requireRole('admin'),
  validate(Joi.object({ reason: Joi.string().trim().min(5).max(300).required() })),
  ctrl.adminCancelTask);

// The ONLY path that may say a refund happened, and only with a reference.
adminRouter.post('/tasks/:id/refund-outcome',
  authenticate, requireRole('admin'),
  validate(Joi.object({
    status: Joi.string().valid('refund_confirmed', 'refund_failed', 'not_applicable').required(),
    externalReference: Joi.string().max(200).allow('', null),
  })),
  ctrl.adminRefundOutcome);

module.exports.adminRouter = adminRouter;
