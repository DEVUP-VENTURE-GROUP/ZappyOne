const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const User = require('../user/user.model');
const Worker = require('../worker/worker.model');
const Shop = require('../shop/shop.model');
const { ServiceLine } = require('../onboarding/onboarding.model');
const {
  SOURCES, listBookings, findBookingBySource, bucketFor, HELPING_LABEL,
} = require('./bookings.source');

/**
 * One Bookings view across every engine (orders, repair, helping, pet).
 * Mounted under the admin router, which already requires an admin token.
 */
const router = express.Router();

const idList = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean).map(String))];

/** Names customers and ops recognise, resolved in three batched queries — never one per row. */
async function enrich(rows) {
  const EventPartner = require('../events/event-partner.model');
  const [users, workers, shops, lines, partners] = await Promise.all([
    User.find({ _id: { $in: idList(rows, 'userId') } }).select('name phone').lean(),
    Worker.find({ _id: { $in: idList(rows, 'workerId') } }).select('name phone').lean(),
    Shop.find({ _id: { $in: idList(rows, 'shopId') } }).select('businessName phone').lean(),
    ServiceLine.find({}).select('code name repairVertical').lean(),
    EventPartner.find({ _id: { $in: idList(rows, 'partnerId') } }).select('businessName phone').lean(),
  ]);
  const byId = (list) => new Map(list.map((d) => [String(d._id), d]));
  const u = byId(users), w = byId(workers), s = byId(shops), ep = byId(partners);
  // Service names come from the admin catalog so a renamed service reads right everywhere.
  const lineByVertical = new Map(lines.filter((l) => l.repairVertical).map((l) => [l.repairVertical, l.name]));
  const lineByCode = new Map(lines.map((l) => [l.code, l.name]));
  const nameOf = (r) => (r.source === 'repair' ? lineByVertical.get(r.vertical)
    : r.source === 'pet' ? lineByCode.get(r.vertical)
      : r.source === 'helping' ? HELPING_LABEL[r.vertical] : null) || r.serviceName;

  return rows.map((r) => ({
    ...r,
    serviceName: nameOf(r),
    customer: u.get(String(r.userId)) ? { name: u.get(String(r.userId)).name, phone: u.get(String(r.userId)).phone } : null,
    provider: r.shopId && s.get(String(r.shopId))
      ? { kind: 'shop', name: s.get(String(r.shopId)).businessName, phone: s.get(String(r.shopId)).phone }
      : r.workerId && w.get(String(r.workerId))
        ? { kind: 'worker', name: w.get(String(r.workerId)).name, phone: w.get(String(r.workerId)).phone }
        : r.partnerId && ep.get(String(r.partnerId))
          ? { kind: 'event_partner', name: ep.get(String(r.partnerId)).businessName, phone: ep.get(String(r.partnerId)).phone }
          : null,
  }));
}

router.get('/bookings',
  validate(Joi.object({
    source: Joi.string().valid(...SOURCES),
    bucket: Joi.string().valid('active', 'completed', 'cancelled', 'disputed', 'other'),
    q: Joi.string().trim().max(40).allow(''),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }), 'query'),
  async (req, res, next) => {
    try {
      const { source, bucket, q, from, to, page, limit } = req.query;
      const search = {};
      if (q) {
        // Digits = a customer's phone; anything else = a booking reference.
        const digits = q.replace(/\D/g, '');
        if (digits.length >= 6 && digits.length === q.replace(/[\s+-]/g, '').length) {
          const found = await User.find({ phone: new RegExp(`${digits.slice(-10)}$`) }).select('_id').limit(50).lean();
          if (!found.length) return res.json({ rows: [], total: 0, page, limit });
          search.userIds = found.map((f) => String(f._id));
        } else {
          search.reference = q;
        }
      }
      const out = await listBookings({
        sources: source ? [source] : SOURCES, statusBucket: bucket, from, to, page, limit, ...search,
      });
      res.json({ ...out, rows: await enrich(out.rows) });
    } catch (err) { next(err); }
  });

/** What an admin may do to a booking, by engine — each action calls that engine's own endpoint. */
function actionsFor(source, raw) {
  const bucket = bucketFor(raw.status);
  return {
    cancel: bucket === 'active',
    // Mirrors the refund endpoint: only online payments that were captured.
    refund: source === 'order' && raw.payment?.status === 'paid' && raw.payment?.method !== 'cash',
    reassign: source === 'order' && bucket === 'active',
    // Assign or move a live repair, pet or helping job (jobs/intervention).
    intervene: require('../jobs/intervention.service').canIntervene(source, raw.status),
    helpingRefundOutcome: source === 'helping' && ['CANCELLED', 'FAILED', 'REFUNDED'].includes(raw.status),
  };
}

router.get('/bookings/:source/:id', async (req, res, next) => {
  try {
    const { source, id } = req.params;
    if (!SOURCES.includes(source) || !/^[0-9a-f]{24}$/i.test(id)) return res.status(400).json({ error: 'Unknown booking' });
    const raw = await findBookingBySource(source, id);
    if (!raw) return res.status(404).json({ error: 'Booking not found' });

    const { NORMALISERS } = require('./bookings.source');
    const [row] = await enrich([NORMALISERS[source](raw)]);
    const history = (raw.statusHistory || raw.timeline || []).map((h) => ({
      status: h.status, at: h.at || h.timestamp, by: h.byRole || h.actorRole || h.by || '', note: h.note || h.reason || '',
    }));
    const address = raw.location?.address || raw.pickupLocation?.address || raw.serviceLocation?.address
      || [raw.address?.line1, raw.address?.city].filter(Boolean).join(', ') || '';
    res.json({ booking: row, history, address, actions: actionsFor(source, raw) });
  } catch (err) { next(err); }
});

/* Intervention: who could take a live job, hand it over, and team notes. */
const intervention = require('../jobs/intervention.service');
const auditService = require('../admin/audit.service');
const JOB_KINDS = ['repair', 'pet', 'helping'];
const validJob = (req, res) => {
  const { source, id } = req.params;
  if (!JOB_KINDS.includes(source) || !/^[0-9a-f]{24}$/i.test(id)) { res.status(400).json({ error: 'Unknown booking' }); return false; }
  return true;
};

router.get('/bookings/:source/:id/candidates', async (req, res, next) => {
  try {
    if (!validJob(req, res)) return;
    res.json(await intervention.candidates(req.params.source, req.params.id));
  } catch (err) { next(err); }
});

router.post('/bookings/:source/:id/assign',
  validate(Joi.object({
    providerKind: Joi.string().valid('worker', 'shop').required(),
    providerId: Joi.string().hex().length(24).required(),
    reason: Joi.string().trim().min(5).max(300).required(),
  })),
  async (req, res, next) => {
    try {
      if (!validJob(req, res)) return;
      const out = await intervention.assign({ kind: req.params.source, id: req.params.id, ...req.body, adminId: req.auth.sub });
      await auditService.fromRequest(req, 'job.assign', { kind: req.params.source, id: req.params.id }, null, { ...req.body, ...out });
      res.json(out);
    } catch (err) { next(err); }
  });

router.get('/bookings/:source/:id/notes', async (req, res, next) => {
  try {
    if (!SOURCES.includes(req.params.source) || !/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Unknown booking' });
    res.json({ notes: await intervention.listNotes(req.params.source, req.params.id) });
  } catch (err) { next(err); }
});

router.post('/bookings/:source/:id/notes',
  validate(Joi.object({ text: Joi.string().trim().min(2).max(1000).required() })),
  async (req, res, next) => {
    try {
      if (!SOURCES.includes(req.params.source) || !/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Unknown booking' });
      const note = await intervention.addNote({ kind: req.params.source, id: req.params.id, text: req.body.text, adminId: req.auth.sub, adminEmail: req.auth.email });
      res.status(201).json({ note });
    } catch (err) { next(err); }
  });

/* Economics: every service line's customer fee, provider commission and tax */

const fees = require('./fees.service');

router.get('/fees', async (req, res, next) => {
  try { res.json({ lines: await fees.list(), defaults: fees.DEFAULTS }); } catch (err) { next(err); }
});

router.put('/fees/:line/:key',
  validate(Joi.object({
    platformFeePaise: Joi.number().integer().min(0).max(100000),
    commissionPct: Joi.number().min(0).max(100),
    taxPct: Joi.number().min(0).max(40),
  }).or('platformFeePaise', 'commissionPct', 'taxPct')),
  async (req, res, next) => {
    try {
      const { line, key } = req.params;
      const out = await fees.update({ line, key, ...req.body, adminId: req.auth.sub });
      await auditService.fromRequest(req, 'fees.update', { kind: `${line}_fees`, id: key }, out.before, out.after);
      res.json({ lines: await fees.list() });
    } catch (err) { next(err); }
  });

module.exports = router;
