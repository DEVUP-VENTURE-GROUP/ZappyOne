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

/* Bookings → Needs intervention: stuck jobs and jobs still waiting for a provider */

router.get('/bookings/attention', async (req, res, next) => {
  try { res.json(await require('../jobs/ops.service').attention()); } catch (err) { next(err); }
});

/* Overview → what customers are searching for, and what we could not serve */

router.get('/alerts/search-demand', async (req, res, next) => {
  try { res.json(await require('./search-demand.service').summary()); } catch (err) { next(err); }
});

/* Insights: the business from the bookings taken today (repair, pet, helping, events) */

// Where bookings go wrong: made, finished, cancelled, no provider, waiting, and acceptance time (admin-portal/booking-health).
router.get('/insights/booking-health', async (req, res, next) => {
  try { res.json(await require('./booking-health.service').bookingHealth({ days: req.query.days })); } catch (err) { next(err); }
});

router.get('/insights/overview', async (req, res, next) => {
  try { res.json(await require('./analytics.service').overview({ days: Number(req.query.days) || 7 })); } catch (err) { next(err); }
});

router.get('/insights/supply', async (req, res, next) => {
  try { res.json(await require('./analytics.service').supply({ days: Number(req.query.days) || 7 })); } catch (err) { next(err); }
});

router.get('/insights/funnel', async (req, res, next) => {
  try { res.json(await require('./analytics.service').funnel({ days: Number(req.query.days) || 7 })); } catch (err) { next(err); }
});

router.get('/insights/customers', async (req, res, next) => {
  try { res.json(await require('./analytics.service').customers({ days: Number(req.query.days) || 30 })); } catch (err) { next(err); }
});

router.get('/insights/money', async (req, res, next) => {
  try { res.json(await require('./analytics.service').money({ days: Number(req.query.days) || 30 })); } catch (err) { next(err); }
});

router.get('/insights/live', async (req, res, next) => {
  try { res.json(await require('./analytics.service').live()); } catch (err) { next(err); }
});

router.get('/insights/geo', async (req, res, next) => {
  try { res.json(await require('./analytics.service').geo({ days: Number(req.query.days) || 30, service: req.query.service || null })); } catch (err) { next(err); }
});

router.get('/insights/demand', async (req, res, next) => {
  try { res.json(await require('./search-demand.service').demand({ days: Number(req.query.days) || 7 })); } catch (err) { next(err); }
});

/* Reviews: reported and auto-flagged reviews, and the admin's decision */

const reviews = require('../review/review.service');

router.get('/reviews', async (req, res, next) => {
  try {
    res.json(await reviews.adminList({
      flagged: req.query.flagged === '1', rating: req.query.rating, page: Math.max(1, Number(req.query.page) || 1),
    }));
  } catch (err) { next(err); }
});

router.patch('/reviews/:id',
  validate(Joi.object({
    action: Joi.string().valid('hide', 'show', 'exclude', 'include', 'dismiss').required(),
    reason: Joi.string().trim().max(300).allow(''),
  })),
  async (req, res, next) => {
    try {
      if (!/^[0-9a-f]{24}$/i.test(req.params.id)) return res.status(404).json({ error: 'Review not found' });
      const after = await reviews.moderate(req.params.id, req.body, req.auth.sub);
      await auditService.fromRequest(req, `review.${req.body.action}`, { kind: 'review', id: req.params.id }, null, { status: after.status, excluded: after.excluded, reason: req.body.reason });
      res.json({ ok: true });
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

/* Economics → Boost & tips: the first version's settings, edited here */

router.get('/economics/boost-tips', async (req, res, next) => {
  try { res.json({ settings: await require('../jobs/boost-tip').settings() }); } catch (err) { next(err); }
});

router.put('/economics/boost-tips',
  validate(Joi.object({
    boostEnabled: Joi.boolean(),
    boostOptions: Joi.array().items(Joi.number().integer().min(1).max(1000)).min(1).max(8),
    boostMaxPaise: Joi.number().integer().min(0).max(100000),
    tipOptions: Joi.array().items(Joi.number().integer().min(1).max(1000)).min(1).max(6),
    tipMaxPaise: Joi.number().integer().min(0).max(100000),
  }).min(1)),
  async (req, res, next) => {
    try {
      const bt = require('../jobs/boost-tip');
      const before = await bt.settings();
      await require('../pricing/services/config.service').updateActiveConfig(req.body, req.auth.sub);
      const after = await bt.settings();
      await auditService.fromRequest(req, 'economics.boost_tips', { kind: 'system', id: null }, before, after);
      res.json({ settings: after });
    } catch (err) { next(err); }
  });

/* Economics → Dispatch: how fast a job finds its pro (jobs/fast-assign) */

router.get('/economics/dispatch', async (req, res, next) => {
  try { res.json({ settings: await require('../pricing/services/config.service').fastAssignSettings() }); } catch (err) { next(err); }
});

router.put('/economics/dispatch',
  validate(Joi.object({
    enabled: Joi.boolean(),
    firstLookSec: Joi.number().integer().min(10).max(300),
    broadcastSec: Joi.number().integer().min(15).max(600),
    broadcastSize: Joi.number().integer().min(2).max(20),
    deadlineSec: Joi.number().integer().min(60).max(1800),
    autoAcceptKm: Joi.number().min(0.5).max(30),
    widenKm: Joi.number().min(1).max(50),
    autoAcceptPauseDays: Joi.number().integer().min(0).max(90),
    fairBandMin: Joi.number().integer().min(5).max(60),
    staffRingSec: Joi.number().integer().min(5).max(60),
  }).min(1)),
  async (req, res, next) => {
    try {
      const cfg = require('../pricing/services/config.service');
      const before = await cfg.fastAssignSettings();
      const next_ = { ...before, ...req.body };
      if (next_.firstLookSec + next_.broadcastSec > next_.deadlineSec) {
        return res.status(400).json({ error: 'The first look and the broadcast must end before the deadline', code: 'BAD_TIMINGS' });
      }
      if (next_.autoAcceptKm > next_.widenKm) return res.status(400).json({ error: 'The wider radius must be at least the auto-accept radius', code: 'BAD_RADIUS' });
      // Merged with what is set, so changing one timing never resets the others.
      await cfg.updateActiveConfig({ fastAssign: next_ }, req.auth.sub);
      const after = await cfg.fastAssignSettings();
      await auditService.fromRequest(req, 'economics.dispatch', { kind: 'system', id: null }, before, after);
      res.json({ settings: after });
    } catch (err) { next(err); }
  });

/* Economics → Partner commission: percent taken from each kind of partner (shop/partner-commission) */

router.get('/economics/partner-commission', async (req, res, next) => {
  try { res.json({ rates: await require('../pricing/services/config.service').partnerCommissionSettings() }); } catch (err) { next(err); }
});

router.put('/economics/partner-commission',
  validate(Joi.object(Object.fromEntries(['shop', 'agency', 'company', 'individual'].map((k) => [k, Joi.number().min(0).max(50)]))).min(1)),
  async (req, res, next) => {
    try {
      const cfg = require('../pricing/services/config.service');
      const before = await cfg.partnerCommissionSettings();
      await cfg.updateActiveConfig({ partnerCommission: { ...before, ...req.body } }, req.auth.sub);
      const after = await cfg.partnerCommissionSettings();
      await auditService.fromRequest(req, 'economics.partner_commission', { kind: 'system', id: null }, before, after);
      res.json({ rates: after });
    } catch (err) { next(err); }
  });

router.get('/economics/partner-commission/overrides', async (req, res, next) => {
  try { res.json({ overrides: await require('../shop/partner-commission').overrides() }); } catch (err) { next(err); }
});

router.get('/economics/partner-commission/:kind(shop|worker)/:id', async (req, res, next) => {
  try { res.json({ rate: await require('../shop/partner-commission').rateOf({ kind: req.params.kind, id: req.params.id }) }); } catch (err) { next(err); }
});

router.put('/economics/partner-commission/:kind(shop|worker)/:id',
  validate(Joi.object({ pct: Joi.number().min(0).max(50).allow(null).required(), until: Joi.date().iso().allow(null), note: Joi.string().trim().max(200).allow('') })),
  async (req, res, next) => {
    try {
      const { before, after } = await require('../shop/partner-commission').setOverride({ kind: req.params.kind, id: req.params.id, ...req.body, adminId: req.auth.sub });
      await auditService.fromRequest(req, 'economics.partner_commission_override', { kind: req.params.kind, id: req.params.id }, before, after);
      res.json({ rate: after });
    } catch (err) { next(err); }
  });

/* Economics → Surge: automatic, set once (jobs/surge) */

router.get('/economics/surge', async (req, res, next) => {
  try {
    const surge = require('../jobs/surge');
    const [{ s }, zones, report] = await Promise.all([surge.settings(), surge.zones(), surge.report({ days: Math.min(90, Number(req.query.days) || 7) })]);
    const lines = await require('../onboarding/onboarding.model').ServiceLine.find({ status: 'live', isActive: true }).select('code name').lean();
    res.json({ settings: s, zones, report, lines });
  } catch (err) { next(err); }
});

router.put('/economics/surge',
  validate(Joi.object({
    killSwitch: Joi.boolean(),
    maxMultiplier: Joi.number().min(1).max(2),
    ceilingPaise: Joi.number().integer().min(0).max(100000),
    rainPaise: Joi.number().integer().min(0).max(30000),
    nightPaise: Joi.number().integer().min(0).max(30000),
    nightStartHour: Joi.number().integer().min(0).max(23),
    nightEndHour: Joi.number().integer().min(0).max(23),
    providerSharePct: Joi.number().integer().min(0).max(100),
    minDemand: Joi.number().integer().min(1).max(100),
    lockMinutes: Joi.number().integer().min(2).max(30),
  }).min(1)),
  async (req, res, next) => {
    try {
      const surge = require('../jobs/surge');
      const { s: before } = await surge.settings();
      // Merged with what is set, so changing one limit never resets the others.
      await require('../pricing/services/config.service').updateActiveConfig({ surgeAuto: { ...before, ...req.body } }, req.auth.sub);
      const { s: after } = await surge.settings();
      await auditService.fromRequest(req, 'economics.surge', { kind: 'system', id: null }, before, after);
      res.json({ settings: after });
    } catch (err) { next(err); }
  });

/* Shop payouts: shops ask, ops pays by bank / UPI and marks it here (shop/shop-payout) */

router.get('/payouts/shops', async (req, res, next) => {
  try { res.json({ payouts: await require('../shop/shop-payout').adminList({ status: req.query.status || 'requested' }) }); } catch (err) { next(err); }
});

router.post('/payouts/shops/:id/decide',
  validate(Joi.object({
    decision: Joi.string().valid('paid', 'rejected').required(),
    reference: Joi.string().trim().max(80).allow(''),
    reason: Joi.string().trim().max(300).allow(''),
  })),
  async (req, res, next) => {
    try {
      const row = await require('../shop/shop-payout').decide({ id: req.params.id, ...req.body, adminId: req.auth.sub });
      await auditService.fromRequest(req, `shop_payout.${req.body.decision}`, { kind: 'shop', id: row.shopId }, null, { amountPaise: row.amountPaise, reference: row.reference });
      res.json({ payout: row });
    } catch (err) { next(err); }
  });

/* Shop dues: commission partner shops owe from cash jobs, and recording what they paid (shop/shop-dues) */

router.get('/dues/shops', async (req, res, next) => {
  try { res.json({ shops: await require('../shop/shop-dues').owingShops() }); } catch (err) { next(err); }
});

router.post('/dues/shops/:shopId/payment',
  validate(Joi.object({ amountRupees: Joi.number().positive().max(10000000).required(), reference: Joi.string().trim().min(3).max(80).required() })),
  async (req, res, next) => {
    try {
      const dues = await require('../shop/shop-dues').recordPayment({ shopId: req.params.shopId, amountPaise: Math.round(req.body.amountRupees * 100), reference: req.body.reference, adminId: req.auth.sub });
      await auditService.fromRequest(req, 'shop_dues.payment', { kind: 'shop', id: req.params.shopId }, null, { amountRupees: req.body.amountRupees, reference: req.body.reference });
      res.json({ dues });
    } catch (err) { next(err); }
  });

/* Worker dues: who owes what from cash jobs, and recording what they paid */

router.get('/dues', async (req, res, next) => {
  try { res.json(await require('../worker/worker-dues.service').listOwing()); } catch (err) { next(err); }
});

router.post('/dues/:workerId/payments',
  validate(Joi.object({
    amountPaise: Joi.number().integer().min(100).max(10000000).required(),
    method: Joi.string().valid('upi', 'cash', 'bank').default('upi'),
    reference: Joi.string().trim().max(80).allow(''),
    claimId: Joi.string().hex().length(24).allow(null, ''),
  })),
  async (req, res, next) => {
    try {
      const out = await require('../worker/worker-dues.service').recordPayment({
        workerId: req.params.workerId, ...req.body, claimId: req.body.claimId || null, adminId: req.auth.sub,
      });
      await auditService.fromRequest(req, 'dues.payment', { kind: 'worker', id: req.params.workerId }, { duesPaise: out.before.duesPaise }, { duesPaise: out.after.duesPaise, amountPaise: req.body.amountPaise });
      res.json(out);
    } catch (err) { next(err); }
  });

router.post('/dues/claims/:id/reject',
  validate(Joi.object({ note: Joi.string().trim().max(300).allow('') })),
  async (req, res, next) => {
    try {
      const claim = await require('../worker/worker-dues.service').rejectClaim({ claimId: req.params.id, adminId: req.auth.sub, note: req.body.note || '' });
      await auditService.fromRequest(req, 'dues.claim_rejected', { kind: 'worker', id: String(claim.workerId) }, null, { claimId: req.params.id });
      res.json({ claim });
    } catch (err) { next(err); }
  });

module.exports = router;
