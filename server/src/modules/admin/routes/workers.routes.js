const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const ctrl = require('../controllers/workers.controller');
const earningsCtrl = require('../controllers/worker-earnings.controller');

const router = express.Router();

router.get('/workers', ctrl.listWorkers);
router.post('/workers/:id/reset-devices', ctrl.resetWorkerDevices);
router.post('/workers/:id/kyc/verify', ctrl.runKycVerification);
router.post(
  '/workers/:id/block',
  validate(Joi.object({ blocked: Joi.boolean().required() })),
  ctrl.blockWorker,
);
router.post('/workers/:id/kyc/approve', ctrl.approveKyc);
router.post(
  '/workers/:id/kyc/reject',
  validate(Joi.object({ reason: Joi.string().min(3).max(500).required() })),
  ctrl.rejectKyc,
);
router.get('/kyc/pending', ctrl.listKycPending);
router.get('/kyc/change-requests', ctrl.listChangeRequests);
router.post(
  '/workers/:id/kyc/change-request/respond',
  validate(Joi.object({
    decision:     Joi.string().valid('approved', 'denied').required(),
    denialReason: Joi.string().max(300).optional().allow(''),
  })),
  ctrl.respondChangeRequest,
);
router.get('/workers/:id/kyc/docs', ctrl.kycDocUrls);
// Streaming proxy — serves KYC images directly from S3 with no URL expiry
router.get('/workers/:id/kyc/stream/:docType', ctrl.kycStreamDoc);
router.post(
  '/workers/:id/kyc/clarify',
  validate(Joi.object({
    message: Joi.string().min(5).max(500).required(),
    docCodes: Joi.array().items(Joi.string().valid('aadhaarUrl', 'licenseUrl', 'selfieUrl')).default([]),
  })),
  ctrl.kycRequestClarification,
);
router.get('/workers/:id/penalties', ctrl.getWorkerPenaltyStats);

// Worker earnings drill-down
router.get(
  '/workers/:id/earnings',
  validate(
    Joi.object({
      period: Joi.string().valid('daily', 'weekly', 'monthly').optional(),
      from: Joi.date().iso().optional(),
      to: Joi.date().iso().optional(),
    }),
    'query',
  ),
  earningsCtrl.getWorkerEarnings,
);
router.get('/workers/:id/deductions', earningsCtrl.getWorkerDeductions);
router.get('/workers/:id/incentives', earningsCtrl.getWorkerIncentives);
router.get('/workers/:id/timeline', earningsCtrl.getWorkerTimeline);
router.delete(
  '/workers/:id',
  validate(Joi.object({ reason: Joi.string().min(3).max(500).required() })),
  ctrl.deleteWorker,
);

module.exports = router;
