/**
 * ZappyOne's own staff, in the Rakshak app (workforce/): their shifts, check
 * in and out at the hub, their salary for the month, and leave.
 */
const express = require('express');
const Joi = require('joi');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const shifts = require('./shifts.service');
const payroll = require('./payroll.service');
const Leave = require('./leave.model');

const router = express.Router();
router.use(authenticate, requireRole('worker'));

/** Am I staff, and if so my hub, today's shift and the coming days. Partners get { staff: false }. */
router.get('/me', async (req, res, next) => {
  try {
    const w = await require('../worker/worker.model').findById(req.auth.sub).select('employment').lean();
    if (w?.employment?.type !== 'staff') return res.json({ staff: false });
    res.json({ staff: true, staffId: await require('./staff-id').ensure(req.auth.sub), ...(await shifts.myShifts(req.auth.sub)) });
  } catch (err) { next(err); }
});

router.post('/shifts', validate(Joi.object({ day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), code: Joi.string().max(20).required() })),
  async (req, res, next) => {
    try { res.status(201).json({ shift: await shifts.book({ workerId: req.auth.sub, ...req.body }) }); } catch (err) { next(err); }
  });

router.delete('/shifts/:id', async (req, res, next) => {
  try { res.json({ shift: await shifts.cancel({ workerId: req.auth.sub, shiftId: req.params.id }) }); } catch (err) { next(err); }
});

router.post('/check-in', validate(Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required(), selfieKey: Joi.string().max(300).required() })),
  async (req, res, next) => {
    try { res.json({ shift: await shifts.checkIn({ workerId: req.auth.sub, ...req.body }), message: 'You are on duty. Jobs near you come to you first.' }); } catch (err) { next(err); }
  });

router.post('/check-out', async (req, res, next) => {
  try { res.json({ shift: await shifts.checkOut({ workerId: req.auth.sub }), message: 'Shift ended. Deposit any cash at the hub.' }); } catch (err) { next(err); }
});

router.get('/salary', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : undefined;
    res.json({ salary: await payroll.myMonth(req.auth.sub, month) });
  } catch (err) { next(err); }
});

router.get('/leave', async (req, res, next) => {
  try { res.json({ leave: await Leave.find({ workerId: req.auth.sub }).sort({ day: -1 }).limit(30).lean() }); } catch (err) { next(err); }
});

router.post('/leave', validate(Joi.object({ day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), reason: Joi.string().trim().max(200).allow('') })),
  async (req, res, next) => {
    try {
      const w = await require('../worker/worker.model').findById(req.auth.sub).select('employment').lean();
      if (w?.employment?.type !== 'staff') return res.status(403).json({ error: 'Leave is for ZappyOne staff.', code: 'NOT_STAFF' });
      if (req.body.day < shifts.istDay()) return res.status(409).json({ error: 'Pick today or a day ahead.', code: 'PAST' });
      const leave = await Leave.findOneAndUpdate({ workerId: req.auth.sub, day: req.body.day },
        { $set: { reason: req.body.reason || '', status: 'requested', decidedBy: null, decidedAt: null } }, { upsert: true, new: true });
      res.status(201).json({ leave, message: 'Leave requested. Your manager will confirm.' });
    } catch (err) { next(err); }
  });

module.exports = router;
