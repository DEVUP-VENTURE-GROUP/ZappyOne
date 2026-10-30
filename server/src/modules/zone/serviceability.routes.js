const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { makeLimiter } = require('../../middlewares/rateLimit');
const { serviceabilityAt } = require('../onboarding/coverage.service');
const LaunchInterest = require('./launch-interest.model');

const router = express.Router();
const checkLimiter = makeLimiter({ windowMs: 60_000, max: 60, prefix: 'svc' });
const notifyLimiter = makeLimiter({ windowMs: 3_600_000, max: 10, prefix: 'svcnotify' });

const point = {
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
};

/** Public: the home page asks this before showing anything bookable. */
router.get('/', checkLimiter, validate(Joi.object(point), 'query'), async (req, res, next) => {
  try {
    res.json(await serviceabilityAt(req.query));
  } catch (err) { next(err); }
});

/** "Notify me when you launch here" — idempotent per customer per ~1 km cell. */
router.post(
  '/notify',
  notifyLimiter,
  authenticate,
  requireRole('user'),
  validate(Joi.object({ ...point, address: Joi.string().max(300).allow('').default('') })),
  async (req, res, next) => {
    try {
      const { lat, lng, address } = req.body;
      const cell = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      await LaunchInterest.updateOne(
        { userId: req.auth.sub, cell },
        { $setOnInsert: { location: { type: 'Point', coordinates: [lng, lat] }, address } },
        { upsert: true },
      );
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

module.exports = router;
