const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/auth');
const svc = require('./review.service');

/** /api/reviews: a provider reads their own reviews and reports one for a look. */
const router = express.Router();
const self = (req) => ({ role: req.auth.role, id: req.auth.sub });

router.get('/mine', authenticate, async (req, res, next) => {
  try { res.json(await svc.mine(self(req), { page: Math.max(1, Number(req.query.page) || 1) })); } catch (e) { next(e); }
});

router.post('/:id/report', authenticate,
  validate(Joi.object({ reason: Joi.string().trim().min(5).max(300).required() })),
  async (req, res, next) => {
    try { res.json(await svc.report(self(req), req.params.id, req.body.reason)); } catch (e) { next(e); }
  });

module.exports = router;
