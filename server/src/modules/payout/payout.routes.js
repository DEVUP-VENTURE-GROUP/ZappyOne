const express = require('express');
const Joi = require('joi');
const ctrl = require('./payout.controller');
const payoutService = require('./payout.service');
const { authenticate, requireRole, requireRecentOtp } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

router.post(
  '/request',
  authenticate,
  requireRole('worker'),
  requireRecentOtp,          // must have re-verified OTP within 10 min
  validate(Joi.object({
    amountPaise: Joi.number().integer().min(payoutService.MIN_PAYOUT_PAISE).max(payoutService.MAX_PAYOUT_PAISE).required(),
    method: Joi.string().valid('upi', 'bank', 'manual').required(),
    upiId: Joi.string().when('method', { is: 'upi', then: Joi.required() }),
    bankAccount: Joi.string().when('method', { is: 'bank', then: Joi.required() }),
    bankIfsc: Joi.string().when('method', { is: 'bank', then: Joi.required() }),
    accountName: Joi.string().max(100).allow('').optional(),
  })),
  ctrl.requestPayout
);

router.get('/mine', authenticate, requireRole('worker'), ctrl.listMine);

module.exports = router;
