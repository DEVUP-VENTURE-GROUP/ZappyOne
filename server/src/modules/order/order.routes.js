const express = require('express');
const Joi = require('joi');
const ctrl = require('./order.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { orderLimiter, cancelLimiter, ratingLimiter, quoteLimiter } = require('../../middlewares/rateLimit');

const router = express.Router();

const pickupLocationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  address: Joi.string().max(500).required(),
  landmark: Joi.string().max(200).allow('', null),
  flatNumber: Joi.string().max(100).allow('', null),
  notes: Joi.string().max(500).allow('', null),
});

const locationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  address: Joi.string().max(500).required(),
});

// ─── DISABLED VERTICALS (commented out — architecture preserved, not deleted) ───
// Generic Home Services → replaced by specialised assistance ecosystems
// 'plumbing', 'electrical', 'helper', 'carpenter', 'ac_repair', 'cleaning', 'painting',
// 'delivery', 'laundry', 'beauty', 'gardening', 'security', 'appliance', 'internet',
// Generic Construction Services → replaced by specialised crew marketplace
// 'mason',
// ────────────────────────────────────────────────────────────────────────────────

const ALL_SERVICES = [
  // ── ELECTRONICS RESCUE NETWORK ──────────────────────────────────────────────
  // Mobile Phones
  'screen_replacement', 'battery_replacement', 'charging_issue',
  'speaker_mic_issue', 'microphone_issue', 'software_issue',
  'water_damage', 'camera_issue', 'data_recovery', 'device_not_turning_on',
  // Laptops
  'laptop_slow', 'laptop_ssd_upgrade', 'laptop_ram_upgrade',
  'laptop_keyboard_issue', 'laptop_motherboard_issue', 'laptop_charging_issue',
  'laptop_screen_issue', 'laptop_virus_removal', 'laptop_data_recovery',
  // Smart Devices
  'smart_tv_install', 'smart_tv_repair', 'router_setup', 'router_troubleshoot',
  'cctv_install', 'cctv_repair', 'smart_lock_install', 'home_automation_setup',

  // ── VEHICLE CARE NETWORK ─────────────────────────────────────────────────────
  // Bike
  'puncture', 'bike_chain_issue', 'bike_brake_issue', 'bike_battery_issue',
  'bike_wash', 'bike_breakdown', 'bike_service',
  // Car
  'car_wash', 'car_detailing', 'battery_jump_start', 'car_puncture',
  'car_breakdown', 'fuel_delivery', 'car_service',
  // Towing — disabled vehicle picked up and towed to a destination
  'car_towing', 'bike_towing',
  // Commercial Vehicles
  'commercial_emergency', 'commercial_scheduled_maintenance', 'fleet_support',
  'auto_repair', 'van_repair',

  // ── FAMILY ASSIST NETWORK ────────────────────────────────────────────────────
  'medicine_pickup', 'hospital_companion', 'grocery_assistance',
  'bill_payment_assist', 'document_submission', 'home_visit_check',

  // ── ELDER ASSIST NETWORK ─────────────────────────────────────────────────────
  'elder_doctor_visit', 'elder_companion', 'elder_home_visit', 'elder_transport',

  // ── EVENT CREW MARKETPLACE ───────────────────────────────────────────────────
  'event_decorator', 'event_setup_crew', 'event_cleaning_crew',
  'event_helper', 'event_sound_crew', 'event_lighting_crew',
  'event_security_crew', 'event_birthday_setup', 'event_wedding_setup',
  'event_photography_assist', 'event_catering_assist',

  // ── PET ASSISTANCE NETWORK ───────────────────────────────────────────────────
  'pet_grooming', 'pet_walking', 'pet_transport',
  'pet_sitting', 'pet_vet_assist', 'pet_training_assist',

  // ── TANK & WATER CLEANING ────────────────────────────────────────────────────
  'water_tank_cleaning', 'overhead_tank_cleaning',
  'underground_sump_cleaning', 'sintex_tank_cleaning',
];

const createOrderSchema = Joi.object({
  service: Joi.string().valid(...ALL_SERVICES).required(),
  subCategory: Joi.string().max(100).allow('', null),
  description: Joi.string().max(500).allow(''),
  images: Joi.array().items(Joi.string()).max(5).default([]),
  scheduledAt: Joi.date().iso().greater('now').optional().allow(null),
  pickupLocation: pickupLocationSchema.required(),
  dropLocation: locationSchema.optional(),
  paymentMethod: Joi.string().valid('cash', 'upi', 'card').default('upi'),
  priority: Joi.string().valid('normal', 'emergency').default('normal'),
  // Device extras
  deviceBrand: Joi.string().max(50).allow('', null),
  deviceModel: Joi.string().max(100).allow('', null),
  deviceSeries: Joi.string().max(100).allow('', null),
  partsTier: Joi.string().valid('OEM', 'Premium', 'Compatible', 'Budget').allow('', null),
  serviceMode: Joi.string().valid('doorstep', 'pickup').default('doorstep'),
  // Vehicle extras
  vehicleType: Joi.string().valid('bike', 'scooter', 'car').allow('', null),
  // Construction extras
  pricingModel: Joi.string().valid('standard', 'hourly', 'project').default('standard'),
  estimatedHours: Joi.number().min(0.5).max(24).optional(),
  // Event / team bookings
  teamSize: Joi.number().integer().min(1).max(20).default(1),
  // Diagnosis (electronics vertical)
  diagnosisAnswers: Joi.object().unknown(true).optional(),
  diagnosisUrgency: Joi.string().valid('normal', 'high', 'urgent').default('normal'),
  // Promo
  promoCode: Joi.string().max(30).allow('', null),
  // Surge price protection: client sends the tier-adjusted quoted total it showed the user.
  // Server rejects if fresh quote differs by more than 20% (surge changed).
  quotedTotalRupees: Joi.number().min(0).optional(),
  // Booking tier — determines price multiplier and dispatch speed
  tier: Joi.string().valid('standard', 'priority', 'express').default('standard'),
  // Pre-acceptance tip/boost (₹, integer) — 100% credited to worker
  tipAmount: Joi.number().integer().min(0).max(500).default(0),
  // Worker-choice: customer picked this pro at checkout — dispatch offers them first.
  preferredWorkerId: Joi.string().pattern(/^[a-f0-9]{24}$/i).optional().allow('', null),
});

const quoteSchema = Joi.object({
  service: Joi.string().valid(...ALL_SERVICES).required(),
  pickupLat: Joi.number().required(),
  pickupLng: Joi.number().required(),
  dropLat: Joi.number().optional(),
  dropLng: Joi.number().optional(),
  deviceBrand: Joi.string().max(50).allow('', null),
  deviceModel: Joi.string().max(100).allow('', null),
  deviceSeries: Joi.string().max(100).allow('', null),
  partsTier: Joi.string().valid('OEM', 'Premium', 'Compatible', 'Budget').allow('', null),
  vehicleType: Joi.string().allow('', null),
  pricingModel: Joi.string().valid('standard', 'hourly', 'project').optional(),
  estimatedHours: Joi.number().optional(),
});

const rateSchema = Joi.object({
  rating: Joi.number().min(1).max(5).required(),
  review: Joi.string().max(500).allow(''),
});

router.get('/quote', authenticate, requireRole('user'), quoteLimiter, validate(quoteSchema, 'query'), ctrl.getQuote);
// Worker-choice: top-ranked available pros near the pickup (optional picker at checkout).
router.get('/nearby-pros', authenticate, requireRole('user'), quoteLimiter, validate(Joi.object({
  service: Joi.string().valid(...ALL_SERVICES).required(),
  lat: Joi.number().required(),
  lng: Joi.number().required(),
}), 'query'), ctrl.nearbyPros);

// ZeroWait L2 — Warm Dispatch: pre-check the Ready Pool at checkout so we can
// promise an instant match BEFORE the customer pays. Notifies no workers.
router.get('/warm', authenticate, requireRole('user'), quoteLimiter, validate(Joi.object({
  service: Joi.string().valid(...ALL_SERVICES).required(),
  lat: Joi.number().required(),
  lng: Joi.number().required(),
}), 'query'), ctrl.warmDispatch);
router.post('/', authenticate, requireRole('user'), orderLimiter, validate(createOrderSchema), ctrl.createOrder);
router.get('/mine', authenticate, requireRole('user'), ctrl.listMine);
// One-click rebook — clones a past order and re-places it (fresh pricing/dispatch).
router.post('/:id/rebook', authenticate, requireRole('user'), orderLimiter, ctrl.rebookOrder);
router.get('/:id', authenticate, ctrl.getOne);
router.get('/:id/cancel-preview', authenticate, requireRole('user'), ctrl.getCancelPreview);
router.get('/:id/invoice', authenticate, requireRole('user'), ctrl.getInvoice);
router.post('/:id/cancel', authenticate, requireRole('user'), cancelLimiter, validate(Joi.object({ reason: Joi.string().max(200).allow('', null) })), ctrl.cancelOrder);

// User can correct their pickup pin while the worker hasn't departed yet.
router.patch(
  '/:id/pickup-location',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    lat:      Joi.number().min(-90).max(90).required(),
    lng:      Joi.number().min(-180).max(180).required(),
    address:  Joi.string().max(500).required(),
    landmark: Joi.string().max(200).allow('', null),
    notes:    Joi.string().max(500).allow('', null),
  })),
  ctrl.updatePickupLocation,
);
router.patch(
  '/:id/reschedule',
  authenticate,
  requireRole('user'),
  validate(Joi.object({ scheduledAt: Joi.date().iso().greater('now').required() })),
  ctrl.rescheduleOrder,
);
router.post('/:id/rate', authenticate, requireRole('user'), ratingLimiter, validate(rateSchema), ctrl.rateOrder);
router.post('/:id/rate-user', authenticate, requireRole('worker'), ratingLimiter, validate(rateSchema), ctrl.workerRateUser);
router.get('/:id/timeline', authenticate, ctrl.getTimeline);
router.post('/:id/accept', authenticate, requireRole('worker'), ctrl.acceptOffer);
router.post('/:id/reject', authenticate, requireRole('worker'), ctrl.rejectOffer);
router.post('/:id/start-trip', authenticate, requireRole('worker'), ctrl.startTrip);
router.post(
  '/:id/arrived',
  authenticate,
  requireRole('worker'),
  validate(Joi.object({
    lat: Joi.number().min(-90).max(90).optional(),
    lng: Joi.number().min(-180).max(180).optional(),
  })),
  ctrl.arrive,
);
router.post('/:id/start-service', authenticate, requireRole('worker'), validate(Joi.object({ otp: Joi.string().length(6).required() })), ctrl.startService);
router.post('/:id/complete', authenticate, requireRole('worker'), validate(Joi.object({ completionPhotos: Joi.array().items(Joi.string()).max(5).default([]) })), ctrl.completeOrder);
router.get('/:id/worker-cancel-preview', authenticate, requireRole('worker'), ctrl.workerCancelPreview);
router.post('/:id/worker-cancel', authenticate, requireRole('worker'), validate(Joi.object({ reason: Joi.string().max(300).allow('', null) })), ctrl.workerCancelOrder);

// Worker reports customer didn't respond — penalty-free cancel with arrival fee charged to customer. (#73)
router.post('/:id/no-response', authenticate, requireRole('worker'), ctrl.workerReportNoResponse);

// Worker reports spare part unavailable — diagnostic fee credited, order closed. (#71)
router.post('/:id/part-unavailable', authenticate, requireRole('worker'),
  validate(Joi.object({ partName: Joi.string().max(120).required(), notes: Joi.string().max(500).allow('', null) })),
  ctrl.workerReportPartUnavailable
);

// Customer reports worker misconduct (harassment, safety concern) — lower friction than dispute. (#89)
router.post('/:id/report-worker', authenticate, requireRole('user'),
  validate(Joi.object({
    category: Joi.string().valid('rude_behavior', 'safety_concern', 'inappropriate_contact', 'property_damage', 'other').required(),
    description: Joi.string().min(10).max(1000).required(),
  })),
  ctrl.reportWorker
);

module.exports = router;
