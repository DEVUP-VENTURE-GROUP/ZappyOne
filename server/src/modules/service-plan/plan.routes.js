const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const svc = require('./plan.service');

const router = express.Router();
const adminRouter = express.Router();
const id = Joi.string().hex().length(24);
const day = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const run = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (err) { next(err); } };
const owner = (req) => ({ kind: req.auth.role === 'shop' ? 'shop' : 'worker', id: req.auth.sub });
const providerOnly = [authenticate, requireRole('shop', 'worker')];
const userOnly = [authenticate, requireRole('user')];

const planBody = Joi.object({
  vertical: Joi.string().max(40).required(),
  name: Joi.string().trim().min(3).max(80).required(),
  description: Joi.string().trim().max(500).allow(''),
  type: Joi.string().valid('monthly', 'pack').required(),
  items: Joi.array().min(1).max(10).items(Joi.object({ repairCode: Joi.string().max(80).required(), brandCode: Joi.string().max(80).allow(null, '') })).required(),
  visitsPerMonth: Joi.when('type', { is: 'monthly', then: Joi.number().integer().min(1).max(31).required(), otherwise: Joi.any().strip() }),
  weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).unique().default([]),
  pricePaise: Joi.number().integer().min(100).max(50000000).required(),
  durations: Joi.array().max(5).items(Joi.object({ months: Joi.number().valid(1, 3, 5, 6, 12).required(), discountPct: Joi.number().min(0).max(40).required() })),
  pauseDaysPerMonth: Joi.number().integer().min(0).max(10),
});

// Customers: plans near them, a price for a duration, subscribe, pause a day, cancel, see visits and rate them.
router.get('/near-any', ...userOnly, validate(Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }), 'query'),
  run(async (req) => ({ items: await svc.plansNearAny(req.query) })));
router.get('/near', ...userOnly, validate(Joi.object({ vertical: Joi.string().max(40).required(), lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }), 'query'),
  run(async (req) => ({ items: await svc.plansNear({ vertical: req.query.vertical, lat: req.query.lat, lng: req.query.lng }) })));
router.get('/:id/quote', ...userOnly, validate(Joi.object({ months: Joi.number().valid(1, 3, 5, 6, 12).default(1) }), 'query'), run((req) => svc.quote(req.params.id, req.query.months)));
router.post('/subscribe', ...userOnly, validate(Joi.object({
  planId: id.required(), months: Joi.number().valid(1, 3, 5, 6, 12).default(1), startDay: day.required(), timeSlot: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  address: Joi.object({ text: Joi.string().trim().min(5).max(300).required(), lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }).required(),
  idempotencyKey: Joi.string().min(8).max(80).required(),
})), run((req) => svc.subscribe(req.auth.sub, req.body)));
router.get('/mine', ...userOnly, run(async (req) => ({ items: await svc.mySubscriptions(req.auth.sub) })));
router.post('/subscriptions/:id/pause', ...userOnly, validate(Joi.object({ day: day.required() })), run((req) => svc.pauseDay(req.auth.sub, req.params.id, req.body.day)));
router.post('/subscriptions/:id/cancel', ...userOnly, validate(Joi.object({ reason: Joi.string().trim().max(300).allow('') })), run((req) => svc.cancel(req.auth.sub, req.params.id, req.body.reason)));
router.post('/visits/:id/rate', ...userOnly, validate(Joi.object({ stars: Joi.number().integer().min(1).max(5).required(), comment: Joi.string().trim().max(500).allow('') })), run((req) => svc.rateVisit(req.auth.sub, req.params.id, req.body)));

// Partners in ServicePro: their plans, who subscribed, the visits to do.
router.get('/provider/catalog', ...providerOnly, run(async (req) => ({ services: await svc.sellable(owner(req)) })));
router.get('/provider/plans', ...providerOnly, run(async (req) => ({ items: await svc.mine(owner(req)), config: await svc.config() })));
router.post('/provider/plans', ...providerOnly, validate(planBody), run(async (req) => ({ plan: await svc.savePlan(owner(req), req.body) })));
router.put('/provider/plans/:id', ...providerOnly, validate(planBody), run(async (req) => ({ plan: await svc.savePlan(owner(req), req.body, req.params.id) })));
router.post('/provider/plans/:id/submit', ...providerOnly, run(async (req) => ({ plan: await svc.submitPlan(owner(req), req.params.id) })));
router.post('/provider/plans/:id/live', ...providerOnly, validate(Joi.object({ live: Joi.boolean().required() })), run(async (req) => ({ plan: await svc.setPlanLive(owner(req), req.params.id, req.body.live) })));
router.get('/provider/subscriptions', ...providerOnly, run(async (req) => ({ items: await svc.ownerSubscriptions(owner(req)) })));
router.get('/provider/visits', ...providerOnly, validate(Joi.object({ from: day, days: Joi.number().integer().min(1).max(31).default(7) }), 'query'), run(async (req) => ({ items: await svc.ownerVisits(owner(req), req.query.from, req.query.days) })));
router.post('/provider/visits/:id/assign', ...providerOnly, validate(Joi.object({ workerId: id.required() })), run(async (req) => ({ visit: await svc.assignWorker(owner(req), req.params.id, req.body.workerId) })));
router.post('/provider/visits/:id/start', ...providerOnly, validate(Joi.object({ code: Joi.string().pattern(/^\d{4}$/).required() })), run(async (req) => ({ visit: await svc.startVisit(owner(req), req.params.id, req.body.code) })));
router.post('/provider/visits/:id/complete', ...providerOnly, validate(Joi.object({ photoKeys: Joi.array().items(Joi.string().max(300)).min(1).max(6).required(), note: Joi.string().trim().max(500).allow('') })),
  run(async (req) => ({ visit: await svc.completeVisit(owner(req), req.params.id, req.body) })));

// Admin: plans outside the price band, and the plan money rules.
adminRouter.get('/pending', run(async () => ({ items: await svc.pending() })));
adminRouter.post('/:id/review', validate(Joi.object({ approve: Joi.boolean().required(), note: Joi.string().trim().max(300).allow('') })), run(async (req) => ({ plan: await svc.reviewPlan(req.params.id, req.body.approve, req.body.note) })));
adminRouter.get('/config', run(async () => ({ config: await svc.config() })));
adminRouter.put('/config', validate(Joi.object({ platformFeePaise: Joi.number().integer().min(0).max(100000), autoApproveMinPct: Joi.number().min(0).max(100), autoApproveMaxPct: Joi.number().min(100).max(300), bookAheadDays: Joi.number().integer().min(1).max(30) }).min(1)),
  run(async (req) => ({ config: await svc.setConfig(req.body) })));

module.exports = router;
module.exports.adminRouter = adminRouter;
