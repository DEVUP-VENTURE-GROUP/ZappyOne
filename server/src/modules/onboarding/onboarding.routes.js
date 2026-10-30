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

// What this partner must still fill in before their dashboard opens (onboarding/profile-check); event partners use it too.
router.get('/profile-status', authenticate, requireRole('shop', 'worker', 'event_partner'), async (req, res, next) => {
  try { res.json(await require('./profile-check').profileStatus(req.auth.role, req.auth.sub)); } catch (err) { next(err); }
});
router.get('/setup-journey', authenticate, requireRole('shop'), async (req, res, next) => {
  try { res.json(await require('./profile-check').setupJourney(req.auth.sub)); } catch (err) { next(err); }
});

// The ServicePro dashboard for this partner's trades (onboarding/workspace); a shop's technician sees their shop's.
router.get('/workspace', ...providerOnly, async (req, res, next) => {
  try {
    let owner = req.auth.role === 'shop' ? { kind: 'shop', id: req.auth.sub } : { kind: 'worker', id: req.auth.sub };
    if (owner.kind === 'worker') {
      const w = await require('../worker/worker.model').findById(req.auth.sub).select('shopId').lean();
      if (w?.shopId) owner = { kind: 'shop', id: String(w.shopId) };
    }
    res.json(await require('./workspace').workspaceFor(owner));
  } catch (err) { next(err); }
});

router.get('/domains', ...providerOnly, ctrl.listDomains);
router.get('/lines', ...providerOnly, ctrl.listLines);
router.get('/enrolments', ...providerOnly, ctrl.myEnrolments);
router.get('/my-documents', ...providerOnly, ctrl.myDocuments);

/* Instant ID check (onboarding/idcheck): automatic with a KYC provider's keys, manual review otherwise. */
const idOwner = (req) => ({ kind: req.auth.role === 'shop' ? 'shop' : 'worker', id: req.auth.sub });
const idLimiter = require('../../middlewares/rateLimit').makeLimiter({ windowMs: 60 * 60_000, max: 8, prefix: 'idcheck' });
router.get('/id-check', ...providerOnly, async (req, res, next) => {
  try { res.json(await require('./idcheck').statusFor(idOwner(req))); } catch (err) { next(err); }
});
router.post('/id-check/aadhaar', ...providerOnly, idLimiter, validate(Joi.object({ aadhaar: Joi.string().trim().min(12).max(14).required() })), async (req, res, next) => {
  try { res.json(await require('./idcheck').startAadhaar({ owner: idOwner(req), aadhaar: req.body.aadhaar })); } catch (err) { next(err); }
});
router.post('/id-check/aadhaar/otp', ...providerOnly, idLimiter, validate(Joi.object({ checkId: Joi.string().hex().length(24).required(), otp: Joi.string().trim().length(6).required() })), async (req, res, next) => {
  try { res.json(await require('./idcheck').submitAadhaarOtp({ owner: idOwner(req), ...req.body })); } catch (err) { next(err); }
});
router.post('/id-check/pan', ...providerOnly, idLimiter, validate(Joi.object({ pan: Joi.string().trim().length(10).required() })), async (req, res, next) => {
  try { res.json(await require('./idcheck').verifyPan({ owner: idOwner(req), pan: req.body.pan })); } catch (err) { next(err); }
});
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
    packages: Joi.array().max(20).items(Joi.object({ name: Joi.string().trim().min(2).max(80).required(), minutes: Joi.number().integer().min(5).max(1440).required(), pricePaise: Joi.number().integer().min(100).max(100000000).required() })).default([]),
  })),
  ctrl.requestLine,
);

module.exports = router;
