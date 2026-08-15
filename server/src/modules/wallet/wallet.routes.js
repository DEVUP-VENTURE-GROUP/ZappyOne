const express = require('express');
const Joi = require('joi');
const ctrl = require('./wallet.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

router.get('/', authenticate, ctrl.getBalance);
router.get('/dues', authenticate, requireRole('worker'), ctrl.getDues);
router.get(
  '/transactions',
  authenticate,
  validate(Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    reason: Joi.string().optional(),
  }), 'query'),
  ctrl.listTransactions
);
router.post(
  '/topup',
  authenticate,
  validate(Joi.object({
    amountPaise: Joi.number().integer().min(1000).max(10000000).required(),
    // Mobile only — see payment.routes.js's create-order for why.
    returnUrl: Joi.string().uri().max(500).optional(),
  })),
  ctrl.topup
);

module.exports = router;
