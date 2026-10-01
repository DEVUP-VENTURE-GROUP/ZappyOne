const express = require('express');
const Joi = require('joi');
const ctrl = require('./kyc.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

const kycSubmitSchema = Joi.object({
  aadhaarUrl: Joi.string().required(),
  // Optional: a bench technician need not drive. Aadhaar + live selfie prove who they are.
  licenseUrl: Joi.string().allow('', null),
  selfieUrl:  Joi.string().required(),
  selfieMetadata: Joi.object({
    capturedAt:    Joi.string().isoDate().optional(),
    captureMethod: Joi.string().valid('live_camera', 'upload').optional(),
    lat:           Joi.number().min(-90).max(90).allow(null).optional(),
    lng:           Joi.number().min(-180).max(180).allow(null).optional(),
    geoStatus:     Joi.string().optional(),
    userAgent:     Joi.string().max(300).optional(),
  }).optional(),
});

router.post('/submit', authenticate, requireRole('worker'), validate(kycSubmitSchema), ctrl.submitKyc);
router.get('/status', authenticate, requireRole('worker'), ctrl.getKycStatus);

// Stream worker's own KYC doc — permanent, no URL expiry
router.get('/stream/:docType', authenticate, requireRole('worker'), ctrl.streamMyDoc);

// Request document change (admin must approve before re-upload allowed)
router.post(
  '/request-change',
  authenticate,
  requireRole('worker'),
  validate(Joi.object({ message: Joi.string().min(10).max(500).required() })),
  ctrl.requestDocumentChange,
);

module.exports = router;
