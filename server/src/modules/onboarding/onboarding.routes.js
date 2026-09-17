const express = require('express');
const Joi = require('joi');
const ctrl = require('./onboarding.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

/**
 * Provider onboarding routes.
 *
 * Open to both provider actors — a shop owner and an independent technician
 * walk the same path and differ only in which documents they are asked for.
 * Which of the two is calling is read from the token inside the controller.
 */

const router = express.Router();
const providerOnly = [authenticate, requireRole('shop', 'worker')];

/**
 * The customer-facing catalog is public: the home page renders before
 * anyone signs in, and what we offer is not a secret. Everything below it
 * is provider-scoped.
 */
router.get('/catalog', ctrl.liveCatalog);

router.get('/status', ...providerOnly, ctrl.status);

router.get('/domains', ...providerOnly, ctrl.listDomains);
router.get('/lines', ...providerOnly, ctrl.listLines);
router.get('/enrolments', ...providerOnly, ctrl.myEnrolments);
router.get('/lines/:lineCode/requirements', ...providerOnly, ctrl.getRequirements);

router.post(
  '/enrolments',
  ...providerOnly,
  validate(Joi.object({ lineCode: Joi.string().max(60).required() })),
  ctrl.enrol,
);

router.patch(
  '/enrolments/:id',
  ...providerOnly,
  validate(Joi.object({
    documents: Joi.array().items(Joi.object({
      code: Joi.string().max(60).required(),
      url: Joi.string().max(500).required(),
      captureMethod: Joi.string().valid('live_camera', 'upload'),
      capturedAt: Joi.date(),
      lat: Joi.number().min(-90).max(90),
      lng: Joi.number().min(-180).max(180),
    })).default([]),
    fields: Joi.array().items(Joi.object({
      code: Joi.string().max(60).required(),
      value: Joi.string().max(300).allow('', null),
    })).default([]),
    acceptedDeclarations: Joi.boolean(),
  })),
  ctrl.saveSubmission,
);

router.post('/enrolments/:id/submit', ...providerOnly, ctrl.submitForReview);

router.post(
  '/line-requests',
  ...providerOnly,
  validate(Joi.object({
    domainCode: Joi.string().max(60).allow('', null),
    proposedName: Joi.string().max(120).required(),
    description: Joi.string().max(1000).allow('', null),
  })),
  ctrl.requestLine,
);

module.exports = router;
