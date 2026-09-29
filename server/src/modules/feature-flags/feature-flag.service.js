const mongoose = require('mongoose');
const { httpError } = require('../../core/errors');

/**
 * Platform kill switches — for features that have no settings page of their own.
 * (Surge lives in pricing config and cashback in the rewards config; they are
 * switched there, not duplicated here.)
 *
 * Stored in Mongo, never expire, read through a short in-process cache so a
 * flip reaches every instance within CACHE_MS without a query per request.
 */
const FLAGS = {
  promo_codes: { label: 'Promo codes', description: 'Customers can apply promo codes at checkout.', defaultOn: true },
  referrals: { label: 'Referrals', description: 'Referral codes are accepted at sign-up and referral rewards are granted.', defaultOn: true },
  chat: { label: 'In-job chat', description: 'Customers and providers can message each other during a job.', defaultOn: true },
  ads: { label: 'Ads', description: 'Sponsored banners are shown in the customer app.', defaultOn: true },
};

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: Object.keys(FLAGS) },
    enabled: { type: Boolean, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
const FeatureFlag = mongoose.models.FeatureFlag || mongoose.model('FeatureFlag', featureFlagSchema);

const CACHE_MS = 15_000;
let cache = { at: 0, values: null };

async function load() {
  if (cache.values && Date.now() - cache.at < CACHE_MS) return cache.values;
  const rows = await FeatureFlag.find().lean();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r]));
  const values = Object.fromEntries(Object.entries(FLAGS).map(([key, def]) => [key, saved[key]?.enabled ?? def.defaultOn]));
  cache = { at: Date.now(), values, rows: saved };
  return values;
}

/** Is this feature on? Unknown keys are a programming error, not "off". */
async function isEnabled(key) {
  if (!FLAGS[key]) throw new Error(`Unknown feature flag: ${key}`);
  try {
    return (await load())[key];
  } catch {
    return FLAGS[key].defaultOn; // a flag lookup failing must not take a feature down
  }
}

/** Refuse the request when the feature is switched off. */
async function assertEnabled(key) {
  if (!(await isEnabled(key))) {
    throw httpError(`${FLAGS[key].label} is switched off right now`, 503, 'FEATURE_OFF', { feature: key });
  }
}

/** Every flag with its definition, for admin and for clients deciding what to show. */
async function list() {
  const values = await load();
  return Object.entries(FLAGS).map(([key, def]) => ({
    key, label: def.label, description: def.description, enabled: values[key],
    updatedAt: cache.rows?.[key]?.updatedAt || null,
  }));
}

async function set(key, enabled, adminId) {
  if (!FLAGS[key]) throw httpError('Unknown feature flag', 400, 'UNKNOWN_FLAG');
  await FeatureFlag.findOneAndUpdate({ key }, { $set: { enabled: Boolean(enabled), updatedBy: adminId } }, { upsert: true });
  cache = { at: 0, values: null };
  return list();
}

module.exports = { FLAGS, isEnabled, assertEnabled, list, set, FeatureFlag };
