const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const errors = require('./errors.service');

/** Admin → Live errors (telemetry/errors.service). System area: read to watch, write to plan and message. */
const router = express.Router();
const who = (req) => req.admin?.name || req.admin?.email || 'admin';
const wrap = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (err) { next(err); } };

router.get('/errors/pulse', wrap(() => errors.pulse()));
router.get('/errors/live', wrap((req) => errors.live({ ...req.query, limit: Number(req.query.limit) || 60 })));
router.get('/errors/issues', wrap((req) => errors.issues(req.query)));
router.get('/errors/issues/:id', wrap((req) => errors.issue(req.params.id)));

router.patch('/errors/issues/:id/plan',
  validate(Joi.object({
    status: Joi.string().valid('open', 'planned', 'fixing', 'resolved', 'ignored'),
    priority: Joi.string().valid('P0', 'P1', 'P2', 'P3'),
    owner: Joi.string().max(80).allow(''),
    steps: Joi.string().max(4000).allow(''),
    eta: Joi.date().iso().allow(null, ''),
  })),
  wrap((req) => errors.plan(req.params.id, req.body, who(req))));

router.post('/errors/issues/:id/message',
  validate(Joi.object({
    to: Joi.string().max(80).default('all'),
    title: Joi.string().trim().min(2).max(80).required(),
    body: Joi.string().trim().min(2).max(300).required(),
  })),
  wrap((req) => errors.message(req.params.id, req.body, who(req))));

module.exports = router;
