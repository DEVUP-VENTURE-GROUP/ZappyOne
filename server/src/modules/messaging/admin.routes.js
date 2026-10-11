const express = require('express');
const Joi = require('joi');
const { validate } = require('../../middlewares/validate');
const { CATALOG } = require('./catalog');
const { build, MessageLog } = require('./send');
const settings = require('./settings');

/**
 * Admin → Messages: every automatic message with a live preview, a test
 * send to yourself, what went out lately, and the business details every
 * message and receipt carries. Mounted under the admin portal (admin auth).
 */
const router = express.Router();

router.get('/messages', async (req, res, next) => {
  try {
    res.json({
      events: Object.entries(CATALOG).map(([key, e]) => ({
        key, label: e.label, audience: e.audience, channels: e.channels, urgent: !!e.urgent, promotional: !!e.promotional,
      })),
      emailReady: require('../../core/mail/mailer').isConfigured(),
      settings: await settings.get(),
    });
  } catch (err) { next(err); }
});

router.get('/messages/log', async (req, res, next) => {
  try {
    const filter = req.query.key ? { key: String(req.query.key) } : {};
    res.json({ rows: await MessageLog.find(filter).sort({ createdAt: -1 }).limit(100).lean() });
  } catch (err) { next(err); }
});

const recipientOf = (e) => (e.audience === 'ops' ? 'ops' : e.audience === 'provider' ? 'worker' : 'user');

router.get('/messages/:key/preview', async (req, res, next) => {
  try {
    const e = CATALOG[req.params.key];
    if (!e) return res.status(404).json({ error: 'No such message' });
    const out = await build(req.params.key, e.sample(), recipientOf(e));
    res.json({ push: out.push, email: out.email });
  } catch (err) { next(err); }
});

/** A test copy to the signed-in admin's own email (sample data, nothing about real customers). */
router.post('/messages/:key/test',
  validate(Joi.object({ to: Joi.string().email().allow('', null) })),
  async (req, res, next) => {
    try {
      const e = CATALOG[req.params.key];
      if (!e) return res.status(404).json({ error: 'No such message' });
      const Admin = require('../admin/admin.model');
      const me = await Admin.findById(req.auth.sub).select('email').lean();
      const to = req.body.to || me?.email;
      if (!to) return res.status(400).json({ error: 'Add an email to your admin account, or type one here.' });
      const out = await build(req.params.key, e.sample(), recipientOf(e));
      if (!out.email) return res.status(400).json({ error: 'This message is push only; there is no email to test.' });
      const mailer = require('../../core/mail/mailer');
      if (!mailer.isConfigured()) return res.status(409).json({ error: 'Email is not set up yet. Add the SMTP details on the server first.', code: 'SMTP_NOT_SET' });
      const r = await mailer.sendMail({ to, subject: `[Test] ${out.email.subject}`, html: out.email.html, text: out.email.text, replyTo: out.s.supportEmail || undefined });
      if (!r.sent) return res.status(502).json({ error: 'The email provider refused it. Check the SMTP details.', code: 'SEND_FAILED' });
      res.json({ sent: true, to });
    } catch (err) { next(err); }
  });

router.put('/messages/settings',
  validate(Joi.object({
    brandName: Joi.string().trim().max(60),
    legalName: Joi.string().trim().max(120).allow(''),
    gstin: Joi.string().trim().uppercase().pattern(/^$|^[0-9]{2}[A-Z0-9]{13}$/).allow('')
      .messages({ 'string.pattern.base': 'A GSTIN is 15 characters, starting with the 2-digit state code' }),
    address: Joi.string().trim().max(300).allow(''),
    supportEmail: Joi.string().trim().email().allow(''),
    supportPhone: Joi.string().trim().max(20).allow(''),
    grievanceOfficer: Joi.string().trim().max(100).allow(''),
    grievanceEmail: Joi.string().trim().email().allow(''),
    customerUrl: Joi.string().uri(), rakshakUrl: Joi.string().uri(), serviceproUrl: Joi.string().uri(), adminUrl: Joi.string().uri(),
    quietFromHour: Joi.number().integer().min(0).max(23),
    quietToHour: Joi.number().integer().min(0).max(23),
    opsEmails: Joi.array().items(Joi.string().email()).max(10),
  }).min(1)),
  async (req, res, next) => {
    try {
      const before = await settings.get();
      const after = await settings.update(req.body);
      await require('../admin/audit.service').fromRequest(req, 'messages.settings', { kind: 'system', id: null }, before, after);
      res.json({ settings: after });
    } catch (err) { next(err); }
  });

module.exports = router;
