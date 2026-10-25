const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const City = require('../../seo/city.model');
const auditService = require('../audit.service');

const router = express.Router();

const areaSchema = Joi.object({
  slug: Joi.string().lowercase().trim().min(1).max(80).required(),
  name: Joi.string().trim().min(1).max(100).required(),
});

const cityBody = Joi.object({
  slug:        Joi.string().lowercase().trim().min(2).max(60).required(),
  name:        Joi.string().trim().min(2).max(100).required(),
  state:       Joi.string().trim().min(2).max(100).required(),
  lat:         Joi.number().min(-90).max(90).required(),
  lng:         Joi.number().min(-180).max(180).required(),
  population:  Joi.string().allow('').max(20).default(''),
  description: Joi.string().allow('').max(500).default(''),
  pinCodes:    Joi.array().items(Joi.string().pattern(/^\d{6}$/)).max(20).default([]),
  isActive:    Joi.boolean().default(true),
  live:        Joi.boolean().default(false),
  areas:       Joi.array().items(areaSchema).max(50).default([]),
});

/** GET /cities — list all cities */
router.get('/cities', async (req, res, next) => {
  try {
    const cities = await City.find().sort({ name: 1 }).lean();
    res.json({ cities });
  } catch (err) { next(err); }
});

/** POST /cities — create a city */
router.post(
  '/cities',
  validate(cityBody),
  async (req, res, next) => {
    try {
      const city = await City.create(req.body);
      await auditService.fromRequest(req, 'admin.city_create', { kind: 'city', id: city._id }, null, req.body);
      res.status(201).json({ city });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: `City slug "${req.body.slug}" already exists` });
      next(err);
    }
  }
);

/** PUT /cities/:id — update a city (full replace of areas array) */
router.put(
  '/cities/:id',
  validate(cityBody.fork(['slug', 'name', 'state', 'lat', 'lng'], f => f.optional())),
  async (req, res, next) => {
    try {
      const before = await City.findById(req.params.id).lean();
      if (!before) return res.status(404).json({ error: 'City not found' });
      const city = await City.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
      await auditService.fromRequest(req, 'admin.city_update', { kind: 'city', id: city._id }, before, req.body);
      res.json({ city });
    } catch (err) { next(err); }
  }
);

/** DELETE /cities/:id — delete a city */
router.delete('/cities/:id', async (req, res, next) => {
  try {
    const city = await City.findByIdAndDelete(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    await auditService.fromRequest(req, 'admin.city_delete', { kind: 'city', id: city._id }, city.toObject(), null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** PATCH /cities/:id/active — toggle city on/off */
router.patch('/cities/:id/active', async (req, res, next) => {
  try {
    const city = await City.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: req.body.isActive } },
      { new: true }
    );
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json({ city });
  } catch (err) { next(err); }
});

module.exports = router;
