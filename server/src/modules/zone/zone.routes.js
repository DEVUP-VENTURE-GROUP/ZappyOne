const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const zoneService = require('./zone.service');
const auditService = require('../admin/audit.service');
const Zone = require('./zone.model');
const LaunchInterest = require('./launch-interest.model');

const router = express.Router();

const OBJECT_ID = /^[a-f0-9]{24}$/;

// GeoJSON polygon: array of linear rings, each ring an array of [lng, lat] pairs.
const polygonSchema = Joi.object({
  type: Joi.string().valid('Polygon').default('Polygon'),
  coordinates: Joi.array()
    .items(
      Joi.array()
        .items(Joi.array().items(Joi.number()).length(2))
        .min(4), // closed ring needs >= 4 points (first == last)
    )
    .min(1)
    .required(),
}).required();

const createSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  city: Joi.string().min(2).max(120).required(),
  description: Joi.string().max(500).optional().allow(''),
  polygon: polygonSchema,
  status: Joi.string().valid(...Zone.STATUSES).optional(),
  surgeMultiplierOverride: Joi.number().min(1).max(5).optional().allow(null),
  pricingMultiplier: Joi.number().min(0.5).max(3).optional(),
  enabledServices: Joi.array().items(Joi.string()).optional(),
  disabledServices: Joi.array().items(Joi.string()).optional(),
  minWorkerRating: Joi.number().min(0).max(5).optional(),
  color: Joi.string().max(20).optional(),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120).optional(),
  city: Joi.string().min(2).max(120).optional(),
  description: Joi.string().max(500).optional().allow(''),
  polygon: polygonSchema.optional(),
  status: Joi.string().valid(...Zone.STATUSES).optional(),
  surgeMultiplierOverride: Joi.number().min(1).max(5).optional().allow(null),
  pricingMultiplier: Joi.number().min(0.5).max(3).optional(),
  enabledServices: Joi.array().items(Joi.string()).optional(),
  disabledServices: Joi.array().items(Joi.string()).optional(),
  minWorkerRating: Joi.number().min(0).max(5).optional(),
  color: Joi.string().max(20).optional(),
}).min(1);

// GET /zones — list all
router.get('/zones', async (req, res, next) => {
  try {
    const zones = await zoneService.getAllZones();
    res.json({ zones, total: zones.length });
  } catch (err) { next(err); }
});

// GET /zones/point?lng=&lat= — which zone contains this point
router.get(
  '/zones/point',
  validate(Joi.object({ lng: Joi.number().required(), lat: Joi.number().required() }), 'query'),
  async (req, res, next) => {
    try {
      const zone = await zoneService.getZoneForPoint(req.query.lng, req.query.lat);
      res.json({ zone });
    } catch (err) { next(err); }
  },
);

// POST /zones — create
router.post('/zones', validate(createSchema), async (req, res, next) => {
  try {
    const zone = await zoneService.createZone({ ...req.body, createdBy: req.auth?.email || req.auth?.sub });
    await auditService.fromRequest(req, 'admin.zone_create', { kind: 'zone', id: zone._id }, null, { name: zone.name, city: zone.city });
    res.status(201).json({ ok: true, zone });
  } catch (err) { next(err); }
});

// PUT /zones/:id — update
router.put('/zones/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!OBJECT_ID.test(id)) return res.status(400).json({ error: 'Invalid zone ID' });
    const zone = await zoneService.updateZone(id, req.body);
    await auditService.fromRequest(req, 'admin.zone_update', { kind: 'zone', id }, null, req.body);
    res.json({ ok: true, zone });
  } catch (err) { next(err); }
});

// DELETE /zones/:id — delete
router.delete('/zones/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!OBJECT_ID.test(id)) return res.status(400).json({ error: 'Invalid zone ID' });
    await zoneService.deleteZone(id);
    await auditService.fromRequest(req, 'admin.zone_delete', { kind: 'zone', id }, null, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /launch-interest — where customers asked us to launch, busiest ~1 km cells first
router.get('/launch-interest', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - Math.min(Number(req.query.days) || 90, 365) * 86_400_000);
    const [cells, total] = await Promise.all([
      LaunchInterest.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: '$cell',
          requests: { $sum: 1 },
          lng: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } },
          lat: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } },
          sampleAddress: { $last: '$address' },
          lastAt: { $max: '$createdAt' },
          notified: { $sum: { $cond: [{ $ne: ['$notifiedAt', null] }, 1, 0] } },
        } },
        { $sort: { requests: -1, lastAt: -1 } },
        { $limit: 200 },
      ]),
      LaunchInterest.countDocuments({ createdAt: { $gte: since } }),
    ]);
    // Whether each area is already served, so ops see unmet demand, not demand already met.
    const zones = await Promise.all(cells.map((c) => zoneService.getActiveZoneForPoint(c.lng, c.lat).catch(() => null)));
    res.json({
      total,
      cells: cells.map(({ _id, ...c }, i) => ({ cell: _id, ...c, servedBy: zones[i] ? { id: String(zones[i]._id), name: zones[i].name } : null })),
    });
  } catch (err) { next(err); }
});

// GET /zones/:id/stats — worker + recent order counts
router.get('/zones/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!OBJECT_ID.test(id)) return res.status(400).json({ error: 'Invalid zone ID' });
    const stats = await zoneService.getZoneStats(id);
    res.json(stats);
  } catch (err) { next(err); }
});

module.exports = router;
