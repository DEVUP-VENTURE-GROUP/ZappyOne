const express = require('express');
const Joi = require('joi');
const ctrl = require('./lens.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { lensLimiter } = require('../../middlewares/rateLimit');

const router = express.Router();

const uploadUrlSchema = Joi.object({
  contentType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp').required(),
});

const analyzeSchema = Joi.object({
  imageKeys: Joi.array().items(Joi.string().max(300)).min(1).max(3).required(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
});

// Presigned PUT target — client uploads the photo directly to S3.
/** Whether photo search is set up (its AI key), so the app shows the camera only when it works. */
router.get('/status', (req, res) => res.json({ enabled: !!require('../../config').lens.apiKey }));

router.post('/upload-url', authenticate, requireRole('user'), lensLimiter, validate(uploadUrlSchema), ctrl.getUploadUrl);

// Analyze uploaded photo(s) → diagnosis + bookable matches + real quote.
router.post('/analyze', authenticate, requireRole('user'), lensLimiter, validate(analyzeSchema), ctrl.analyze);

// Read a past scan (owner only) — used by the booking page to hydrate notes + photo.
router.get('/scan/:id', authenticate, requireRole('user'), ctrl.getScan);

module.exports = router;
