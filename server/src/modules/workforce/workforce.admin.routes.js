/**
 * Admin → Workforce: hubs, who is staff (hub and salary), the roster,
 * attendance, leave and payroll (workforce/). Mounted under the admin portal,
 * which already requires an admin.
 */
const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const Hub = require('./hub.model');
const Leave = require('./leave.model');
const shifts = require('./shifts.service');
const payroll = require('./payroll.service');
const Worker = require('../worker/worker.model');
const auditService = require('../admin/audit.service');

const router = express.Router();
router.use(require('./activity').recorder);

router.get('/workforce/activity', validate(Joi.object({ page: Joi.number().integer().min(1).max(10000), actorId: Joi.string().hex().length(24) }), 'query'), async (req, res, next) => {
  try { res.json(await require('./activity').list({ page: Number(req.query.page) || 1, actorId: req.query.actorId || null })); } catch (err) { next(err); }
});

const hubBody = Joi.object({
  name: Joi.string().trim().max(60),
  city: Joi.string().trim().max(40),
  address: Joi.string().trim().max(300).allow(''),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  radiusM: Joi.number().integer().min(50).max(2000),
  serviceKm: Joi.number().min(1).max(50),
  area: Joi.array().items(Joi.array().ordered(Joi.number().min(-180).max(180).required(), Joi.number().min(-90).max(90).required())).min(3).max(200).allow(null),
  shifts: Joi.array().items(Joi.object({
    code: Joi.string().trim().max(20).required(), label: Joi.string().trim().max(40).required(),
    start: Joi.string().pattern(/^\d{2}:\d{2}$/).required(), end: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    need: Joi.number().integer().min(0).max(200).required(),
  })).max(8),
  isActive: Joi.boolean(),
});

const toDoc = (b) => {
  const out = {};
  for (const k of ['name', 'city', 'radiusM', 'serviceKm', 'shifts', 'isActive']) if (b[k] !== undefined) out[k] = b[k];
  if (b.address !== undefined) out['meetingPoint.address'] = b.address;
  if (b.lat !== undefined && b.lng !== undefined) out['meetingPoint.location'] = { type: 'Point', coordinates: [b.lng, b.lat] };
  if (b.area) out.area = require('./coverage').toPolygon(b.area);
  return out;
};

router.get('/workforce/hubs', async (req, res, next) => {
  try {
    const [hubs, counts] = await Promise.all([
      Hub.find().sort({ city: 1, name: 1 }).lean(),
      Worker.aggregate([{ $match: { 'employment.type': 'staff' } }, { $group: { _id: '$employment.hubId', n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ hubs: hubs.map((h) => ({ ...h, id: String(h._id), staff: n.get(String(h._id)) || 0 })) });
  } catch (err) { next(err); }
});

router.post('/workforce/hubs', validate(hubBody.fork(['name', 'city', 'lat', 'lng'], (f) => f.required())), async (req, res, next) => {
  try {
    const hub = await Hub.create({
      name: req.body.name, city: req.body.city, radiusM: req.body.radiusM, serviceKm: req.body.serviceKm, shifts: req.body.shifts || [],
      meetingPoint: { address: req.body.address || '', location: { type: 'Point', coordinates: [req.body.lng, req.body.lat] } },
      ...(req.body.area ? { area: require('./coverage').toPolygon(req.body.area) } : {}),
    });
    await auditService.fromRequest(req, 'workforce.hub_create', { kind: 'hub', id: hub._id }, null, req.body);
    res.status(201).json({ hub });
  } catch (err) { next(err); }
});

router.put('/workforce/hubs/:id', validate(hubBody.min(1)), async (req, res, next) => {
  try {
    const before = await Hub.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ error: 'Hub not found' });
    const hub = await Hub.findByIdAndUpdate(req.params.id, { $set: toDoc(req.body), ...(req.body.area === null ? { $unset: { area: 1 } } : {}) }, { new: true, runValidators: true }).lean();
    await auditService.fromRequest(req, 'workforce.hub_update', { kind: 'hub', id: req.params.id }, before, hub);
    res.json({ hub });
  } catch (err) { next(err); }
});

/** Staff, and anyone to make staff: search Rakshak workers by name or phone. */
router.get('/workforce/staff', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q
      ? { $or: [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { phone: new RegExp(q.replace(/\D/g, '') || '^$') }], shopId: null }
      : { 'employment.type': 'staff' };
    const workers = await Worker.find(filter).select('name phone employment isOnline').sort({ name: 1 }).limit(100).lean();
    res.json({ workers });
  } catch (err) { next(err); }
});

router.patch('/workforce/staff/:workerId', validate(Joi.object({
  type: Joi.string().valid('partner', 'staff').required(),
  hubId: Joi.string().hex().length(24).allow(null),
  salaryRupees: Joi.number().min(0).max(500000),
})), async (req, res, next) => {
  try {
    const before = await Worker.findById(req.params.workerId).select('employment shopId').lean();
    if (!before) return res.status(404).json({ error: 'Worker not found' });
    if (before.shopId) return res.status(409).json({ error: 'A shop’s technician cannot be ZappyOne staff.', code: 'SHOP_TECHNICIAN' });
    const staff = req.body.type === 'staff';
    if (staff && !req.body.hubId) return res.status(400).json({ error: 'Pick their hub.', code: 'NO_HUB' });
    const set = {
      'employment.type': req.body.type,
      'employment.hubId': staff ? req.body.hubId : null,
      ...(req.body.salaryRupees !== undefined ? { 'employment.salaryPaise': Math.round(req.body.salaryRupees * 100) } : {}),
      ...(staff && !before.employment?.joinedAt ? { 'employment.joinedAt': new Date() } : {}),
    };
    const after = await Worker.findByIdAndUpdate(req.params.workerId, { $set: set }, { new: true }).select('name phone employment').lean();
    require('./staff').forget(req.params.workerId);
    await auditService.fromRequest(req, 'workforce.staff_set', { kind: 'worker', id: req.params.workerId }, before.employment, after.employment);
    res.json({ worker: after });
  } catch (err) { next(err); }
});

/** What needs a person now (workforce/watchdog). */
router.get('/workforce/attention', async (req, res, next) => {
  try { res.json(await require('./watchdog.service').attention()); } catch (err) { next(err); }
});

/** Fill a hub's empty places for the coming week with staff who are free. */
router.post('/workforce/roster/auto-fill', validate(Joi.object({ hubId: Joi.string().hex().length(24).required() })), async (req, res, next) => {
  try {
    const out = await require('./watchdog.service').autoFill({ hubId: req.body.hubId });
    await auditService.fromRequest(req, 'workforce.roster_autofill', { kind: 'hub', id: req.body.hubId }, null, out);
    res.json(out);
  } catch (err) { next(err); }
});

/** The selfie a staff member checked in with: proof they were at the hub. */
router.get('/workforce/shifts/:id/selfie', async (req, res, next) => {
  try {
    const s = await require('./shift.model').findById(req.params.id).select('checkInSelfie').lean();
    if (!s?.checkInSelfie) return res.status(404).json({ error: 'No check-in selfie for this shift' });
    await require('../../core/storage/s3').streamToResponse(s.checkInSelfie, res);
  } catch (err) { next(err); }
});

router.get('/workforce/roster', async (req, res, next) => {
  try {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : undefined;
    res.json(await shifts.roster({ hubId: req.query.hubId, from, days: Math.min(14, Number(req.query.days) || 7) }));
  } catch (err) { next(err); }
});

router.post('/workforce/roster', validate(Joi.object({ workerId: Joi.string().hex().length(24).required(), day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), code: Joi.string().max(20).required() })),
  async (req, res, next) => {
    try {
      const shift = await shifts.book({ ...req.body, by: 'admin' });
      await auditService.fromRequest(req, 'workforce.shift_assign', { kind: 'shift', id: shift._id }, null, req.body);
      res.status(201).json({ shift });
    } catch (err) { next(err); }
  });

router.delete('/workforce/roster/:shiftId', async (req, res, next) => {
  try {
    const s = await require('./shift.model').findById(req.params.shiftId).lean();
    if (!s) return res.status(404).json({ error: 'Shift not found' });
    const shift = await shifts.cancel({ workerId: s.workerId, shiftId: s._id, by: 'admin' });
    await auditService.fromRequest(req, 'workforce.shift_remove', { kind: 'shift', id: s._id }, s, shift);
    res.json({ shift });
  } catch (err) { next(err); }
});

router.get('/workforce/leave', async (req, res, next) => {
  try {
    const leave = await Leave.find({ status: req.query.status || 'requested' }).sort({ day: 1 }).limit(200).populate('workerId', 'name phone').lean();
    res.json({ leave });
  } catch (err) { next(err); }
});

router.post('/workforce/leave/:id', validate(Joi.object({ decision: Joi.string().valid('approved', 'rejected').required() })), async (req, res, next) => {
  try {
    const leave = await Leave.findByIdAndUpdate(req.params.id, { $set: { status: req.body.decision, decidedBy: String(req.auth.sub), decidedAt: new Date() } }, { new: true }).lean();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    await auditService.fromRequest(req, `workforce.leave_${req.body.decision}`, { kind: 'leave', id: leave._id }, null, leave);
    res.json({ leave });
  } catch (err) { next(err); }
});

router.get('/workforce/payroll', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : undefined;
    const out = await payroll.payroll(month, req.query.hubId || null);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="zappyone-payroll-${out.month}.csv"`);
      return res.send(payroll.toCsv(out));
    }
    res.json(out);
  } catch (err) { next(err); }
});

/* Fleet finance: kept apart from the marketplace's money (workforce/finance). */

router.get('/workforce/finance', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : undefined;
    res.json(await require('./finance.service').hubFinance(month));
  } catch (err) { next(err); }
});

router.get('/workforce/expenses', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : payroll.monthOf();
    res.json({ expenses: await require('./finance.service').listExpenses({ month, hubId: req.query.hubId }), categories: require('./expense.model').CATEGORIES });
  } catch (err) { next(err); }
});

router.post('/workforce/expenses', validate(Joi.object({
  hubId: Joi.string().hex().length(24).allow(null),
  category: Joi.string().valid(...require('./expense.model').CATEGORIES).required(),
  amountRupees: Joi.number().min(1).max(10000000).required(),
  day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  note: Joi.string().trim().max(200).allow(''),
  receiptKey: Joi.string().max(300).allow(''),
  workerId: Joi.string().hex().length(24).allow(null),
})), async (req, res, next) => {
  try {
    const { amountRupees, ...rest } = req.body;
    const expense = await require('./expense.model').create({ ...rest, amountPaise: Math.round(amountRupees * 100), createdBy: String(req.auth.sub) });
    await auditService.fromRequest(req, 'workforce.expense_add', { kind: 'expense', id: expense._id }, null, req.body);
    res.status(201).json({ expense });
  } catch (err) { next(err); }
});

router.delete('/workforce/expenses/:id', async (req, res, next) => {
  try {
    const before = await require('./expense.model').findByIdAndDelete(req.params.id).lean();
    if (!before) return res.status(404).json({ error: 'Expense not found' });
    await auditService.fromRequest(req, 'workforce.expense_remove', { kind: 'expense', id: req.params.id }, before, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** A staff member handed in cash at the hub: their owed balance goes down (worker dues ledger). */
router.post('/workforce/cash-deposit', validate(Joi.object({
  workerId: Joi.string().hex().length(24).required(), amountRupees: Joi.number().min(1).max(1000000).required(), reference: Joi.string().trim().max(80).allow(''),
})), async (req, res, next) => {
  try {
    const out = await require('../worker/worker-dues.service').recordPayment({
      workerId: req.body.workerId, amountPaise: Math.round(req.body.amountRupees * 100), method: 'cash', reference: req.body.reference || 'Hub deposit', adminId: req.auth.sub,
    });
    await auditService.fromRequest(req, 'workforce.cash_deposit', { kind: 'worker', id: req.body.workerId }, null, req.body);
    res.json(out);
  } catch (err) { next(err); }
});

/* Overview analytics and dark-store stock (workforce/analytics, workforce/stock). */

router.get('/workforce/overview', async (req, res, next) => {
  try { res.json(await require('./analytics.service').overview({ days: req.query.days })); } catch (err) { next(err); }
});

router.get('/workforce/stock', async (req, res, next) => {
  try {
    const stock = require('./stock.service');
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : payroll.monthOf();
    const [items, moves] = await Promise.all([stock.items(req.query.hubId || null), stock.moves({ hubId: req.query.hubId || null, month })]);
    res.json({ items, moves });
  } catch (err) { next(err); }
});

router.post('/workforce/stock/items', validate(Joi.object({
  hubId: Joi.string().hex().length(24).required(), name: Joi.string().trim().max(80).required(), sku: Joi.string().trim().max(40).allow(''),
  unit: Joi.string().trim().max(20).allow(''), reorderAt: Joi.number().min(0).max(100000),
})), async (req, res, next) => {
  try {
    const item = await require('./stock.service').addItem(req.body);
    await auditService.fromRequest(req, 'workforce.stock_item', { kind: 'stock', id: item._id }, null, req.body);
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

router.post('/workforce/stock/:itemId/:action', validate(Joi.object({
  qty: Joi.number().min(0).max(100000), countedQty: Joi.number().min(0).max(100000), unitCostRupees: Joi.number().min(0).max(1000000),
  supplier: Joi.string().trim().max(80).allow(''), workerId: Joi.string().hex().length(24).allow(null, ''), jobRef: Joi.string().trim().max(40).allow(''),
  note: Joi.string().trim().max(200).allow(''), receiptKey: Joi.string().max(300).allow(''), day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
})), async (req, res, next) => {
  try {
    const stock = require('./stock.service');
    const by = String(req.auth.sub);
    const { itemId, action } = req.params;
    const b = req.body;
    let out;
    if (action === 'purchase') out = await stock.purchase({ itemId, qty: b.qty, unitCostPaise: Math.round((b.unitCostRupees || 0) * 100), supplier: b.supplier, note: b.note, day: b.day, by, receiptKey: b.receiptKey });
    else if (action === 'issue') out = await stock.issue({ itemId, qty: b.qty, workerId: b.workerId || null, jobRef: b.jobRef, note: b.note, day: b.day, by });
    else if (action === 'adjust') out = await stock.adjust({ itemId, countedQty: b.countedQty, note: b.note, day: b.day, by });
    else return res.status(404).json({ error: 'Unknown action' });
    await auditService.fromRequest(req, `workforce.stock_${action}`, { kind: 'stock', id: itemId }, null, b);
    res.json(out);
  } catch (err) { next(err); }
});

router.get('/workforce/settings', async (req, res, next) => {
  try { res.json({ settings: await require('../pricing/services/config.service').workforceSettings() }); } catch (err) { next(err); }
});

router.put('/workforce/settings', validate(Joi.object({
  workingDays: Joi.number().integer().min(20).max(31), checkInEarlyMin: Joi.number().integer().min(0).max(120), lateGraceMin: Joi.number().integer().min(0).max(60),
}).min(1)), async (req, res, next) => {
  try {
    const cfg = require('../pricing/services/config.service');
    const before = await cfg.workforceSettings();
    await cfg.updateActiveConfig({ workforce: { ...before, ...req.body } }, req.auth.sub);
    const after = await cfg.workforceSettings();
    await auditService.fromRequest(req, 'economics.workforce', { kind: 'system', id: null }, before, after);
    res.json({ settings: after });
  } catch (err) { next(err); }
});

module.exports = router;
