const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/auth');
const { makeLimiter } = require('../../middlewares/rateLimit');
const config = require('../../config');
const svc = require('./account.service');

/**
 * /api/account: password, email and first-time setup for every account type.
 * Password sign-in itself lives with the other logins (/api/auth/password/login)
 * so it shares their cookie and portal rules.
 */
const router = express.Router();
const ROLES = Object.keys(svc.ROLES);
const role = Joi.string().valid(...ROLES).required();

/** Where a link in an email should open: the app the person is using. */
const DEFAULT_BASE = {
  user: 'https://www.zappyone.com',
  worker: 'https://rakshak.zappyone.com',
  shop: 'https://servicepro.zappyone.com',
  event_partner: 'https://events.zappyone.com',
};
function baseUrlFor(req, r) {
  const origin = req.get('origin');
  const allowed = require('../../config/origins').allowedOrigins();
  if (origin && (config.env !== 'production' || allowed.includes(origin))) return origin.replace(/\/$/, '');
  return DEFAULT_BASE[r] || DEFAULT_BASE.user;
}

const self = (req) => ({ role: req.auth.role, id: req.auth.sub });
const onlyAccounts = (req, res, next) => (ROLES.includes(req.auth?.role) ? next() : res.status(403).json({ error: 'Not available for this account', code: 'BAD_ROLE' }));
const mailLimiter = makeLimiter({ windowMs: 15 * 60_000, max: 10, prefix: 'acctmail' });

/** What sign-in screens may offer before anyone is signed in. */
router.get('/capabilities', (req, res) => {
  res.json({ email: require('../../core/mail/mailer').isConfigured() });
});

router.get('/me', authenticate, onlyAccounts, async (req, res, next) => {
  try { res.json(await svc.getStatus(req.auth.role, req.auth.sub)); } catch (e) { next(e); }
});

router.post('/photo', authenticate, onlyAccounts,
  validate(Joi.object({ key: Joi.string().trim().max(300).required() })),
  async (req, res, next) => { try { res.json(await svc.setPhoto({ ...self(req), key: req.body.key })); } catch (e) { next(e); } });

router.post('/photo/skip', authenticate, onlyAccounts,
  async (req, res, next) => { try { res.json(await svc.skipPhoto(self(req))); } catch (e) { next(e); } });

router.post('/release-seen', authenticate, onlyAccounts,
  validate(Joi.object({ release: Joi.string().trim().max(40).required() })),
  async (req, res, next) => { try { res.json(await svc.markReleaseSeen({ ...self(req), release: req.body.release })); } catch (e) { next(e); } });

router.post('/name', authenticate, onlyAccounts,
  validate(Joi.object({ name: Joi.string().trim().min(2).max(60).required() })),
  async (req, res, next) => { try { res.json(await svc.setName({ ...self(req), name: req.body.name })); } catch (e) { next(e); } });

router.post('/password', authenticate, onlyAccounts,
  makeLimiter({ windowMs: 15 * 60_000, max: 10, prefix: 'acctpw' }),
  validate(Joi.object({ currentPassword: Joi.string().allow('', null).max(72), newPassword: Joi.string().min(8).max(72).required() })),
  async (req, res, next) => { try { res.json(await svc.setPassword({ ...self(req), ...req.body })); } catch (e) { next(e); } });

router.post('/email', authenticate, onlyAccounts, mailLimiter,
  validate(Joi.object({ email: Joi.string().trim().max(120).required() })),
  async (req, res, next) => {
    try { res.json(await svc.startEmailVerification({ ...self(req), email: req.body.email, baseUrl: baseUrlFor(req, req.auth.role) })); } catch (e) { next(e); }
  });

router.post('/email/verify',
  makeLimiter({ windowMs: 15 * 60_000, max: 20, prefix: 'acctverify' }),
  validate(Joi.object({ role, token: Joi.string().max(200).required() })),
  async (req, res, next) => { try { res.json(await svc.confirmEmail(req.body)); } catch (e) { next(e); } });

router.post('/setup/complete', authenticate, onlyAccounts,
  async (req, res, next) => { try { res.json(await svc.completeSetup(self(req))); } catch (e) { next(e); } });

router.post('/password/forgot', mailLimiter,
  validate(Joi.object({ role, identifier: Joi.string().trim().max(120).required() })),
  async (req, res, next) => {
    try { res.json(await svc.requestPasswordReset({ ...req.body, baseUrl: baseUrlFor(req, req.body.role) })); } catch (e) { next(e); }
  });

router.post('/password/reset',
  makeLimiter({ windowMs: 15 * 60_000, max: 10, prefix: 'acctreset' }),
  validate(Joi.object({
    role,
    newPassword: Joi.string().min(8).max(72).required(),
    token: Joi.string().max(200),
    identifier: Joi.string().trim().max(120),
    otp: Joi.string().pattern(/^\d{4,6}$/),
  }).xor('token', 'otp').with('otp', 'identifier')),
  async (req, res, next) => {
    try {
      const { token, ...rest } = req.body;
      res.json(token ? await svc.resetWithToken({ role: rest.role, token, newPassword: rest.newPassword }) : await svc.resetWithOtp(rest));
    } catch (e) { next(e); }
  });

module.exports = router;
