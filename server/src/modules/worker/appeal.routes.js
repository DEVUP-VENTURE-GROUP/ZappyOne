const express = require('express');
const Joi = require('joi');
const ctrl = require('./appeal.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

// Workers and shops appeal the same way (a rating, a penalty, a pause, dues…).
router.get('/', authenticate, requireRole('worker', 'shop'), ctrl.listMyAppeals);
router.post(
  '/',
  authenticate,
  requireRole('worker', 'shop'),
  validate(Joi.object({
    type:        Joi.string().valid('rating', 'penalty', 'cancellation', 'order_issue', 'pause', 'dues', 'verification').required(),
    orderId:     Joi.string().hex().length(24).optional().allow(null, ''),
    jobRef:      Joi.string().trim().max(40).allow('', null),
    subject:     Joi.string().min(5).max(200).required(),
    description: Joi.string().min(20).max(2000).required(),
  })),
  ctrl.createAppeal
);
router.get('/:id', authenticate, requireRole('worker', 'shop'), ctrl.getAppeal);

const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));
adminRouter.get('/', ctrl.adminListAppeals);
adminRouter.patch(
  '/:id',
  validate(Joi.object({
    status:    Joi.string().valid('under_review', 'upheld', 'dismissed').required(),
    adminNote: Joi.string().max(1000).allow('', null),
  })),
  ctrl.adminResolveAppeal
);

module.exports = router;
module.exports.adminRouter = adminRouter;
