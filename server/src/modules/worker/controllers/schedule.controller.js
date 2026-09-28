const Worker = require('../worker.model');

/** Shifts, wellness breaks and blocking a customer. */

/* Shift Slots */

async function getShifts(req, res, next) {
  try {
    const availService = require('../availability.service');
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to   = req.query.to   ? new Date(req.query.to)   : new Date(Date.now() + 7 * 86400000);
    const shifts = await availService.getShifts({ workerId: req.auth.sub, fromDate: from, toDate: to });
    const today  = await availService.getTodayShifts(req.auth.sub);
    res.json({ shifts, today });
  } catch (err) { next(err); }
}

async function previewShift(req, res, next) {
  try {
    const availService = require('../availability.service');
    const { startHour, endHour, lat, lng } = req.query;
    if (!startHour || !endHour || !lat || !lng) {
      return res.status(400).json({ error: 'startHour, endHour, lat, lng required' });
    }
    const data = await availService.previewShift({
      startHour: Number(startHour),
      endHour:   Number(endHour),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
    });
    res.json(data);
  } catch (err) { next(err); }
}

async function commitShift(req, res, next) {
  try {
    const availService = require('../availability.service');
    const { startHour, endHour, lat, lng, date, zoneLabel } = req.body;
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
      return res.status(400).json({ error: 'startHour and endHour must be integers' });
    }
    const result = await availService.commitShift({
      workerId: req.auth.sub,
      date: date ? new Date(date) : new Date(),
      startHour,
      endHour,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      zoneLabel,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function cancelShiftSlot(req, res, next) {
  try {
    const availService = require('../availability.service');
    const doc = await availService.cancelSlot({
      workerId: req.auth.sub,
      startHour: Number(req.body.startHour),
      date: req.body.date ? new Date(req.body.date) : new Date(),
    });
    res.json({ ok: true, doc });
  } catch (err) { next(err); }
}

/* Wellness */

async function getWellness(req, res, next) {
  try {
    const wellnessService = require('../wellness.service');
    const data = await wellnessService.computeWellnessScore(req.auth.sub);
    if (!data) return res.status(404).json({ error: 'Worker not found' });
    res.json(data);
  } catch (err) { next(err); }
}

async function claimBreakBonus(req, res, next) {
  try {
    const wellnessService = require('../wellness.service');
    const result = await wellnessService.creditBreakBonus(req.auth.sub);
    if (!result.ok) return res.status(400).json({ error: 'No break bonus available right now' });
    res.json(result);
  } catch (err) { next(err); }
}

/* Block Customer */

async function blockCustomer(req, res, next) {
  try {
    const { userId, orderId, reason } = req.body;
    const mongoose = require('mongoose');
    const uid = new mongoose.Types.ObjectId(userId);
    await Worker.updateOne({ _id: req.auth.sub }, { $addToSet: { 'trust.blockedFromUserIds': uid } });
    // Log the block with context for admin review
    const logger = require('../../../core/logger');
    logger.info({ workerId: req.auth.sub, userId, orderId, reason }, '[WORKER] Customer blocked by worker — pending admin review');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  getShifts,
  previewShift,
  commitShift,
  cancelShiftSlot,
  getWellness,
  claimBreakBonus,
  blockCustomer,
};
