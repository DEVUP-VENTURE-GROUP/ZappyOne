const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { makeLimiter } = require('../../middlewares/rateLimit');

/**
 * Customer actions that work the same on every kind of job (jobs/kinds.js).
 */
const router = express.Router();

/**
 * SOS from the customer's tracking screen. The app has already dialled 112;
 * this tells ZappyOne through the one customer-SOS path (worker/sos.service):
 * the admin SOS panel and ops room hear it with who is on site, an urgent
 * ticket is filed, and it re-escalates if nobody acknowledges it. Only the
 * customer who owns the job can raise it.
 */
router.post('/:id/sos',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 10 * 60_000, max: 5, prefix: 'jobsos' }),
  validate(Joi.object({ lat: Joi.number().min(-90).max(90), lng: Joi.number().min(-180).max(180) })),
  async (req, res, next) => {
    try {
      const { findJob } = require('./kinds');
      const found = await findJob(req.params.id, 'userId');
      if (!found || String(found.doc.userId) !== String(req.auth.sub)) return res.status(404).json({ error: 'Booking not found' });
      const result = await require('../worker/sos.service').triggerCustomerSOS({
        userId: req.auth.sub, jobId: req.params.id, lat: req.body?.lat, lng: req.body?.lng,
      });
      res.json({ ok: true, incidentKey: result.incidentKey });
    } catch (err) { next(err); }
  });

module.exports = router;
