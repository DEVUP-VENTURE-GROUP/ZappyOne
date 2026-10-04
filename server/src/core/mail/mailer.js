const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../logger');

/**
 * Outgoing email over SMTP (any provider: SES SMTP, Gmail Workspace, Zoho,
 * Brevo, Mailgun). Configured by SMTP_* in the environment.
 *
 * With no SMTP_HOST the message is logged instead of sent, so sign-up and
 * verification keep working in development and before mail is set up; the
 * caller is told (`sent: false`) and can say so. Mail never throws into the
 * request that triggered it.
 */
let transport = null;

function getTransport() {
  const m = config.mail || {};
  if (!m.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: !!m.secure,
      auth: m.user ? { user: m.user, pass: m.pass } : undefined,
      pool: true,
      maxConnections: 3,
    });
  }
  return transport;
}

function isConfigured() {
  return !!config.mail?.host;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) {
    logger.info({ to, subject, preview: text?.slice(0, 300) }, '[MAIL] SMTP not configured; message logged, not sent');
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const info = await t.sendMail({ from: config.mail.from, to, subject, html, text });
    logger.info({ to, subject, id: info.messageId }, '[MAIL] sent');
    return { sent: true, id: info.messageId };
  } catch (err) {
    logger.error({ err: err.message, to, subject }, '[MAIL] send failed');
    return { sent: false, reason: 'send_failed' };
  }
}

module.exports = { sendMail, isConfigured };
