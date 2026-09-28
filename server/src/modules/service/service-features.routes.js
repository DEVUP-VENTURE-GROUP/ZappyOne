/**
 * Service Feature Routes — All 10 service-depth features
 * Mounted at /api/services/* and /api/orders/:id/* via routes/index.js
 */
const express = require('express');
const Joi     = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

/* Feature 1: Pre-Diagnosis Questionnaire */
router.get('/diagnosis/:service', async (req, res, next) => {
  try {
    const { getDiagnosisFlow } = require('./diagnosis.config');
    const flow = getDiagnosisFlow(req.params.service);
    res.json({ service: req.params.service, flow: flow || [] });
  } catch (err) { next(err); }
});

router.post('/diagnosis/:service/analyse',
  validate(Joi.object({ answers: Joi.object().required() })),
  async (req, res, next) => {
    try {
      const { computeUrgencyFromAnswers, computeToolsFromAnswers, computeQuantityMultiplier } = require('./diagnosis.config');
      const { service } = req.params;
      const { answers } = req.body;
      res.json({
        service,
        urgency:             computeUrgencyFromAnswers(service, answers),
        requiredTools:       computeToolsFromAnswers(service, answers),
        quantityMultiplier:  computeQuantityMultiplier(service, answers),
        answers,
      });
    } catch (err) { next(err); }
  }
);

/* Feature 3: Service Checklists */
router.get('/checklist/:service', async (req, res, next) => {
  try {
    const { getChecklist } = require('./checklist.config');
    res.json({ service: req.params.service, checklist: getChecklist(req.params.service) });
  } catch (err) { next(err); }
});

/* Feature 4: Warranty */
router.get('/warranties', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const wSvc      = require('./warranty.service');
    const warranties = await wSvc.getMyWarranties(req.auth.sub);
    res.json({ warranties });
  } catch (err) { next(err); }
});

/* Per-order warranty — scoped so only the order's customer can fetch */
router.get('/warranties/order/:orderId', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const wSvc   = require('./warranty.service');
    const Order  = require('../order/order.model');
    const order  = await Order.findById(req.params.orderId).select('userId').lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (String(order.userId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Access denied' });
    const warranty = await wSvc.getWarrantyForOrder(req.params.orderId);
    res.json({ warranty });
  } catch (err) { next(err); }
});

router.post('/warranties/:id/claim',
  authenticate, requireRole('user'),
  validate(Joi.object({
    reason:    Joi.string().min(10).max(500).required(),
    photoUrls: Joi.array().items(Joi.string().uri()).max(5).default([]),
  })),
  async (req, res, next) => {
    try {
      const wSvc  = require('./warranty.service');
      const result = await wSvc.claimWarranty({
        warrantyId: req.params.id,
        userId:     req.auth.sub,
        reason:     req.body.reason,
        photoUrls:  req.body.photoUrls,
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

/* Feature 5: Maintenance Plans */
router.get('/maintenance-plans', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const svc  = require('./maintenance-plan.service');
    const plans = await svc.getMyPlans(req.auth.sub);
    res.json({ plans });
  } catch (err) { next(err); }
});

router.post('/maintenance-plans',
  authenticate, requireRole('user'),
  validate(Joi.object({
    service:           Joi.string().required(),
    frequencyDays:     Joi.number().integer().min(7).max(365).optional(),
    paymentMethod:     Joi.string().valid('cash', 'upi', 'card').default('upi'),
    // Repair-engine plans price each visit when it is booked, so no base price
    // is required up front; legacy order plans still need one.
    basePriceRupees:   Joi.number().positive().when('vertical', {
      is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required(),
    }),
    preferredWorkerId: Joi.string().hex().length(24).optional().allow(null),
    /*
     * Repair-engine AMC. Declared here or `stripUnknown` deletes them and the
     * plan silently reverts to booking a legacy Order against a service string
     * that does not exist in the repair catalog.
     */
    vertical:          Joi.string().max(30).optional().allow(null),
    repairCode:        Joi.string().max(80).optional().allow(null),
    brandCode:         Joi.string().max(60).optional().allow(null),
    modelCode:         Joi.string().max(120).optional().allow(null),
    shopId:            Joi.string().hex().length(24).optional().allow(null),
    visitsPerYear:     Joi.number().integer().min(1).max(12).optional().allow(null),
    pickupLocation:    Joi.object({
      lat: Joi.number().required(), lng: Joi.number().required(), address: Joi.string().required(),
    }).required(),
  })),
  async (req, res, next) => {
    try {
      const svc = require('./maintenance-plan.service');
      const { lat, lng, address } = req.body.pickupLocation;
      const result = await svc.createPlan({
        userId: req.auth.sub,
        ...req.body,
        pickupLocation: {
          type: 'Point',
          coordinates: [lng, lat],
          address,
        },
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  }
);

router.post('/maintenance-plans/:id/pause',   authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const svc  = require('./maintenance-plan.service');
    const plan = await svc.pausePlan(req.params.id, req.auth.sub);
    res.json({ plan });
  } catch (err) { next(err); }
});

router.post('/maintenance-plans/:id/resume',  authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const svc  = require('./maintenance-plan.service');
    const plan = await svc.resumePlan(req.params.id, req.auth.sub);
    res.json({ plan });
  } catch (err) { next(err); }
});

router.delete('/maintenance-plans/:id',       authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const svc  = require('./maintenance-plan.service');
    const plan = await svc.cancelPlan(req.params.id, req.auth.sub);
    res.json({ plan });
  } catch (err) { next(err); }
});

/* Feature 7: Worker Portfolio */
router.get('/workers/:workerId/portfolio', authenticate, async (req, res, next) => {
  try {
    const PortfolioItem = require('./worker-portfolio.model');
    const service = req.query.service;
    const filter  = { workerId: req.params.workerId, isPublic: true };
    if (service) filter.service = service;
    const items = await PortfolioItem.find(filter).sort({ likes: -1, addedAt: -1 }).limit(30).lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.post('/workers/portfolio',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    service:   Joi.string().required(),
    afterUrl:  Joi.string().uri().required(),
    beforeUrl: Joi.string().uri().optional().allow(null, ''),
    caption:   Joi.string().max(200).optional(),
    orderId:   Joi.string().hex().length(24).optional().allow(null),
  })),
  async (req, res, next) => {
    try {
      const PortfolioItem = require('./worker-portfolio.model');
      const item = await PortfolioItem.create({ workerId: req.auth.sub, ...req.body });
      res.status(201).json({ item });
    } catch (err) { next(err); }
  }
);

/* Feature 8: Time Estimator */
router.get('/time-estimate', authenticate, async (req, res, next) => {
  try {
    const tSvc = require('./time-estimator.service');
    const data = await tSvc.getServiceTimeEstimate({
      service:     req.query.service,
      subCategory: req.query.subCategory,
      lat:         req.query.lat ? parseFloat(req.query.lat) : null,
      lng:         req.query.lng ? parseFloat(req.query.lng) : null,
    });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;

/* Order-scoped service feature routes */
const orderRouter = express.Router({ mergeParams: true });

/* Feature 2: Materials Bill */
orderRouter.get('/:id/materials', authenticate, async (req, res, next) => {
  try {
    const MaterialsBill = require('../order/materials.model');
    const bill = await MaterialsBill.findOne({ orderId: req.params.id }).lean();
    res.json({ bill });
  } catch (err) { next(err); }
});

orderRouter.post('/:id/materials',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    name:      Joi.string().min(2).max(150).required(),
    quantity:  Joi.number().positive().required(),
    unit:      Joi.string().max(20).default('pcs'),
    costPaise: Joi.number().integer().min(0).required(),
    photoUrl:  Joi.string().uri().optional().allow(null, ''),
  })),
  async (req, res, next) => {
    try {
      const Order         = require('../order/order.model');
      const MaterialsBill = require('../order/materials.model');
      const { redis }     = require('../../config/redis');

      const order = await Order.findById(req.params.id).select('workerId userId pricing status').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });
      if (!['in_progress', 'arrived'].includes(order.status)) return res.status(409).json({ error: 'Can only add materials during active service' });

      const cfg = await require('./vertical-config.service').getConfig('construction');
      const markupPct = cfg.materialMarkupPct || 15;
      const chargedPaise = Math.round(req.body.costPaise * (1 + markupPct / 100));

      const entry = { ...req.body, markupPct, chargedPaise, approved: null };

      let bill = await MaterialsBill.findOneAndUpdate(
        { orderId: req.params.id },
        {
          $setOnInsert: { orderId: req.params.id, workerId: req.auth.sub, laborPaise: order.pricing?.total * 100 || 0 },
          $push: { entries: entry },
          $set: { requiresApproval: true },
        },
        { upsert: true, new: true }
      );

      /* Recompute totals */
      const approvedTotal = bill.entries.filter(e => e.approved !== false).reduce((s, e) => s + e.chargedPaise, 0);
      bill.materialPaise = approvedTotal;
      bill.totalPaise    = bill.laborPaise + approvedTotal;
      await bill.save();

      /* Real-time customer notification */
      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.params.id),
        event:   'materials.updated',
        payload: { newEntry: entry, totalMaterialPaise: approvedTotal, totalPaise: bill.totalPaise },
      }));

      res.status(201).json({ bill });
    } catch (err) { next(err); }
  }
);

/* Feature 3: Checklist sign-off */
orderRouter.post('/:id/checklist',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    completedIds: Joi.array().items(Joi.string()).required(),
  })),
  async (req, res, next) => {
    try {
      const Order = require('../order/order.model');
      const { validateCompletion } = require('./checklist.config');
      const { redis } = require('../../config/redis');

      const order = await Order.findById(req.params.id).select('workerId service status').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      const { valid, missing } = validateCompletion(order.service, req.body.completedIds);

      await Order.findByIdAndUpdate(req.params.id, {
        $set: { checklistCompletedIds: req.body.completedIds, checklistValid: valid },
      });

      /* Push to customer */
      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.params.id),
        event:   'checklist.updated',
        payload: { completedIds: req.body.completedIds, valid, missing },
      }));

      res.json({ valid, missing, completedIds: req.body.completedIds });
    } catch (err) { next(err); }
  }
);

/* Feature 9: Spare parts request */
orderRouter.post('/:id/spare-parts-request',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    parts: Joi.array().items(Joi.object({
      name:       Joi.string().required(),
      brand:      Joi.string().optional(),
      quantity:   Joi.number().positive().default(1),
      estimatedCostPaise: Joi.number().integer().min(0).optional(),
      photoUrl:   Joi.string().uri().optional().allow(null),
    })).min(1).required(),
    workerNote: Joi.string().max(300).optional(),
  })),
  async (req, res, next) => {
    try {
      const SparePartsRequest = require('./spare-parts-request.model');
      const Order    = require('../order/order.model');
      const { redis } = require('../../config/redis');

      const order = await Order.findById(req.params.id).select('workerId userId status').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      const totalEstimatedPaise = req.body.parts.reduce((s, p) => s + (p.estimatedCostPaise || 0), 0);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const spr = await SparePartsRequest.create({
        orderId:   req.params.id,
        workerId:  req.auth.sub,
        userId:    order.userId,
        ...req.body,
        totalEstimatedPaise,
        expiresAt,
        status: 'pending_approval',
      });

      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.params.id),
        event:   'spare_parts.requested',
        payload: {
          requestId:           String(spr._id),
          parts:               req.body.parts,
          totalEstimatedPaise,
          expiresAt:           expiresAt.toISOString(),
          workerNote:          req.body.workerNote,
        },
      }));

      res.status(201).json({ request: spr });
    } catch (err) { next(err); }
  }
);

orderRouter.post('/:id/spare-parts-request/:reqId/respond',
  authenticate, requireRole('user'),
  validate(Joi.object({ approved: Joi.boolean().required() })),
  async (req, res, next) => {
    try {
      const SparePartsRequest = require('./spare-parts-request.model');
      const { redis } = require('../../config/redis');

      const spr = await SparePartsRequest.findOne({ _id: req.params.reqId, orderId: req.params.id, status: 'pending_approval' });
      if (!spr) return res.status(404).json({ error: 'Request not found or already resolved' });
      if (spr.expiresAt < new Date()) return res.status(410).json({ error: 'Request expired' });

      spr.status             = req.body.approved ? 'approved' : 'rejected';
      spr.customerApprovedAt = new Date();
      await spr.save();

      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.params.id),
        event:   req.body.approved ? 'spare_parts.approved' : 'spare_parts.rejected',
        payload: { requestId: String(spr._id), approved: req.body.approved },
      }));

      res.json({ request: spr });
    } catch (err) { next(err); }
  }
);

/* Feature 10: Home Inspection Report */
orderRouter.get('/:id/inspection-report', authenticate, async (req, res, next) => {
  try {
    const InspectionReport = require('./home-inspection.model');
    const report = await InspectionReport.findOne({ orderId: req.params.id }).lean();
    res.json({ report });
  } catch (err) { next(err); }
});

orderRouter.post('/:id/inspection-report',
  authenticate, requireRole('worker'),
  validate(Joi.object({
    findings: Joi.array().items(Joi.object({
      category:       Joi.string().valid('electrical', 'plumbing', 'ac', 'carpenter', 'structural', 'other').required(),
      location:       Joi.string().max(200).required(),
      severity:       Joi.string().valid('ok', 'minor', 'moderate', 'urgent').required(),
      finding:        Joi.string().max(500).required(),
      recommendation: Joi.string().max(300).optional(),
      photoUrls:      Joi.array().items(Joi.string().uri()).max(5).default([]),
      serviceCode:    Joi.string().optional(),
    })).min(1).required(),
  })),
  async (req, res, next) => {
    try {
      const InspectionReport = require('./home-inspection.model');
      const Order = require('../order/order.model');
      const order = await Order.findById(req.params.id).select('workerId userId pickupLocation service status').lean();
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.workerId) !== String(req.auth.sub)) return res.status(403).json({ error: 'Not your order' });

      const findings = req.body.findings;

      /* Compute category scores */
      const severityRank = { ok: 0, minor: 1, moderate: 2, urgent: 3 };
      const cats = ['electrical', 'plumbing', 'ac', 'structural'];
      const scores = {};
      for (const cat of cats) {
        const catFindings = findings.filter(f => f.category === cat);
        if (!catFindings.length) { scores[cat] = 'good'; continue; }
        const maxSev = Math.max(...catFindings.map(f => severityRank[f.severity] || 0));
        scores[cat] = maxSev === 0 ? 'good' : maxSev === 1 ? 'attention' : 'urgent';
      }
      const maxScore = Math.max(...Object.values(scores).map(s => ['good', 'attention', 'urgent'].indexOf(s)));
      const overallMap = ['excellent', 'needs_attention', 'urgent'];
      scores.overall = maxScore === 0
        ? 'excellent'
        : maxScore === 1 ? 'needs_attention' : 'urgent';

      /* Collect recommended services */
      const recommended = [];
      const seen = new Set();
      for (const f of findings) {
        if (f.serviceCode && !seen.has(f.serviceCode) && f.severity !== 'ok') {
          seen.add(f.serviceCode);
          recommended.push({
            serviceCode:   f.serviceCode,
            reason:        f.recommendation || f.finding.slice(0, 100),
            priority:      f.severity === 'urgent' ? 'immediate' : f.severity === 'moderate' ? 'soon' : 'eventually',
          });
        }
      }

      const report = await InspectionReport.findOneAndUpdate(
        { orderId: req.params.id },
        {
          $setOnInsert: { orderId: req.params.id, userId: order.userId, workerId: req.auth.sub, address: order.pickupLocation?.address || '' },
          $set: { findings, scores, recommendedServices: recommended, status: 'complete', completedAt: new Date() },
        },
        { upsert: true, new: true }
      );

      /* Push to customer */
      const { redis } = require('../../config/redis');
      await redis.publish('order:event', JSON.stringify({
        orderId: String(req.params.id),
        event:   'inspection.complete',
        payload: {
          reportId:      String(report._id),
          overallScore:  scores.overall,
          urgentCount:   findings.filter(f => f.severity === 'urgent').length,
          recommended:   recommended.length,
        },
      }));

      res.status(201).json({ report });
    } catch (err) { next(err); }
  }
);

module.exports.router      = router;
module.exports.orderRouter = orderRouter;
