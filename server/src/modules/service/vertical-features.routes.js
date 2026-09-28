/**
 * Vertical Feature Routes — All 10 service-depth features
 * Phone: catalog, combo, tiers, health cert
 * Vehicle: profiles, tyre/battery reports, damage docs
 * Construction: site visits, job timer
 */
const express = require('express');
const Joi     = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

/*
   PHONE FEATURES
 */

/* Feature 1: Phone model catalog + tiered pricing */
router.get('/phone/brands', async (req, res, next) => {
  try {
    const pc = require('./phone-catalog');
    res.json({ brands: pc.getBrands() });
  } catch (err) { next(err); }
});

router.get('/phone/brands/:brand/series', async (req, res, next) => {
  try {
    const pc     = require('./phone-catalog');
    const series = pc.getSeriesForBrand(req.params.brand);
    res.json({ brand: req.params.brand, series });
  } catch (err) { next(err); }
});

router.get('/phone/pricing', authenticate, async (req, res, next) => {
  try {
    const { brand, series, service } = req.query;
    if (!brand || !service) return res.status(400).json({ error: 'brand and service required' });
    const pc   = require('./phone-catalog');
    const tiers = pc.getTieredPricing({ brand, seriesName: series, service });
    res.json({ brand, series, service, tiers });
  } catch (err) { next(err); }
});

router.get('/phone/combos/:service', async (req, res, next) => {
  try {
    const { getSuggestedCombos } = require('./combo-repair');
    res.json({ service: req.params.service, combos: getSuggestedCombos(req.params.service) });
  } catch (err) { next(err); }
});

/* Feature 4: Post-repair phone health report */
router.get('/phone/health-report/:orderId', authenticate, async (req, res, next) => {
  try {
    const PhoneHealthReport = require('./phone-health-report.model');
    const Order = require('../order/order.model');
    const order = await Order.findById(req.params.orderId).select('userId workerId').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub) || String(order.workerId) === String(req.auth.sub);
    if (!isOwner) return res.status(403).json({ error: 'Access denied' });
    const report = await PhoneHealthReport.findOne({ orderId: req.params.orderId }).lean();
    res.json({ report });
  } catch (err) { next(err); }
});

router.post('/phone/health-report',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    orderId:      Joi.string().hex().length(24).required(),
    deviceBrand:  Joi.string().optional(),
    deviceModel:  Joi.string().optional(),
    deviceSeries: Joi.string().optional(),
    components: Joi.object({
      screen:      Joi.object({ status: Joi.string(), touchOk: Joi.boolean(), colorsOk: Joi.boolean(), notes: Joi.string().optional() }).optional(),
      battery:     Joi.object({ status: Joi.string(), healthPct: Joi.number().min(0).max(100), cycleCount: Joi.number().optional(), chargesOk: Joi.boolean(), notes: Joi.string().optional() }).optional(),
      camera:      Joi.object({ status: Joi.string(), frontOk: Joi.boolean(), rearOk: Joi.boolean(), flashOk: Joi.boolean().optional(), notes: Joi.string().optional() }).optional(),
      audio:       Joi.object({ status: Joi.string(), speakerOk: Joi.boolean(), micOk: Joi.boolean(), notes: Joi.string().optional() }).optional(),
      connectivity:Joi.object({ status: Joi.string(), wifiOk: Joi.boolean(), bluetoothOk: Joi.boolean(), simOk: Joi.boolean(), notes: Joi.string().optional() }).optional(),
      charging:    Joi.object({ status: Joi.string(), portOk: Joi.boolean(), chargesAt: Joi.string().optional(), notes: Joi.string().optional() }).optional(),
      buttons:     Joi.object({ status: Joi.string(), powerOk: Joi.boolean(), volumeOk: Joi.boolean(), notes: Joi.string().optional() }).optional(),
    }).required(),
    partsReplaced: Joi.array().items(Joi.object({
      name: Joi.string().required(), brand: Joi.string(), tier: Joi.string(), warrantyDays: Joi.number(),
    })).default([]),
  })),
  async (req, res, next) => {
    try {
      const PhoneHealthReport = require('./phone-health-report.model');
      const Order = require('../order/order.model');
      const crypto = require('crypto');

      const order = await Order.findById(req.body.orderId).select('workerId userId service').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      /* Compute score from components */
      const comp    = req.body.components;
      const comps   = Object.values(comp || {});
      const passes  = comps.filter(c => c?.status === 'pass').length;
      const fails   = comps.filter(c => c?.status === 'fail').length;
      const tested  = comps.filter(c => c?.status && c.status !== 'not_tested').length;

      const score = tested > 0 ? Math.round(((passes) / (passes + fails || 1)) * 100) : 75;
      const grade = PhoneHealthReport.schema.statics
        ? ['A+','A','B+','B','C','D'][Math.floor(Math.max(0, 100 - score) / 16)] || 'A+'
        : score >= 92 ? 'A+' : score >= 83 ? 'A' : score >= 74 ? 'B+' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D';

      const summary = score >= 90
        ? 'Excellent condition — all systems working perfectly'
        : score >= 75 ? 'Good condition — minor issues noted'
        : score >= 60 ? 'Fair condition — some components need attention'
        : 'Needs attention — multiple issues found';

      const report = await PhoneHealthReport.findOneAndUpdate(
        { orderId: req.body.orderId },
        {
          $setOnInsert: { orderId: req.body.orderId, workerId: req.auth.sub, userId: order.userId },
          $set: {
            ...req.body,
            overallScore:   score,
            grade,
            summary,
            certificateId:  `ZPH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
            generatedAt:    new Date(),
          },
        },
        { upsert: true, new: true }
      );

      /* Notify customer */
      const { redis } = require('../../config/redis');
      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.body.orderId),
        event: 'phone_health.complete',
        payload: { reportId: String(report._id), score, grade, summary, certificateId: report.certificateId },
      }));

      res.status(201).json({ report });
    } catch (err) { next(err); }
  }
);

/*
   VEHICLE FEATURES
 */

/* Feature 5: Vehicle profiles */
router.get('/vehicles', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const VehicleProfile = require('./vehicle-profile.model');
    const vehicles = await VehicleProfile.find({ userId: req.auth.sub, isActive: true }).sort({ isDefault: -1 }).lean();
    res.json({ vehicles });
  } catch (err) { next(err); }
});

router.post('/vehicles',
  authenticate, requireRole('user'),
  validate(Joi.object({
    nickname:       Joi.string().max(50).optional(),
    registrationNo: Joi.string().max(20).optional(),
    vehicleType:    Joi.string().valid('bike', 'scooter', 'car', 'suv', 'ev').required(),
    make:           Joi.string().max(50).optional(),
    model:          Joi.string().max(80).optional(),
    year:           Joi.number().integer().min(1990).max(2030).optional(),
    color:          Joi.string().max(30).optional(),
    fuelType:       Joi.string().valid('petrol', 'diesel', 'cng', 'electric', 'hybrid').default('petrol'),
    isDefault:      Joi.boolean().default(false),
  })),
  async (req, res, next) => {
    try {
      const VehicleProfile = require('./vehicle-profile.model');
      if (req.body.isDefault) {
        await VehicleProfile.updateMany({ userId: req.auth.sub }, { $set: { isDefault: false } });
      }
      const vehicle = await VehicleProfile.create({ userId: req.auth.sub, ...req.body });
      res.status(201).json({ vehicle });
    } catch (err) { next(err); }
  }
);

router.patch('/vehicles/:id',
  authenticate, requireRole('user'),
  validate(Joi.object({
    nickname: Joi.string(), registrationNo: Joi.string(),
    make: Joi.string(), model: Joi.string(), year: Joi.number(),
    color: Joi.string(), fuelType: Joi.string(), isDefault: Joi.boolean(),
    insuranceCompany: Joi.string(), insurancePolicyNo: Joi.string(),
    insuranceExpiresAt: Joi.date(),
  }).min(1)),
  async (req, res, next) => {
    try {
      const VehicleProfile = require('./vehicle-profile.model');
      if (req.body.isDefault) {
        await VehicleProfile.updateMany({ userId: req.auth.sub }, { $set: { isDefault: false } });
      }
      const vehicle = await VehicleProfile.findOneAndUpdate(
        { _id: req.params.id, userId: req.auth.sub },
        { $set: req.body },
        { new: true }
      );
      if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
      res.json({ vehicle });
    } catch (err) { next(err); }
  }
);

router.delete('/vehicles/:id', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const VehicleProfile = require('./vehicle-profile.model');
    await VehicleProfile.findOneAndUpdate({ _id: req.params.id, userId: req.auth.sub }, { $set: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* Features 6–8: Vehicle health reports (tyre + battery + pre-damage) */
router.get('/vehicles/health-report/:orderId', authenticate, async (req, res, next) => {
  try {
    const VehicleHealthReport = require('./vehicle-health-report.model');
    const Order = require('../order/order.model');
    const order = await Order.findById(req.params.orderId).select('userId workerId').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub) || String(order.workerId) === String(req.auth.sub);
    if (!isOwner) return res.status(403).json({ error: 'Access denied' });
    const report = await VehicleHealthReport.findOne({ orderId: req.params.orderId }).lean();
    res.json({ report });
  } catch (err) { next(err); }
});

router.post('/vehicles/health-report',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    orderId:        Joi.string().hex().length(24).required(),
    vehicleType:    Joi.string().optional(),
    registrationNo: Joi.string().optional(),
    reportType:     Joi.string().valid('tyre', 'battery', 'full', 'pre_damage').required(),
    tyres:          Joi.array().items(Joi.object({
      position:      Joi.string().valid('front_left', 'front_right', 'rear_left', 'rear_right', 'spare').required(),
      treadDepthMm:  Joi.number().optional(),
      pressurePsi:   Joi.number().optional(),
      sidewallOk:    Joi.boolean().optional(),
      hasNail:       Joi.boolean().optional(),
      repaired:      Joi.boolean().optional(),
      recommendReplacement: Joi.boolean().optional(),
      notes:         Joi.string().optional(),
    })).optional(),
    battery:        Joi.object({
      voltageV:      Joi.number(),
      ccaRating:     Joi.number(),
      ccaTested:     Joi.number(),
      loadTestPass:  Joi.boolean(),
      chargingV:     Joi.number(),
      estimatedLifeMonths: Joi.number(),
      recommendation: Joi.string().valid('good', 'charge_only', 'replace_soon', 'replace_now'),
      notes:         Joi.string(),
    }).optional(),
    preDamageDocs:  Joi.array().items(Joi.object({
      area:     Joi.string().valid('front', 'rear', 'left', 'right', 'top', 'interior', 'engine', 'other').required(),
      photoUrl: Joi.string().uri().required(),
      notes:    Joi.string().optional(),
    })).optional(),
    overallCondition: Joi.string().valid('excellent', 'good', 'needs_attention', 'urgent').optional(),
    technicalNotes:   Joi.string().optional(),
  })),
  async (req, res, next) => {
    try {
      const VehicleHealthReport = require('./vehicle-health-report.model');
      const Order = require('../order/order.model');
      const order = await Order.findById(req.body.orderId).select('workerId userId').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      const report = await VehicleHealthReport.findOneAndUpdate(
        { orderId: req.body.orderId },
        {
          $setOnInsert: { orderId: req.body.orderId, workerId: req.auth.sub, userId: order.userId },
          $set: req.body,
        },
        { upsert: true, new: true }
      );

      const { redis } = require('../../config/redis');
      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.body.orderId),
        event: 'vehicle_health.complete',
        payload: { reportId: String(report._id), reportType: req.body.reportType },
      }));

      res.status(201).json({ report });
    } catch (err) { next(err); }
  }
);

/*
   CONSTRUCTION FEATURES
 */

/* Feature 9: Site visit assessment */
router.get('/construction/site-visit/:orderId', authenticate, async (req, res, next) => {
  try {
    const SiteVisit = require('./site-visit.model');
    const Order = require('../order/order.model');
    const order = await Order.findById(req.params.orderId).select('userId workerId').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isOwner = String(order.userId) === String(req.auth.sub) || String(order.workerId) === String(req.auth.sub);
    if (!isOwner) return res.status(403).json({ error: 'Access denied' });
    const sv = await SiteVisit.findOne({ orderId: req.params.orderId }).lean();
    res.json({ siteVisit: sv });
  } catch (err) { next(err); }
});

router.post('/construction/site-visit',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    orderId: Joi.string().hex().length(24).required(),
    scopeItems: Joi.array().items(Joi.object({
      area:           Joi.string().max(200).required(),
      workType:       Joi.string().max(200).required(),
      estimatedHours: Joi.number().optional(),
      estimatedMaterialCost: Joi.number().optional(),
      photos:         Joi.array().items(Joi.string().uri()).max(5).default([]),
      severity:       Joi.string().valid('minor', 'moderate', 'major').default('minor'),
      notes:          Joi.string().optional(),
    })).min(1).required(),
    totalEstimatedHours:  Joi.number().optional(),
    totalMaterialCost:    Joi.number().optional(),
    totalLaborCost:       Joi.number().optional(),
    grandTotal:           Joi.number().optional(),
    siteAccessible:       Joi.boolean().default(true),
    accessNotes:          Joi.string().optional(),
    materialsNeeded:      Joi.array().items(Joi.string()).optional(),
    equipmentNeeded:      Joi.array().items(Joi.string()).optional(),
    startDateSuggested:   Joi.date().optional(),
    durationDays:         Joi.number().optional(),
    workersNeeded:        Joi.number().integer().min(1).max(10).default(1),
  })),
  async (req, res, next) => {
    try {
      const SiteVisit = require('./site-visit.model');
      const Order  = require('../order/order.model');
      const { redis } = require('../../config/redis');

      const order = await Order.findById(req.body.orderId).select('workerId userId pickupLocation').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      const sv = await SiteVisit.findOneAndUpdate(
        { orderId: req.body.orderId },
        {
          $setOnInsert: { orderId: req.body.orderId, workerId: req.auth.sub, userId: order.userId, address: order.pickupLocation?.address },
          $set: { ...req.body, status: 'submitted' },
        },
        { upsert: true, new: true }
      );

      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.body.orderId),
        event: 'site_visit.submitted',
        payload: {
          siteVisitId:  String(sv._id),
          scopeCount:   req.body.scopeItems.length,
          grandTotal:   req.body.grandTotal,
          durationDays: req.body.durationDays,
        },
      }));

      res.status(201).json({ siteVisit: sv });
    } catch (err) { next(err); }
  }
);

router.post('/construction/site-visit/:id/respond',
  authenticate, requireRole('user'),
  validate(Joi.object({ approved: Joi.boolean().required(), note: Joi.string().max(300).optional() })),
  async (req, res, next) => {
    try {
      const SiteVisit = require('./site-visit.model');
      const { redis } = require('../../config/redis');

      const sv = await SiteVisit.findOne({ _id: req.params.id, userId: req.auth.sub });
      if (!sv) return res.status(404).json({ error: 'Site visit not found' });

      sv.status             = req.body.approved ? 'customer_approved' : 'customer_rejected';
      sv.customerResponseAt = new Date();
      sv.customerNote       = req.body.note;
      await sv.save();

      await redis.publish('order:event', JSON.stringify({
        orderId: String(sv.orderId),
        event: req.body.approved ? 'site_visit.approved' : 'site_visit.rejected',
        payload: { siteVisitId: String(sv._id), approved: req.body.approved, note: req.body.note },
      }));

      res.json({ siteVisit: sv });
    } catch (err) { next(err); }
  }
);

/* Feature 10: Live hourly job timer */
router.get('/construction/timer/:orderId', authenticate, async (req, res, next) => {
  try {
    const timerService = require('./job-timer.service');
    const timer = await timerService.getTimer(req.params.orderId);
    res.json({ timer });
  } catch (err) { next(err); }
});

router.post('/construction/timer/start',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    orderId:       Joi.string().hex().length(24).required(),
    perHourPaise:  Joi.number().integer().min(5000).max(500000).optional(),
  })),
  async (req, res, next) => {
    try {
      const Order = require('../order/order.model');
      const order = await Order.findById(req.body.orderId).select('workerId status').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });
      if (!['in_progress'].includes(order.status)) return res.status(409).json({ error: 'Order must be in_progress to start timer' });

      const timerService = require('./job-timer.service');
      const vc = require('./vertical-config.service');
      const cfg = await vc.getConfig('construction');
      const perHourPaise = req.body.perHourPaise || cfg.perHourFeePaise || 40000;
      const timer = await timerService.startTimer({ orderId: req.body.orderId, workerId: req.auth.sub, perHourPaise });
      res.status(201).json({ timer });
    } catch (err) { next(err); }
  }
);

router.post('/construction/timer/pause',
  authenticate, requireRole('worker'),
  validate(Joi.object({ orderId: Joi.string().hex().length(24).required() })),
  async (req, res, next) => {
    try {
      const t = await require('./job-timer.service').pauseTimer({ orderId: req.body.orderId, workerId: req.auth.sub });
      res.json({ timer: t });
    } catch (err) { next(err); }
  }
);

router.post('/construction/timer/resume',
  authenticate, requireRole('worker'),
  validate(Joi.object({ orderId: Joi.string().hex().length(24).required() })),
  async (req, res, next) => {
    try {
      const t = await require('./job-timer.service').resumeTimer({ orderId: req.body.orderId, workerId: req.auth.sub });
      res.json({ timer: t });
    } catch (err) { next(err); }
  }
);

router.post('/construction/timer/stop',
  authenticate, requireRole('worker'),
  validate(Joi.object({ orderId: Joi.string().hex().length(24).required() })),
  async (req, res, next) => {
    try {
      const t = await require('./job-timer.service').stopTimer({ orderId: req.body.orderId, workerId: req.auth.sub });
      res.json({ timer: t });
    } catch (err) { next(err); }
  }
);

module.exports = router;
