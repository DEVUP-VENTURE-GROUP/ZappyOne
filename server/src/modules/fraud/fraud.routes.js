const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const fraudService = require('./fraud.service');
const auditService = require('../admin/audit.service');
const FraudEvent = require('./fraud.model');

const router = express.Router();

const OBJECT_ID = /^[a-f0-9]{24}$/;

// GET /fraud/summary — counts by type/severity/status (last 30d)
router.get('/fraud/summary', async (req, res, next) => {
  try {
    const summary = await fraudService.getFraudSummary();
    res.json(summary);
  } catch (err) { next(err); }
});

// GET /fraud/events — paginated list with filters
router.get(
  '/fraud/events',
  validate(
    Joi.object({
      status: Joi.string().valid(...FraudEvent.STATUSES).optional(),
      severity: Joi.string().valid(...FraudEvent.SEVERITIES).optional(),
      type: Joi.string().valid(...FraudEvent.TYPES).optional(),
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
    }),
    'query',
  ),
  async (req, res, next) => {
    try {
      const result = await fraudService.listEvents(req.query);
      res.json(result);
    } catch (err) { next(err); }
  },
);

// GET /fraud/events/:actorKind/:actorId — all fraud events for one actor
router.get('/fraud/events/:actorKind/:actorId', async (req, res, next) => {
  try {
    const { actorKind, actorId } = req.params;
    if (!['user', 'worker', 'shop'].includes(actorKind)) {
      return res.status(400).json({ error: 'Invalid actorKind' });
    }
    if (!OBJECT_ID.test(actorId)) {
      return res.status(400).json({ error: 'Invalid actorId' });
    }
    const result = await fraudService.listEventsForActor(actorKind, actorId);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /fraud/events/:id — resolve an event
router.patch(
  '/fraud/events/:id',
  validate(
    Joi.object({
      status: Joi.string().valid('dismissed', 'escalated', 'blocked').required(),
      adminNote: Joi.string().max(1000).optional().allow(''),
    }),
  ),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!OBJECT_ID.test(id)) return res.status(400).json({ error: 'Invalid event ID' });

      const { status, adminNote } = req.body;
      const { event, actorBlocked } = await fraudService.resolveEvent(id, {
        status,
        adminNote,
        adminId: req.auth?.sub,
      });

      await auditService.fromRequest(
        req,
        'admin.fraud_resolve',
        { kind: event.actorKind, id: event.actorId },
        { status: 'open' },
        { fraudEventId: id, newStatus: status, actorBlocked, adminNote },
      );

      res.json({ ok: true, event, actorBlocked });
    } catch (err) { next(err); }
  },
);

module.exports = router;
