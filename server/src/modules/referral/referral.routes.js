const express = require('express');
const Joi = require('joi');
const ctrl = require('./referral.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

router.get('/me', authenticate, ctrl.getMyCode);
router.get('/history', authenticate, ctrl.getHistory);
router.get('/partner', authenticate, requireRole('worker', 'shop'), ctrl.getPartnerCard);
router.post('/apply', authenticate, validate(Joi.object({ code: Joi.string().required() })), ctrl.applyCode);

module.exports = router;
