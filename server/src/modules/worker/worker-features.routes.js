/**
 * Worker Feature Routes — SOS, Earned Wage Access, Emergency Fund, Area Notes
 * Mounted at /api/workers/* via routes/index.js
 */

const express = require('express');
const Joi     = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { authLimiter } = require('../../middlewares/rateLimit');

const router = express.Router();

/* Feature 2: Worker SOS */
router.post('/sos',
  authenticate, requireRole('worker'), authLimiter,
  validate(Joi.object({
    lat:     Joi.number().optional(),
    lng:     Joi.number().optional(),
    orderId: Joi.string().hex().length(24).optional().allow(null, ''),
    // Any other job kind (repair, pet, helping); the server checks it is theirs.
    jobId:   Joi.string().hex().length(24).optional().allow(null, ''),
    // Listed so validation keeps it: a pet emergency routes differently.
    type:    Joi.string().valid('worker_sos', 'pet_emergency').optional(),
    message: Joi.string().max(300).optional(),
  })),
  async (req, res, next) => {
    try {
      const sosService = require('./sos.service');
      const result = await sosService.triggerSOS({
        workerId: req.auth.sub,
        lat:      req.body.lat,
        lng:      req.body.lng,
        orderId:  req.body.orderId,
        jobId:    req.body.jobId,
        type:     req.body.type,
        message:  req.body.message,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.post('/emergency-contact',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    name:  Joi.string().min(2).max(100).required(),
    phone: Joi.string().min(10).max(15).required(),
  })),
  async (req, res, next) => {
    try {
      const sosService = require('./sos.service');
      await sosService.updateEmergencyContact({ workerId: req.auth.sub, ...req.body });
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

/* Feature 5: Earned Wage Access */
router.get('/earned-wage', authenticate, requireRole('worker'), async (req, res, next) => {
  try {
    const ewSvc = require('./earned-wage.service');
    const data  = await ewSvc.getTodayEarnings(req.auth.sub);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/earned-wage/advance',
  authenticate, requireRole('worker'), authLimiter,
  async (req, res, next) => {
    try {
      const ewSvc = require('./earned-wage.service');
      const result = await ewSvc.requestAdvance(req.auth.sub);
      res.json(result);
    } catch (err) { next(err); }
  }
);

/* Feature 9: Worker Emergency Fund */
router.get('/emergency-fund/claims', authenticate, requireRole('worker'), async (req, res, next) => {
  try {
    const efSvc  = require('./emergency-fund.service');
    const claims = await efSvc.getMyClaims(req.auth.sub);
    const fund   = await efSvc.getFundBalance();
    res.json({ claims, fund });
  } catch (err) { next(err); }
});

router.post('/emergency-fund/claim',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    reason:         Joi.string().min(20).max(500).required(),
    category:       Joi.string().valid('medical', 'family', 'equipment', 'accident', 'other').required(),
    requestedPaise: Joi.number().integer().min(10000).max(500000).required(),
  })),
  async (req, res, next) => {
    try {
      const efSvc = require('./emergency-fund.service');
      const claim = await efSvc.submitClaim({ workerId: req.auth.sub, ...req.body });
      res.status(201).json({ claim });
    } catch (err) { next(err); }
  }
);

/* Feature 10: Area Safety Notes */
router.post('/area-notes',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    lat:  Joi.number().required(),
    lng:  Joi.number().required(),
    kind: Joi.string().valid('safe', 'caution', 'access_issue').required(),
    note: Joi.string().max(150).optional().allow('', null),
  })),
  async (req, res, next) => {
    try {
      const anSvc  = require('./area-note.service');
      const result = await anSvc.submitNote({ workerId: req.auth.sub, ...req.body });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.get('/area-notes', authenticate, async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const anSvc = require('./area-note.service');
    const notes = await anSvc.getAreaNotes({ lat, lng, radiusKm: 3 });
    res.json({ notes });
  } catch (err) { next(err); }
});

module.exports = router;
