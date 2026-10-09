const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { makeLimiter } = require('../../middlewares/rateLimit');

/**
 * Actions that work the same on every kind of job (jobs/kinds.js).
 */
const router = express.Router();

/**
 * Cancellation fees the customer still owes from earlier bookings: shown before
 * they confirm the next one, which carries them (jobs/cancel-fee).
 */
router.get('/pending-fee', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const { totalPaise, records } = await require('./cancel-fee').pendingFor(req.auth.sub);
    res.json({ totalPaise, count: records.length, since: records[0]?.createdAt || null });
  } catch (err) { next(err); }
});

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

/**
 * A shop owner puts one of their own technicians on any job the shop holds —
 * repair, pet care, whatever the shop was booked for (jobs/assignment.js).
 */
router.post('/:id/assign',
  authenticate, requireRole('shop'),
  validate(Joi.object({ workerId: Joi.string().hex().length(24).required() })),
  async (req, res, next) => {
    try {
      const { kind, job, worker } = await require('./assignment').assignTechnician({
        jobId: req.params.id, shopId: req.auth.sub, workerId: req.body.workerId,
      });
      res.json({ kind, id: String(job._id), workerId: String(worker._id), workerName: worker.name || '' });
    } catch (err) { next(err); }
  });

/**
 * Messages between the customer and the provider on any job (jobs/job-chat).
 * The signed-in role decides which side of the conversation you are on.
 */
const actorOf = (req) => ({ kind: req.auth.role, id: String(req.auth.sub) });

router.get('/:id/chat',
  authenticate, requireRole('user', 'worker', 'shop'),
  async (req, res, next) => {
    try {
      res.json(await require('./job-chat.service').list({ jobId: req.params.id, actor: actorOf(req), before: req.query.before }));
    } catch (err) { next(err); }
  });

router.post('/:id/chat',
  authenticate, requireRole('user', 'worker', 'shop'),
  makeLimiter({ windowMs: 60_000, max: 30, prefix: 'jobchat' }),
  validate(Joi.object({ text: Joi.string().trim().min(1).max(1000).required() })),
  async (req, res, next) => {
    try {
      res.status(201).json(await require('./job-chat.service').send({ jobId: req.params.id, actor: actorOf(req), text: req.body.text }));
    } catch (err) { next(err); }
  });

/* Backing out, no-shows and cancelling, the same for every kind (jobs/give-back, jobs/cancel-fee). */

/** Why a customer cancels: fixed answers, so ops can see what goes wrong. */
const CUSTOMER_REASONS = [
  'Booked by mistake', 'Provider is taking too long', 'Found someone else', 'Price is too high',
  'No longer needed', 'Want to change the time or address', 'Other reason',
];

/**
 * A shop owner going to the job themselves (no technician on it): their phone's
 * position, shown live to the customer exactly as a technician's would be.
 */
router.post('/:id/owner-location',
  authenticate, requireRole('shop'),
  makeLimiter({ windowMs: 60_000, max: 30, prefix: 'ownerloc' }),
  validate(Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() })),
  async (req, res, next) => {
    try {
      const { doc } = await jobFor(req, 'shopId workerId status');
      if (String(doc.shopId || '') !== String(req.auth.sub)) return res.status(403).json({ error: 'This job is not yours' });
      if (doc.workerId) return res.status(204).end(); // their technician is the one being followed
      const { redis } = require('../../config/redis');
      await redis.publish('order:event', JSON.stringify({
        orderId: String(doc._id), event: 'worker.location',
        payload: { lat: req.body.lat, lng: req.body.lng, at: Date.now(), hdg: null, spd: null },
      }));
      res.status(204).end();
    } catch (err) { next(err); }
  });

async function jobFor(req, select) {
  const { findJob } = require('./kinds');
  const found = await findJob(req.params.id, select);
  if (!found) throw Object.assign(new Error('Booking not found'), { status: 404 });
  return found;
}

/** What cancelling costs the customer right now, in one shape for every kind. */
async function customerCancelQuote(kind, doc) {
  if (kind === 'repair') return require('../repair/services/cancellation.service').quoteCancellation(doc, { userId: doc.userId });
  if (kind === 'helping') return require('./cancel-fee').quoteHelping(doc);
  if (kind === 'pet') {
    const q = await require('../pet/services/booking.service').quoteCancellation({ booking: doc });
    if (!q.allowed) return { allowed: false, message: 'Your pet care has started. Contact support and we will sort it out.' };
    const paidPaise = doc.paymentStatus === 'paid' ? (doc.pricing?.totalPaise || 0) : 0;
    const feePaise = q.penaltyPaise || 0;
    const rupees = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
    const message = q.tier === 'provider_changed' ? 'No charge: your pet pro could not make it, so cancelling is free.'
      : feePaise <= 0 ? 'You can cancel this booking free of charge.'
        : paidPaise > 0 ? `Under this service's policy we keep ${rupees(feePaise)} and refund you ${rupees(q.refundPaise)}.`
          : `Under this service's policy, cancelling now costs ${rupees(feePaise)}.`;
    return { allowed: true, feePaise, earnedPaise: 0, paidPaise, refundPaise: paidPaise ? q.refundPaise : 0, free: q.tier === 'provider_changed' ? 'provider_changed' : null, message };
  }
  return { allowed: false, message: 'Cancel this booking from its own page.' };
}

/** The receipt PDF for a finished job (messaging/receipt): the same one the "job done" email carries. */
router.get('/:id/receipt',
  authenticate, requireRole('user'),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      const k = require('./kinds').KINDS[kind];
      const doc = await k.model().findById(req.params.id).lean();
      if (!doc || String(doc.userId) !== String(req.auth.sub)) return res.status(404).json({ error: 'Booking not found' });
      if (!k.earning?.done.includes(doc.status)) return res.status(409).json({ error: 'The receipt is ready once the job is done.', code: 'NOT_DONE' });
      const pdf = await require('../messaging/receipt').build(kind, doc);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (err) { next(err); }
  });

router.get('/:id/options',
  authenticate, requireRole('user'),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      const doc = await require('./kinds').KINDS[kind].model().findById(req.params.id).lean();
      if (String(doc.userId) !== String(req.auth.sub)) return res.status(404).json({ error: 'Booking not found' });
      const terminal = require('./kinds').KINDS[kind].ops?.terminal?.includes(doc.status);
      const bt = require('./boost-tip');
      const s = await bt.settings();
      res.json({
        kind,
        cancel: terminal ? null : await customerCancelQuote(kind, doc),
        reasons: CUSTOMER_REASONS,
        boost: await bt.boostView(kind, doc, s),
        tip: await bt.tipView(kind, doc, s),
        reschedule: terminal ? { allowed: false } : await require('./reschedule').view(kind, doc),
        arrival: await require('./promise').viewFor(doc._id),
        ...(terminal ? {} : await require('./give-back').customerView(kind, doc)),
      });
    } catch (err) { next(err); }
  });

/** Boost while searching, tip once done (jobs/boost-tip). */
router.post('/:id/boost',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 60_000, max: 10, prefix: 'jobboost' }),
  validate(Joi.object({ amountPaise: Joi.number().integer().min(100).max(1000000).required() })),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./boost-tip').addBoost({ kind, id: req.params.id, userId: req.auth.sub, amountPaise: req.body.amountPaise }));
    } catch (err) { next(err); }
  });

router.post('/:id/tip',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 60_000, max: 5, prefix: 'jobtip' }),
  validate(Joi.object({
    // 0 takes a tip off the bill (method with_payment) before it is paid.
    amountPaise: Joi.number().integer().min(0).max(1000000).required(),
    method: Joi.string().valid('wallet', 'cash', 'with_payment').default('wallet'),
    message: Joi.string().trim().max(200).allow(''),
  })),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./boost-tip').addTip({ kind, id: req.params.id, userId: req.auth.sub, ...req.body }));
    } catch (err) { next(err); }
  });

/**
 * How soon someone verified for a service can be at this spot, before booking
 * (jobs/arrival). line: a service line code, or a helping serviceType.
 */
router.get('/arrival',
  authenticate,
  makeLimiter({ windowMs: 60_000, max: 30, prefix: 'jobarrival' }),
  async (req, res, next) => {
    try {
      const lat = Number(req.query.lat); const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Choose a location first.' });
      const { HELPING_LINE } = require('./kinds');
      const line = HELPING_LINE[req.query.line] || String(req.query.line || '').slice(0, 60);
      res.json({ arrival: await require('./arrival').nearest({ lineCode: line, lat, lng }) });
    } catch (err) { next(err); }
  });

/**
 * The surge lines for a price screen, and a lock that holds them (jobs/surge).
 * kind + line + where + the price the surge applies to (service, not parts).
 */
router.get('/surge-quote',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 60_000, max: 60, prefix: 'jobsurge' }),
  async (req, res, next) => {
    try {
      const lat = Number(req.query.lat); const lng = Number(req.query.lng);
      const kind = ['repair', 'pet', 'helping'].includes(req.query.kind) ? req.query.kind : null;
      if (!kind || !Number.isFinite(lat) || !Number.isFinite(lng)) return res.json({ quoteId: null, lines: [], totalPaise: 0 });
      const { HELPING_LINE } = require('./kinds');
      let line = String(req.query.line || '').slice(0, 60);
      if (kind === 'helping') line = HELPING_LINE[line] || line;
      if (kind === 'repair' && req.query.vertical) line = await require('./kinds').KINDS.repair.line({ vertical: req.query.vertical }) || line;
      const visit = require('./surge').isVisit(kind, { serviceMode: req.query.serviceMode || (kind === 'repair' ? 'doorstep' : undefined) });
      res.json(await require('./surge').quote({ kind, line, lat, lng, basePaise: Math.max(0, Number(req.query.basePaise) || 0), userId: req.auth.sub, visit }));
    } catch (err) { next(err); }
  });

/** Move a booking made for later, before the provider sets off (jobs/reschedule). */
router.post('/:id/reschedule',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 10 * 60_000, max: 10, prefix: 'jobmove' }),
  validate(Joi.object({ scheduledAt: Joi.date().iso().required() })),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./reschedule').reschedule({ kind, id: req.params.id, userId: req.auth.sub, scheduledAt: req.body.scheduledAt }));
    } catch (err) { next(err); }
  });

router.post('/:id/provider-absent',
  authenticate, requireRole('user'),
  makeLimiter({ windowMs: 10 * 60_000, max: 5, prefix: 'jobabsent' }),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./give-back').reportProviderAbsent({ kind, id: req.params.id, userId: req.auth.sub }));
    } catch (err) { next(err); }
  });

/** The provider's side: may they hand it back, what it costs, and the door wait. */
router.get('/:id/give-back',
  authenticate, requireRole('worker', 'shop'),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      const gb = require('./give-back');
      const doc = await require('./kinds').KINDS[kind].model().findById(req.params.id).lean();
      const actor = actorOf(req);
      const view = await gb.providerView(kind, doc);
      const quote = view.canGiveBack ? await gb.preview({ kind, id: req.params.id, actor, reason: req.query.reason || 'other' }) : null;
      res.json({ kind, ...view, quote });
    } catch (err) { next(err); }
  });

router.post('/:id/give-back',
  authenticate, requireRole('worker', 'shop'),
  makeLimiter({ windowMs: 60_000, max: 10, prefix: 'jobgiveback' }),
  validate(Joi.object({ reason: Joi.string().max(40).required(), note: Joi.string().trim().max(300).allow('', null) })),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./give-back').giveBack({ kind, id: req.params.id, actor: actorOf(req), reason: req.body.reason, note: req.body.note || '' }));
    } catch (err) { next(err); }
  });

router.post('/:id/customer-absent',
  authenticate, requireRole('worker', 'shop'),
  makeLimiter({ windowMs: 60_000, max: 10, prefix: 'jobnoshow' }),
  async (req, res, next) => {
    try {
      const { kind } = await jobFor(req, '_id');
      res.json(await require('./give-back').reportCustomerAbsent({ kind, id: req.params.id, actor: actorOf(req) }));
    } catch (err) { next(err); }
  });

module.exports = router;
