const mongoose = require('mongoose');

/**
 * The oldest version of each phone app still allowed to run, and the newest
 * one out (Admin → System → App versions). An app older than its minimum shows
 * an "update to continue" screen; nothing is hardcoded in the apps.
 *
 * Read through a short in-process cache: every app asks on launch.
 */
const APPS = ['customer', 'servicepro', 'rakshak'];
const VERSION_RE = /^\d+(\.\d+){0,2}$/;

const schema = new mongoose.Schema(
  {
    app: { type: String, enum: APPS, required: true, unique: true },
    minVersion: { type: String, default: '0.0.0', match: VERSION_RE },
    latestVersion: { type: String, default: '0.0.0', match: VERSION_RE },
    message: { type: String, default: '', maxlength: 240 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
const AppRelease = mongoose.models.AppRelease || mongoose.model('AppRelease', schema);

const CACHE_MS = 60_000;
let cache = { at: 0, rows: null };
const empty = (app) => ({ app, minVersion: '0.0.0', latestVersion: '0.0.0', message: '' });

async function all() {
  if (cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const saved = Object.fromEntries((await AppRelease.find().lean()).map((r) => [r.app, r]));
  const rows = APPS.map((app) => ({ ...empty(app), ...(saved[app] && { minVersion: saved[app].minVersion, latestVersion: saved[app].latestVersion, message: saved[app].message, updatedAt: saved[app].updatedAt }) }));
  cache = { at: Date.now(), rows };
  return rows;
}

/** One app's versions; an unknown app or a failed read never blocks anyone. */
async function forApp(app) {
  if (!APPS.includes(app)) return empty(app);
  try { return (await all()).find((r) => r.app === app); } catch { return empty(app); }
}

async function set(app, { minVersion, latestVersion, message }, by) {
  await AppRelease.updateOne({ app }, { $set: { minVersion, latestVersion, message: message || '', updatedBy: by || null } }, { upsert: true, runValidators: true });
  cache = { at: 0, rows: null };
  return all();
}

module.exports = { APPS, VERSION_RE, all, forApp, set };
