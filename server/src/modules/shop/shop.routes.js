const express = require('express');
const Joi = require('joi');
const ctrl = require('./shop.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

// ── Customer-facing discovery — any authenticated role can browse ───────────
router.get(
  '/nearby',
  authenticate,
  validate(Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    service: Joi.string().max(60).optional(),
    radiusKm: Joi.number().min(0.5).max(50).optional(),
  }), 'query'),
  ctrl.listNearby,
);
router.get('/:id', authenticate, ctrl.getPublicProfile);

// ── Shop owner's own account — everything below requires role 'shop' ────────
router.use(authenticate, requireRole('shop'));

router.get('/me/profile', ctrl.getMe);
router.patch(
  '/me/profile',
  validate(Joi.object({
    businessName: Joi.string().max(120).optional(),
    category: Joi.string().max(60).optional(),
    services: Joi.array().items(Joi.string().max(60)).optional(),
    address: Joi.object({
      text: Joi.string().max(300).required(),
      landmark: Joi.string().max(150).allow('', null).optional(),
      location: Joi.object({
        coordinates: Joi.array().items(Joi.number()).length(2).required(),
      }).required(),
    }).optional(),
    hours: Joi.array().items(Joi.object({
      day: Joi.number().integer().min(0).max(6).required(),
      opensAt: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('').optional(),
      closesAt: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('').optional(),
      isClosed: Joi.boolean().optional(),
    })).max(7).optional(),
    coverImageUrl: Joi.string().max(500).optional(),
    galleryImages: Joi.array().items(Joi.string().max(500)).max(10).optional(),
    bio: Joi.string().max(1000).allow('', null).optional(),
    yearsActive: Joi.number().min(0).max(100).optional(),
    isActive: Joi.boolean().optional(),
  })),
  ctrl.updateProfile,
);

router.get('/me/kyc/status', ctrl.getKycStatus);
router.post(
  '/me/kyc/submit',
  validate(Joi.object({
    ownerIdUrl: Joi.string().required(),
    shopPhotoUrl: Joi.string().required(),
    selfieUrl: Joi.string().required(),
    gstCertificateUrl: Joi.string().optional(),
    businessRegistrationUrl: Joi.string().optional(),
    gstNumber: Joi.string().max(30).optional(),
    panNumber: Joi.string().max(20).optional(),
  })),
  ctrl.submitKyc,
);

router.get('/me/workers', ctrl.listWorkers);
router.post(
  '/me/workers',
  validate(Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    name: Joi.string().max(100).optional(),
    skills: Joi.array().items(Joi.string().max(60)).optional(),
  })),
  ctrl.addWorker,
);
router.delete('/me/workers/:workerId', ctrl.removeWorker);

router.get(
  '/me/earnings',
  validate(Joi.object({ range: Joi.string().valid('today', 'week', 'month').optional() }), 'query'),
  ctrl.getEarnings,
);

module.exports = router;
