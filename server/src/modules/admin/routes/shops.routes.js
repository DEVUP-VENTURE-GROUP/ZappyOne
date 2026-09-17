const express = require('express');
const Joi = require('joi');
const ctrl = require('../controllers/shops.controller');
const { validate } = require('../../../middlewares/validate');

const router = express.Router();

// NOTE: worker KYC uses the bare '/kyc/pending' path — shop's pending-queue
// route is namespaced under /shops/ to avoid colliding with it.
router.get('/shops', ctrl.listShops);
router.get('/shops/kyc/pending', ctrl.listKycPending);
router.get('/shops/:id', ctrl.getShop);
router.get('/shops/:id/kyc/docs', ctrl.kycDocUrls);
router.get('/shops/:id/kyc/stream/:docType', ctrl.kycStreamDoc);
router.post('/shops/:id/kyc/approve', ctrl.approveKyc);
router.post(
  '/shops/:id/kyc/reject',
  validate(Joi.object({ reason: Joi.string().max(500).allow('', null).optional() })),
  ctrl.rejectKyc,
);
router.post(
  '/shops/:id/block',
  validate(Joi.object({ blocked: Joi.boolean().required() })),
  ctrl.blockShop,
);

module.exports = router;
