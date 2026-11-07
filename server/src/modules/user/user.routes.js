const express = require('express');
const Joi = require('joi');
const ctrl = require('./user.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

router.get('/me', authenticate, requireRole('user'), ctrl.getMe);

router.patch(
  '/me',
  authenticate,
  requireRole('user'),
  validate(Joi.object({ name: Joi.string().max(100), email: Joi.string().email(), defaultPayment: Joi.string().valid('cash', 'upi', 'card') })),
  ctrl.updateMe
);

router.get('/addresses', authenticate, requireRole('user'), ctrl.getAddresses);

router.post(
  '/addresses',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    label: Joi.string().max(50).required(),
    address: Joi.string().max(500).required(),
    lat: Joi.number().required(),
    lng: Joi.number().required(),
    landmark: Joi.string().max(200).allow('', null),
    flatNumber: Joi.string().max(100).allow('', null),
    notes: Joi.string().max(500).allow('', null),
    tag: Joi.string().valid('home', 'work', 'other').default('other'),
  })),
  ctrl.addAddress
);

router.delete('/addresses/:addrId', authenticate, requireRole('user'), ctrl.deleteAddress);

router.patch(
  '/addresses/:addrId',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    label: Joi.string().max(50),
    address: Joi.string().max(500),
    lat: Joi.number(),
    lng: Joi.number(),
    landmark: Joi.string().max(200).allow('', null),
    flatNumber: Joi.string().max(100).allow('', null),
    notes: Joi.string().max(500).allow('', null),
    tag: Joi.string().valid('home', 'work', 'other'),
  }).min(1)),
  ctrl.editAddress
);

router.patch('/addresses/:addrId/default', authenticate, requireRole('user'), ctrl.setDefaultAddress);

router.get('/payment-methods', authenticate, requireRole('user'), ctrl.listPaymentMethods);
router.post(
  '/payment-methods',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    type: Joi.string().valid('card', 'upi', 'netbanking').required(),
    last4: Joi.string().length(4),
    network: Joi.string().valid('Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners', 'Unknown'),
    cardName: Joi.string().max(100).allow('', null),
    expiryMM: Joi.number().integer().min(1).max(12),
    expiryYY: Joi.number().integer().min(24).max(99),
    upiId: Joi.string().max(100),
    upiProvider: Joi.string().max(50).allow('', null),
  })),
  ctrl.addPaymentMethod
);
router.delete('/payment-methods/:methodId', authenticate, requireRole('user'), ctrl.deletePaymentMethod);
router.patch('/payment-methods/:methodId/default', authenticate, requireRole('user'), ctrl.setDefaultPaymentMethod);

router.get('/me/notification-prefs', authenticate, requireRole('user'), ctrl.getNotificationPrefs);
router.patch(
  '/me/notification-prefs',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    orderUpdates:  Joi.boolean(),
    workerArrival: Joi.boolean(),
    payments:      Joi.boolean(),
    disputes:      Joi.boolean(),
    promotions:    Joi.boolean(),
    marketing:     Joi.boolean(),
  }).min(1)),
  ctrl.updateNotificationPrefs
);

router.get('/spending', authenticate, requireRole('user'), ctrl.getSpending);

router.delete('/me', authenticate, requireRole('user'), ctrl.deleteAccount);

router.post(
  '/recent-location',
  authenticate,
  requireRole('user'),
  validate(Joi.object({
    address: Joi.string().max(500).required(),
    lat: Joi.number().required(),
    lng: Joi.number().required(),
  })),
  ctrl.saveRecentLocation
);

// Every signed-in account saves its token here (customers, shop owners, event partners); before, a shop's token was written to a customer record that did not exist.
router.post(
  '/device-token',
  authenticate,
  validate(Joi.object({ token: Joi.string().max(1000).required(), platform: Joi.string().valid('android', 'android-native', 'ios', 'web').optional() })),
  async (req, res, next) => {
    try {
      const saved = await require('../notification/devices').saveToken(req.auth.role, req.auth.sub, req.body.token, req.body.platform);
      res.json({ ok: saved });
    } catch (err) { next(err); }
  },
);

module.exports = router;
