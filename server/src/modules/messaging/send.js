/**
 * Sending a catalog message (messaging/catalog) to one recipient.
 *
 *   send('booking.confirmed', { to: { kind: 'user', id }, ctx, refId })
 *   send('admin.daily_summary', { to: 'ops', ctx })
 *
 *   push   through notification.service: saved for the in-app feed, live on
 *          the socket, FCM when the app is not open. A non-urgent push in
 *          quiet hours stays in-app only.
 *   email  queued with retries (jobs/notifications.worker), only to a verified
 *          address, never twice for the same event and job (refId), and not
 *          when the person turned that kind of email off. Promotional mail
 *          carries an unsubscribe link and respects "no offers".
 *
 * Every attempt is logged (MessageLog) for Admin → Messages. Sending never
 * throws into the action that caused it.
 */
const mongoose = require('mongoose');
const logger = require('../../core/logger');
const { CATALOG } = require('./catalog');
const settings = require('./settings');
const { render } = require('./layout');

const logSchema = new mongoose.Schema({
  key: { type: String, required: true },
  refId: { type: String, default: null },
  toKind: { type: String, required: true },
  toId: { type: String, default: null },
  channel: { type: String, enum: ['push', 'email'], required: true },
  address: { type: String, default: '' },
  subject: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped', 'in_app'], default: 'queued' },
  reason: { type: String, default: '' },
}, { timestamps: true });
logSchema.index({ key: 1, refId: 1, toKind: 1, toId: 1, channel: 1 }, { unique: true, partialFilterExpression: { refId: { $type: 'string' } } });
logSchema.index({ createdAt: -1 });
const MessageLog = mongoose.models.MessageLog || mongoose.model('MessageLog', logSchema);

const MODEL = {
  user: () => require('../user/user.model'),
  worker: () => require('../worker/worker.model'),
  shop: () => require('../shop/shop.model'),
};

/** Name, verified email and email choices of a person. */
async function contactOf(to) {
  const M = MODEL[to.kind];
  if (!M) return null;
  const p = await M().findById(to.id).select('name businessName email emailVerified notificationPrefs').lean();
  if (!p) return null;
  return {
    name: p.name || p.businessName || '',
    email: p.email && p.emailVerified ? p.email : null,
    // The customer's own choices (Notification preferences page): Order updates, Promotions.
    prefs: { bookingEmails: p.notificationPrefs?.orderUpdates !== false, offers: p.notificationPrefs?.promotions !== false },
  };
}

/** Where ops email goes: the addresses set in Messages, or the admin accounts. */
async function opsAddresses(s) {
  if (s.opsEmails?.length) return s.opsEmails;
  const Admin = require('../admin/admin.model');
  const admins = await Admin.find({ isActive: { $ne: false }, role: { $in: ['super_admin', 'ops', 'city_manager', 'fleet_manager'] } }).select('email').limit(10).lean();
  return admins.map((a) => a.email).filter(Boolean);
}

/** Is this email one the person may have turned off? Receipts and account mail always go. */
function emailAllowed(key, ev, prefs) {
  if (ev.promotional) return prefs.offers;
  if (['booking.completed', 'payment.refunded'].includes(key) || ev.audience !== 'customer') return true;
  return prefs.bookingEmails;
}

async function claim(row) {
  if (!row.refId) return MessageLog.create(row);
  try { return await MessageLog.create(row); } catch (e) { if (e.code === 11000) return null; throw e; }
}

/**
 * Build a message without sending it: what the preview shows and what send uses.
 * `recipientKind` decides which app links point to.
 */
async function build(key, ctx = {}, recipientKind = 'user') {
  const ev = CATALOG[key];
  if (!ev) throw Object.assign(new Error(`Unknown message ${key}`), { status: 404 });
  const s = await settings.get();
  const base = recipientKind === 'ops' ? s.adminUrl : settings.appUrl(s, recipientKind);
  const url = (path) => (/^https?:/.test(path) ? path : `${base}${path}`);
  const msg = ev.build({ ...ctx, s, url });
  const email = msg.email ? { subject: msg.email.subject, ...render({ s, recipientKind: recipientKind === 'ops' ? 'admin' : recipientKind, promotional: !!ev.promotional, ...msg.email }) } : null;
  return { ev, s, push: msg.push || null, email };
}

async function send(key, { to, ctx = {}, refId = null, attachments = null } = {}) {
  try {
    const isOps = to === 'ops';
    const kind = isOps ? 'ops' : to.kind;
    const contact = isOps ? null : await contactOf(to);
    const { ev, s, push, email } = await build(key, { name: contact?.name, ...ctx }, kind);
    const ref = refId ? String(refId) : null;
    const base = { key, refId: ref, toKind: kind, toId: isOps ? null : String(to.id) };

    if (push && !isOps && ev.channels.includes('push')) {
      // Non-urgent pushes wait out quiet hours, and stay in-app for someone who turned order updates off.
      const quiet = !ev.urgent && (settings.isQuiet(s) || contact?.prefs?.bookingEmails === false);
      const row = await claim({ ...base, channel: 'push', subject: push.title, status: quiet ? 'in_app' : 'sent' });
      if (row) {
        await require('../notification/notification.service').notify({
          recipient: { kind: to.kind, id: to.id }, type: ev.type, title: push.title, body: push.body,
          deepLink: push.link, data: { key, ...(ref ? { refId: ref } : {}) }, push: !quiet,
        });
      }
    }

    if (email && ev.channels.includes('email')) {
      const addresses = isOps ? await opsAddresses(s) : [contact?.email].filter(Boolean);
      const allowed = isOps || emailAllowed(key, ev, contact?.prefs || {});
      for (const address of addresses) {
        const row = await claim({ ...base, channel: 'email', address, subject: email.subject, status: allowed ? 'queued' : 'skipped', reason: allowed ? '' : 'turned off by recipient' });
        if (!row || !allowed) continue;
        await require('../../jobs').notificationsQueue.add('email', {
          logId: String(row._id), to: address, subject: email.subject, html: email.html, text: email.text,
          replyTo: s.supportEmail || undefined,
          attachments: (attachments || []).map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content).toString('base64'), encoding: 'base64' })),
        }, { attempts: 5, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: 500, removeOnFail: 1000 });
      }
      if (!isOps && !addresses.length) {
        await claim({ ...base, channel: 'email', status: 'skipped', reason: 'no verified email' }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn({ err: e.message, key }, '[messaging] send failed');
  }
}

module.exports = { send, build, MessageLog, contactOf };
