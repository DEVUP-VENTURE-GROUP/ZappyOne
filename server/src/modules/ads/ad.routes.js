const express = require('express');
const Joi     = require('joi');
const ctrl    = require('./ad.controller');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');

const router = express.Router();

// Public / authenticated user routes (/api/ads)

// Legacy: all active ads (homepage banner)
router.get('/', authenticate, ctrl.getActive);

// Placement-specific (no auth required — works for guests too)
router.get('/placement/:placement', ctrl.getByPlacement);

// Impression + click tracking
router.post('/:id/impression', authenticate, ctrl.impression);
router.post('/:id/click',      authenticate, ctrl.click);

// Self-serve advertiser routes (event_partner) (/api/ads/my)

const myRouter = express.Router();
myRouter.use(authenticate, requireRole('event_partner'));

myRouter.get('/',                       ctrl.myList);
myRouter.post('/',                      ctrl.myCreate);
myRouter.patch('/:id',                  ctrl.myUpdate);
myRouter.get('/:id/analytics',          ctrl.myAnalytics);

// Wallet
myRouter.get('/wallet',                 ctrl.myWallet);
myRouter.post('/wallet/topup',          ctrl.createTopUpOrder);
myRouter.post('/wallet/topup/verify',   ctrl.verifyTopUp);

router.use('/my', myRouter);

// Admin router (/api/:slug/ads)

const adminSchema = Joi.object({
  title:    Joi.string().required(),
  type:     Joi.string().valid('banner','popup','offer_card','sponsored_service','home_card','notification','sponsored_listing','video','featured_theme','cross_sell','lead_gen').required(),
  placements: Joi.array().items(Joi.string()).default(['home_banner']),
  audience: Joi.string().valid('users','workers','both').default('users'),
  status:   Joi.string().valid('draft','pending_approval','active','paused','completed','rejected').default('draft'),
  content:  Joi.object({
    headline:        Joi.string().required(),
    body:            Joi.string().allow('').default(''),
    imageUrl:        Joi.string().allow('').default(''),
    videoUrl:        Joi.string().allow('').default(''),
    ctaText:         Joi.string().default('Learn More'),
    ctaLink:         Joi.string().allow('').default(''),
    badgeText:       Joi.string().allow('').default(''),
    backgroundColor: Joi.string().default('#2563EB'),
    textColor:       Joi.string().default('#FFFFFF'),
  }).required(),
  targeting: Joi.object({
    serviceCategories: Joi.array().items(Joi.string()).default([]),
    eventCategories:   Joi.array().items(Joi.string()).default([]),
    cities:            Joi.array().items(Joi.string()).default([]),
    keywords:          Joi.array().items(Joi.string()).default([]),
    userBehavior:      Joi.string().valid('all','new_users','inactive_7d','high_spenders').default('all'),
    radiusKm:          Joi.number().min(0).default(0),
  }).default({}),
  schedule: Joi.object({
    startAt:          Joi.date().required(),
    endAt:            Joi.date().required(),
    impressionsLimit: Joi.number().integer().min(0).default(0),
  }).required(),
  billing: Joi.object({
    model:         Joi.string().valid('cpm','cpc','cpl','fixed','flat_monthly').default('fixed'),
    rate:          Joi.number().min(0).default(0),
    budget:        Joi.number().min(0).default(0),
    dailyCapPaise: Joi.number().min(0).default(0),
  }).default({}),
}).options({ allowUnknown: false });

const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));

// Static routes MUST come before /:id to avoid Express matching "wallets" as an id
adminRouter.get('/wallets',                   ctrl.adminAllWallets);
adminRouter.post('/wallets/adjust',           ctrl.adminAdjustWallet);
adminRouter.get('/',                          ctrl.adminList);
adminRouter.post('/', validate(adminSchema),  ctrl.adminCreate);
adminRouter.patch('/:id',                     ctrl.adminUpdate);
adminRouter.delete('/:id',                    ctrl.adminDelete);
adminRouter.post('/:id/approve',              ctrl.adminApprove);
adminRouter.post('/:id/reject',               ctrl.adminReject);
adminRouter.get('/:id/analytics',             ctrl.adminCampaignAnalytics);

module.exports = router;
module.exports.adminRouter = adminRouter;
