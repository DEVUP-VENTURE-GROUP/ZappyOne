const mongoose = require('mongoose');

/**
 * The business details every message carries: who we are, how to reach us,
 * where the apps live. Edited in Admin → Messages → Business details; nothing
 * here is invented. A blank GSTIN means receipts say "Receipt", never
 * "Tax invoice", and a blank address is simply left out.
 */
const schema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  brandName: { type: String, default: 'ZappyOne', maxlength: 60 },
  // As given by the founders: ZappyOne is a venture of this company.
  legalName: { type: String, default: 'DEVUP ECOSYSTEM PVT LTD', maxlength: 120 },
  gstin: { type: String, default: '36AAMCD7310F1ZR', maxlength: 20 },
  address: { type: String, default: '', maxlength: 300 },
  supportEmail: { type: String, default: 'support@zappyone.com', maxlength: 120 },
  supportPhone: { type: String, default: '+91 93927 56435', maxlength: 20 },
  customerUrl: { type: String, default: 'https://www.zappyone.com' },
  rakshakUrl: { type: String, default: 'https://rakshak.zappyone.com' },
  serviceproUrl: { type: String, default: 'https://servicepro.zappyone.com' },
  adminUrl: { type: String, default: 'https://admin.zappyone.com/zappy-admin-login-x7k9m2' },
  /** Non-urgent pushes wait out these hours (IST, 24h): reminders, summaries. */
  quietFromHour: { type: Number, default: 22, min: 0, max: 23 },
  quietToHour: { type: Number, default: 8, min: 0, max: 23 },
  /** Who gets the daily business summary and urgent ops emails. */
  opsEmails: { type: [String], default: [] },
}, { timestamps: true });
const MessagingSettings = mongoose.models.MessagingSettings || mongoose.model('MessagingSettings', schema);

let cache = null;
let cachedAt = 0;

async function get() {
  if (cache && Date.now() - cachedAt < 60000) return cache;
  const doc = await MessagingSettings.findOneAndUpdate(
    { key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true, new: true },
  ).lean();
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

async function update(patch) {
  const doc = await MessagingSettings.findOneAndUpdate({ key: 'default' }, { $set: patch }, { upsert: true, new: true }).lean();
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

/** For code that cannot wait (account emails): the last loaded details, or the defaults. */
function current() {
  if (cache) return cache;
  get().catch(() => {}); // warm it for next time
  return new MessagingSettings().toObject();
}

/** Where a recipient's app lives, for links and images. */
function appUrl(s, kind) {
  if (kind === 'worker') return s.rakshakUrl;
  if (kind === 'shop') return s.serviceproUrl;
  if (kind === 'admin') return s.adminUrl;
  return s.customerUrl;
}

/** Is it quiet hours in India right now? */
function isQuiet(s, at = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(at)) % 24;
  const { quietFromHour: from, quietToHour: to } = s;
  return from === to ? false : from < to ? h >= from && h < to : h >= from || h < to;
}

module.exports = { MessagingSettings, get, current, update, appUrl, isQuiet };
