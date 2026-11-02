const express = require('express');
const Joi = require('joi');
const ctrl = require('./shop.controller');
const { authenticate, requireRole, requireRecentOtp } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

// Customer-facing discovery — any authenticated role can browse
router.get(
  '/nearby',
  authenticate,
  validate(Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    service: Joi.string().max(60).optional(),
    radiusKm: Joi.number().min(0.5).max(50).optional(),
  }), 'query'),
  ctrl.listNearby,
);
router.get('/:id', authenticate, ctrl.getPublicProfile);

// Shop owner's own account — everything below requires role 'shop'
router.use(authenticate, requireRole('shop'));

// Auto-accept: jobs nearby come to me with no tap (jobs/fast-assign).
router.get('/me/auto-accept', async (req, res, next) => {
  try { res.json(await require('../jobs/fast-assign').autoAcceptOf('shop', req.auth.sub)); } catch (err) { next(err); }
});
router.put('/me/auto-accept',
  validate(Joi.object({ enabled: Joi.boolean(), maxKm: Joi.number().min(1).max(30).allow(null) }).min(1)),
  async (req, res, next) => {
    try { res.json(await require('../jobs/fast-assign').setAutoAccept('shop', req.auth.sub, req.body)); } catch (err) { next(err); }
  });
// The shop's own storefront link to share with its customers (shop/share-link).
router.get('/me/share-link', async (req, res, next) => {
  try { res.json(await require('./share-link').linkFor({ kind: 'shop', id: req.auth.sub }, { vertical: req.query.service ? String(req.query.service).slice(0, 40) : null })); } catch (err) { next(err); }
});
router.get('/me/profile', ctrl.getMe);
router.patch(
  '/me/profile',
  validate(Joi.object({
    businessName: Joi.string().max(120).optional(),
    ownerName: Joi.string().trim().min(2).max(100).optional(),
    category: Joi.string().max(60).optional(),
    services: Joi.array().items(Joi.string().max(60)).optional(),
    address: Joi.object({
      text: Joi.string().max(300).required(),
      landmark: Joi.string().max(150).allow('', null).optional(),
      location: Joi.object({
        coordinates: Joi.array().items(Joi.number()).length(2).required(),
      }).required(),
    }).optional(),
    hours: Joi.array().items(Joi.object({
      day: Joi.number().integer().min(0).max(6).required(),
      opensAt: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('').optional(),
      closesAt: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('').optional(),
      isClosed: Joi.boolean().optional(),
    })).max(7).optional(),
    coverImageUrl: Joi.string().max(500).optional(),
    galleryImages: Joi.array().items(Joi.string().max(500)).max(10).optional(),
    bio: Joi.string().max(1000).allow('', null).optional(),
    yearsActive: Joi.number().min(0).max(100).optional(),
    isActive: Joi.boolean().optional(),
  })),
  ctrl.updateProfile,
);

router.get('/me/kyc/status', ctrl.getKycStatus);
router.post(
  '/me/kyc/submit',
  validate(Joi.object({
    // Required on a full submission; when the reviewer asked for named
    // documents again only those are sent (shop.controller submitKyc).
    ownerIdUrl: Joi.string().allow('', null),
    shopPhotoUrl: Joi.string().allow('', null),
    selfieUrl: Joi.string().allow('', null),
    // The live camera's record: when and where the selfie was taken.
    selfieMetadata: Joi.object({
      capturedAt: Joi.string().isoDate().required(),
      captureMethod: Joi.string().valid('live_camera').required(),
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required(),
      accuracy: Joi.number().min(0).allow(null),
      geoStatus: Joi.string().max(20).optional(),
      userAgent: Joi.string().max(300).optional(),
    }).allow(null),
    gstCertificateUrl: Joi.string().optional(),
    businessRegistrationUrl: Joi.string().optional(),
    gstNumber: Joi.string().max(30).optional(),
    panNumber: Joi.string().max(20).optional(),
  })),
  ctrl.submitKyc,
);

router.get('/me/workers', ctrl.listWorkers);

/* Partner OS (shop/partner.service): type, dispatch rule, capacity, team, numbers. */
router.get('/me/agreement', async (req, res, next) => {
  try {
    const shop = await require('./shop.model').findById(req.auth.sub).select('partnerType agreement').lean();
    const terms = require('./partner-terms');
    res.json({ terms: await terms.termsFor(shop?.partnerType), agreement: shop?.agreement || null, current: terms.isCurrent(shop?.agreement) });
  } catch (err) { next(err); }
});
router.post('/me/agreement', async (req, res, next) => {
  try { res.json({ agreement: await require('./partner-terms').accept(req.auth.sub) }); } catch (err) { next(err); }
});
// The same CSV at a plain path, so the app can open it in the phone's browser with a document link (account/doc-link).
router.get('/me/statement/:month.csv', async (req, res, next) => {
  try {
    const st = require('./shop-statement');
    const out = await st.statement(req.auth.sub, req.params.month);
    res.set('Content-Disposition', `attachment; filename="zappyone-statement-${out.month}.csv"`).type('text/csv').send(st.toCsv(out));
  } catch (err) { next(err); }
});
router.get('/me/statement', async (req, res, next) => {
  try {
    const st = require('./shop-statement');
    const out = await st.statement(req.auth.sub, req.query.month);
    if (req.query.format !== 'csv') return res.json(out);
    res.set('Content-Disposition', `attachment; filename="zappyone-statement-${out.month}.csv"`).type('text/csv').send(st.toCsv(out));
  } catch (err) { next(err); }
});
router.get('/me/dues', async (req, res, next) => {
  try { res.json(await require('./shop-dues').duesOf(req.auth.sub)); } catch (err) { next(err); }
});
// The shop tells ZappyOne it paid its dues, with the UPI or bank reference; admin confirms against the bank.
router.post('/me/dues/claims',
  validate(Joi.object({ amountRupees: Joi.number().min(1).max(10000000).required(), method: Joi.string().valid('upi', 'bank', 'cash').default('upi'), reference: Joi.string().trim().min(4).max(80).required(), note: Joi.string().trim().max(300).allow('') })),
  async (req, res, next) => {
    try {
      const claim = await require('./shop-dues').claimPayment({ shopId: req.auth.sub, amountPaise: Math.round(req.body.amountRupees * 100), method: req.body.method, reference: req.body.reference, note: req.body.note || '' });
      res.status(201).json({ claim });
    } catch (err) { next(err); }
  });
router.get('/me/partner', async (req, res, next) => {
  try { res.json(await require('./partner.service').settingsOf(req.auth.sub)); } catch (err) { next(err); }
});
router.put('/me/partner',
  validate(Joi.object({
    partnerType: Joi.string().valid('shop', 'agency', 'company', 'individual'),
    mode: Joi.string().valid('manual', 'nearest', 'round_robin'),
    capacity: Joi.number().integer().min(0).max(1000),
  }).min(1)),
  async (req, res, next) => {
    try { res.json(await require('./partner.service').saveSettings(req.auth.sub, req.body)); } catch (err) { next(err); }
  });
router.post('/me/workers/bulk',
  validate(Joi.object({ rows: Joi.array().items(Joi.object({ phone: Joi.string().trim().max(20).required(), name: Joi.string().trim().max(100).allow('') })).min(1).max(200).required() })),
  async (req, res, next) => {
    try { res.json(await require('./partner.service').invite(req.auth.sub, req.body.rows)); } catch (err) { next(err); }
  });
router.patch('/me/workers/:workerId/team',
  validate(Joi.object({ role: Joi.string().valid('member', 'lead'), leadId: Joi.string().hex().length(24).allow(null) }).min(1)),
  async (req, res, next) => {
    try { res.json({ worker: await require('./partner.service').setRole(req.auth.sub, req.params.workerId, req.body) }); } catch (err) { next(err); }
  });
router.get('/me/insights', async (req, res, next) => {
  try { res.json(await require('./partner.service').insights(req.auth.sub, Number(req.query.days) || 30)); } catch (err) { next(err); }
});

/* Withdraw: what ZappyOne owes the shop, and asking for it (shop/shop-payout). */
router.get('/me/payouts', async (req, res, next) => {
  try { res.json(await require('./shop-payout').mine(req.auth.sub)); } catch (err) { next(err); }
});
router.post('/me/payouts',
  requireRecentOtp, // money out: a fresh OTP, like a worker's payout
  validate(Joi.object({
    amountPaise: Joi.number().integer().min(1).max(100000000).required(),
    type: Joi.string().valid('bank', 'upi').required(),
    accountId: Joi.string().hex().length(24).required(),
  })),
  async (req, res, next) => {
    try { res.status(201).json(await require('./shop-payout').request({ shopId: req.auth.sub, ...req.body })); } catch (err) { next(err); }
  });
router.post(
  '/me/workers',
  validate(Joi.object({
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
    name: Joi.string().max(100).optional(),
    skills: Joi.array().items(Joi.string().max(60)).optional(),
  })),
  ctrl.addWorker,
);
router.delete('/me/workers/:workerId', ctrl.removeWorker);

router.get(
  '/me/earnings',
  validate(Joi.object({ range: Joi.string().valid('today', 'week', 'month').optional() }), 'query'),
  ctrl.getEarnings,
);

module.exports = router;
