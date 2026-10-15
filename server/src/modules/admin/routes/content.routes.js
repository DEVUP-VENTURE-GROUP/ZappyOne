const express = require('express');
const Joi = require('joi');
const { validate } = require('../../../middlewares/validate');
const Content = require('../../content/content.model');
const contentService = require('../../content/content.service');
const auditService = require('../audit.service');

const router = express.Router();

const baseBody = Joi.object({
  type:     Joi.string().valid('faq', 'policy').required(),
  // FAQ
  question: Joi.string().max(300).when('type', { is: 'faq', then: Joi.required() }),
  answer:   Joi.string().max(4000).when('type', { is: 'faq', then: Joi.required() }),
  category: Joi.string().max(60).allow('', null),
  // Policy
  slug:  Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).max(80).when('type', { is: 'policy', then: Joi.required() }),
  title: Joi.string().max(160).when('type', { is: 'policy', then: Joi.required() }),
  body:  Joi.string().max(20000).when('type', { is: 'policy', then: Joi.required() }),
  // Shared
  audience: Joi.string().valid('user', 'worker', 'all').default('all'),
  order:    Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

/* Festive home: seasons on the customer home (content/season). */

const seasonBody = Joi.object({
  name: Joi.string().trim().max(60).required(),
  theme: Joi.string().valid(...require('../../content/season.model').THEMES).required(),
  greeting: Joi.string().trim().max(40).allow(''),
  headline: Joi.string().trim().max(60).required(),
  subline: Joi.string().trim().max(120).allow(''),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().required(),
  tiles: Joi.array().items(Joi.object({
    title: Joi.string().trim().max(40).required(),
    serviceCode: Joi.string().trim().max(60).required(),
    imageUrl: Joi.string().max(500).allow(''),
    badge: Joi.string().trim().max(20).allow(''),
  })).max(6),
  promoCode: Joi.string().trim().uppercase().max(30).allow(''),
  // No defaults here: on an edit, a field left out stays as it is (the model sets them on create).
  isActive: Joi.boolean(),
});

router.get('/seasons', async (req, res, next) => {
  try {
    const svc = require('../../content/season.service');
    res.json({ seasons: await svc.list(), auto: svc.upcomingAuto() });
  } catch (err) { next(err); }
});

router.post('/seasons', validate(seasonBody), async (req, res, next) => {
  try {
    const season = await require('../../content/season.service').create(req.body, req.auth.sub);
    await auditService.fromRequest(req, 'admin.season_create', { kind: 'season', id: season._id }, null, req.body);
    res.status(201).json({ season });
  } catch (err) { next(err); }
});

router.put('/seasons/:id', validate(seasonBody.fork(['name', 'theme', 'headline', 'startAt', 'endAt'], (f) => f.optional()).min(1)), async (req, res, next) => {
  try {
    const { before, after } = await require('../../content/season.service').update(req.params.id, req.body, req.auth.sub);
    await auditService.fromRequest(req, 'admin.season_update', { kind: 'season', id: req.params.id }, before, after);
    res.json({ season: after });
  } catch (err) { next(err); }
});

router.delete('/seasons/:id', async (req, res, next) => {
  try {
    const before = await require('../../content/season.service').remove(req.params.id);
    await auditService.fromRequest(req, 'admin.season_delete', { kind: 'season', id: req.params.id }, before, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** GET /content — list everything (optionally filter by ?type=). */
router.get('/content', async (req, res, next) => {
  try {
    await contentService.ensureSeeded();
    const filter = {};
    if (['faq', 'policy'].includes(req.query.type)) filter.type = req.query.type;
    const items = await Content.find(filter).sort({ type: 1, category: 1, order: 1, createdAt: 1 }).lean();
    res.json({ items });
  } catch (err) { next(err); }
});

/** POST /content — create an FAQ or policy page. */
router.post('/content', validate(baseBody), async (req, res, next) => {
  try {
    const item = await Content.create({ ...req.body, updatedBy: String(req.auth.sub) });
    await auditService.fromRequest(req, 'admin.content_create', { kind: 'content', id: item._id }, null, req.body);
    res.status(201).json({ item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `A policy with slug "${req.body.slug}" already exists` });
    next(err);
  }
});

/** PUT /content/:id — update. */
router.put('/content/:id', validate(baseBody.fork(
  ['type', 'question', 'answer', 'slug', 'title', 'body'], (f) => f.optional()
)), async (req, res, next) => {
  try {
    const before = await Content.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: 'Content not found' });
    const item = await Content.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedBy: String(req.auth.sub) } },
      { new: true, runValidators: true }
    );
    await auditService.fromRequest(req, 'admin.content_update', { kind: 'content', id: item._id }, before, req.body);
    res.json({ item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: `A policy with slug "${req.body.slug}" already exists` });
    next(err);
  }
});

/** PATCH /content/:id/active — toggle visibility. */
router.patch('/content/:id/active', validate(Joi.object({ isActive: Joi.boolean().required() })), async (req, res, next) => {
  try {
    const item = await Content.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { new: true });
    if (!item) return res.status(404).json({ error: 'Content not found' });
    res.json({ item });
  } catch (err) { next(err); }
});

/** DELETE /content/:id */
router.delete('/content/:id', async (req, res, next) => {
  try {
    const item = await Content.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Content not found' });
    await auditService.fromRequest(req, 'admin.content_delete', { kind: 'content', id: item._id }, item.toObject(), null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
