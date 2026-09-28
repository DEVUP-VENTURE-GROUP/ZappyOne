const express = require('express');
const Joi = require('joi');
const ctrl = require('./pet.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { SPECIES, PET_SIZES, RISK_LEVELS } = require('../service/pet-passport.model');

/**
 * Pet Services API.
 *
 * Literal segments before `/:id` throughout, same reason as everywhere else
 * on this platform: `/bookings/available` must never be swallowed by
 * `/bookings/:id`.
 *
 * Every schema below names every field the service layer reads. `validate`
 * runs with `stripUnknown: true` — an omission here is silent data loss, not
 * a validation error, and that is how a laptop write once landed in mobile.
 */

const router = express.Router();
const objectId = Joi.string().hex().length(24);

const locationSchema = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
  address: Joi.string().max(300).allow('', null),
});

/* Catalog */

router.get('/categories', authenticate, ctrl.listCategories);
router.get('/variants', authenticate, ctrl.listVariants);
router.get('/breeds', authenticate, ctrl.listBreeds);
router.get('/addons', authenticate, ctrl.listAddons);
router.get('/packages', authenticate, ctrl.listPackages);
router.get('/service-areas', authenticate, ctrl.listServiceAreas);
router.get('/compatibility', authenticate, ctrl.checkCompatibility);

/* Pet profiles (§4) */

const petBody = Joi.object({
  name: Joi.string().max(80).required(),
  species: Joi.string().valid(...SPECIES).required(),
  breedCode: Joi.string().max(80).allow('', null),
  breed: Joi.string().max(120).allow('', null),
  gender: Joi.string().valid('male', 'female', 'unknown').allow(null),
  dob: Joi.date().allow(null),
  colour: Joi.string().max(80).allow('', null),
  weight: Joi.number().min(0).max(200).allow(null),
  size: Joi.string().valid(...PET_SIZES).default('medium'),
  photoKey: Joi.string().max(500).allow('', null),
  allergies: Joi.array().items(Joi.string().max(100)).default([]),
  medicalNotes: Joi.string().max(2000).allow('', null),
  specialNeeds: Joi.string().max(1000).allow('', null),
  vetName: Joi.string().max(200).allow('', null),
  vetPhone: Joi.string().max(20).allow('', null),
  preferredVetAddress: Joi.string().max(300).allow('', null),
  emergencyContact: Joi.object({ name: Joi.string().max(100).allow('', null), phone: Joi.string().max(20).allow('', null) }).default({}),
  temperament: Joi.string().valid('calm', 'friendly', 'energetic', 'anxious', 'aggressive', 'unknown').default('unknown'),
  energyLevel: Joi.string().valid('low', 'medium', 'high').default('medium'),
  anxietyLevel: Joi.string().valid(...RISK_LEVELS).default('none'),
  aggressionLevel: Joi.string().valid(...RISK_LEVELS).default('none'),
  biteRisk: Joi.string().valid(...RISK_LEVELS).default('none'),
  escapeRisk: Joi.string().valid(...RISK_LEVELS).default('none'),
  specialHandling: Joi.string().max(1000).allow('', null),
  behaviourNotes: Joi.string().max(1000).allow('', null),
  vaccinationStatus: Joi.string().valid('up_to_date', 'partial', 'not_vaccinated', 'unknown').default('unknown'),
  dietPreferences: Joi.string().max(500).allow('', null),
  feedingInstructions: Joi.string().max(1000).allow('', null),
  walkingInstructions: Joi.string().max(1000).allow('', null),
  groomingPreferences: Joi.string().max(1000).allow('', null),
  ownerNotes: Joi.string().max(1000).allow('', null),
});

router.get('/my-pets', authenticate, requireRole('user'), ctrl.listMyPets);
router.post('/my-pets', authenticate, requireRole('user'), validate(petBody), ctrl.createPet);
router.patch('/my-pets/:id', authenticate, requireRole('user'), validate(petBody.fork(['name', 'species'], (f) => f.optional())), ctrl.updatePet);
router.delete('/my-pets/:id', authenticate, requireRole('user'), ctrl.archivePet);
router.get('/my-pets/:id/history', authenticate, requireRole('user'), ctrl.getPetHistory);

/* Quote & matching */

const petEntrySchema = Joi.object({
  petId: objectId.required(),
  variantCode: Joi.string().max(80).required(),
  addonCodes: Joi.array().items(Joi.string().max(80)).max(10).default([]),
  durationMinutes: Joi.number().integer().min(5).max(480).allow(null),
});

const quoteBody = Joi.object({
  categoryCode: Joi.string().max(60).required(),
  serviceMode: Joi.string().max(40).required(),
  pets: Joi.array().items(petEntrySchema).min(1).max(6).required(),
  checkInAt: Joi.date().allow(null),
  checkOutAt: Joi.date().allow(null),
  visits: Joi.number().integer().min(1).allow(null),
  serviceLocation: locationSchema.allow(null),
  cityCode: Joi.string().max(40).allow(null),
  needsPickup: Joi.boolean().default(false),
  needsReturn: Joi.boolean().default(false),
  specialHandling: Joi.boolean().default(false),
  waitingMinutes: Joi.number().integer().min(0).default(0),
  overtimeMinutes: Joi.number().integer().min(0).default(0),
  couponPaise: Joi.number().integer().min(0).default(0),
  packageCode: Joi.string().max(80).allow(null),
});

router.post('/quote', authenticate, requireRole('user'), validate(quoteBody), ctrl.quote);

router.post('/providers/search', authenticate, requireRole('user'),
  validate(Joi.object({
    categoryCode: Joi.string().max(60).required(),
    variantCode: Joi.string().max(80).required(),
    serviceMode: Joi.string().max(40).required(),
    pets: Joi.array().items(petEntrySchema).min(1).max(6).required(),
    serviceLocation: locationSchema.allow(null),
    checkInAt: Joi.date().allow(null),
    checkOutAt: Joi.date().allow(null),
    serviceAreaCode: Joi.string().max(60).allow(null),
  })),
  ctrl.findProviders);

/* Bookings */

router.post('/bookings', authenticate, requireRole('user'),
  validate(Joi.object({
    categoryCode: Joi.string().max(60).required(),
    serviceMode: Joi.string().max(40).required(),
    pets: Joi.array().items(petEntrySchema).min(1).max(6).required(),
    scheduledAt: Joi.date().allow(null),
    checkInAt: Joi.date().allow(null),
    checkOutAt: Joi.date().allow(null),
    serviceLocation: locationSchema.required(),
    destination: locationSchema.allow(null),
    serviceAreaCode: Joi.string().max(60).allow(null),
    workerId: objectId.allow(null),
    shopId: objectId.allow(null),
    customerInstructions: Joi.string().max(2000).allow('', null),
    paymentMethod: Joi.string().valid('cash', 'online').default('cash'),
    packageCode: Joi.string().max(80).allow(null),
    needsPickup: Joi.boolean().default(false),
    needsReturn: Joi.boolean().default(false),
    specialHandling: Joi.boolean().default(false),
    couponPaise: Joi.number().integer().min(0).default(0),
    idempotencyKey: Joi.string().max(120).allow(null),
  })),
  ctrl.createBooking);

router.get('/bookings', authenticate, requireRole('user'), ctrl.listMyBookings);

router.get('/bookings/available', authenticate, ctrl.listAvailableBookings);
router.get('/bookings/assigned', authenticate, requireRole('worker', 'shop'), ctrl.listAssignedBookings);

router.get('/bookings/:id', authenticate, ctrl.getBooking);

router.post('/bookings/:id/cancel', authenticate, requireRole('user'),
  validate(Joi.object({ reason: Joi.string().max(500).allow('', null) })),
  ctrl.cancelBooking);

router.post('/bookings/:id/rate', authenticate, requireRole('user'),
  validate(Joi.object({ rating: Joi.number().integer().min(1).max(5).required(), comment: Joi.string().max(1000).allow('', null) })),
  ctrl.rateBooking);

/* Worker execution */

router.post('/bookings/:id/accept', authenticate, ctrl.acceptBooking);

router.post('/bookings/:id/status', authenticate,
  validate(Joi.object({ status: Joi.string().required(), note: Joi.string().max(500).allow('', null) })),
  ctrl.advanceStatus);

router.post('/bookings/:id/collect-cash', authenticate, ctrl.collectCash);

router.post('/bookings/:id/proof', authenticate,
  validate(Joi.object({
    kind: Joi.string().max(40).required(),
    key: Joi.string().max(500).required(),
    note: Joi.string().max(500).allow('', null),
    petId: objectId.allow(null),
    lat: Joi.number().min(-90).max(90).allow(null),
    lng: Joi.number().min(-180).max(180).allow(null),
  })),
  ctrl.addProof);

router.patch('/bookings/:id/execution', authenticate,
  validate(Joi.object({
    distanceKm: Joi.number().min(0).allow(null),
    actualMinutes: Joi.number().integer().min(0).allow(null),
    waitingMinutes: Joi.number().integer().min(0).allow(null),
    providerNotes: Joi.string().max(2000).allow('', null),
    observations: Joi.string().max(1000).allow('', null),
    incidentReported: Joi.boolean(),
    incidentDetail: Joi.string().max(1000).allow('', null),
    checklist: Joi.array().items(Joi.object({
      code: Joi.string().required(), label: Joi.string().allow(''), done: Joi.boolean(), note: Joi.string().allow(''),
    })),
  })),
  ctrl.updateExecution);

/* Recurring bookings (§32) */

router.post('/recurring', authenticate, requireRole('user'),
  validate(Joi.object({
    petIds: Joi.array().items(objectId).min(1).required(),
    categoryCode: Joi.string().max(60).required(),
    variantCode: Joi.string().max(80).required(),
    serviceMode: Joi.string().max(40).required(),
    addonCodes: Joi.array().items(Joi.string().max(80)).default([]),
    durationMinutes: Joi.number().integer().min(5).allow(null),
    preferredWorkerId: objectId.allow(null),
    preferredShopId: objectId.allow(null),
    frequency: Joi.string().valid('daily', 'alternate_days', 'weekly', 'custom').required(),
    daysOfWeek: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
    timeOfDay: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().allow(null),
    totalOccurrences: Joi.number().integer().min(1).allow(null),
    serviceLocation: locationSchema.required(),
    customerInstructions: Joi.string().max(2000).allow('', null),
    packageCode: Joi.string().max(80).allow(null),
  })),
  ctrl.createRecurring);

router.get('/recurring', authenticate, requireRole('user'), ctrl.listMyRecurring);
router.post('/recurring/:id/pause', authenticate, requireRole('user'), ctrl.pauseRecurring);
router.post('/recurring/:id/resume', authenticate, requireRole('user'), ctrl.resumeRecurring);
router.post('/recurring/:id/cancel', authenticate, requireRole('user'), ctrl.cancelRecurring);
router.post('/recurring/:id/skip', authenticate, requireRole('user'),
  validate(Joi.object({ date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required() })),
  ctrl.skipRecurringDate);

module.exports = router;

/* Admin router, mounted under the admin slug */

const adminRouter = express.Router();

adminRouter.get('/bookings', authenticate, requireRole('admin'), ctrl.adminListBookings);
// A platform cancellation: the customer is never charged for it.
adminRouter.post('/bookings/:id/cancel', authenticate, requireRole('admin'),
  validate(Joi.object({ reason: Joi.string().trim().min(5).max(300).required() })),
  async (req, res, next) => {
    try {
      const bookingService = require('./services/booking.service');
      res.json(await bookingService.cancelBooking({ bookingId: req.params.id, actorId: req.auth.sub, by: 'admin', reason: req.body.reason }));
    } catch (err) { next(err); }
  });
adminRouter.get('/pricing', authenticate, requireRole('admin'), ctrl.adminGetPricing);
adminRouter.put('/pricing/:id', authenticate, requireRole('admin'),
  validate(Joi.object({
    basePaise: Joi.number().integer().min(0),
    perMinutePaise: Joi.number().integer().min(0),
    perNightPaise: Joi.number().integer().min(0),
    perDayPaise: Joi.number().integer().min(0),
    perVisitPaise: Joi.number().integer().min(0),
    perKmPaise: Joi.number().integer().min(0),
    includedKm: Joi.number().min(0),
    sizeMultipliers: Joi.object({
      small: Joi.number().min(0.1), medium: Joi.number().min(0.1),
      large: Joi.number().min(0.1), extra_large: Joi.number().min(0.1),
    }),
    applyBreedComplexity: Joi.boolean(),
    maxBreedComplexity: Joi.number().min(1),
    additionalPetPct: Joi.number().min(0).max(200),
    waitingFreeMinutes: Joi.number().integer().min(0),
    waitingPerMinutePaise: Joi.number().integer().min(0),
    overtimeBlockMinutes: Joi.number().integer().min(1),
    overtimeBlockPaise: Joi.number().integer().min(0),
    pickupPaise: Joi.number().integer().min(0),
    returnPaise: Joi.number().integer().min(0),
    specialHandlingPaise: Joi.number().integer().min(0),
    peakMultiplier: Joi.number().min(1).max(3),
    holidayMultiplier: Joi.number().min(1).max(3),
    weeklyDiscountPct: Joi.number().min(0).max(100),
    weeklyThresholdNights: Joi.number().integer().min(1),
    monthlyDiscountPct: Joi.number().min(0).max(100),
    monthlyThresholdNights: Joi.number().integer().min(1),
    commissionPct: Joi.number().min(0).max(100),
    platformFeePaise: Joi.number().integer().min(0),
    taxPct: Joi.number().min(0).max(100),
    minPaise: Joi.number().integer().min(0),
    maxPaise: Joi.number().integer().min(0),
    isActive: Joi.boolean(),
  })),
  ctrl.adminUpdatePricing);

adminRouter.get('/capabilities', authenticate, requireRole('admin'), ctrl.adminListCapabilities);
adminRouter.put('/capabilities/:id', authenticate, requireRole('admin'),
  validate(Joi.object({
    verificationStatus: Joi.string().valid('pending', 'document_review', 'verified', 'rejected', 'suspended'),
    boardingCapacity: Joi.number().integer().min(0),
    daycareCapacity: Joi.number().integer().min(0),
    handlesAggressive: Joi.boolean(),
    handlesSpecialNeeds: Joi.boolean(),
    isActive: Joi.boolean(),
  })),
  ctrl.adminUpdateCapability);

module.exports.adminRouter = adminRouter;
