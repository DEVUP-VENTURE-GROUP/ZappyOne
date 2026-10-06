/**
 * Is a worker really there right now?
 *
 * "Online" used to be a flag the worker set, kept true until a sweep 30
 * minutes after the last GPS fix. A phone lying still (or with the screen
 * locked) sends no GPS, so a worker sitting by the phone was quietly swept
 * offline while their app still said Online; and a worker whose phone died
 * stayed "online" for half an hour, offered jobs they would never see.
 *
 * Now the app sends a heartbeat every minute while on duty, moving or not
 * (POST /workers/heartbeat). A worker is LIVE when they are online and were
 * heard from within the presence window; only live workers are shown to
 * customers, rung for jobs, or offered repairs. Silent past the window, they
 * are set offline and their app is told, so it never shows a stale Online.
 *
 * The window is set in admin (PricingConfig.presenceOfflineMinutes).
 */
const Worker = require('./worker.model');
const logger = require('../../core/logger');

async function windowMin() {
  const cfg = await require('../pricing/services/config.service').getActiveConfig();
  return Math.max(2, cfg.presenceOfflineMinutes ?? 5);
}

/** Mongo filter for workers who are really there now. */
async function liveFilter(now = Date.now()) {
  return { isOnline: true, lastSeenAt: { $gte: new Date(now - (await windowMin()) * 60000) } };
}

/** Of these worker ids, the ones live right now (string ids). */
async function liveIds(ids, now = Date.now()) {
  if (!ids?.length) return new Set();
  const rows = await Worker.find({ _id: { $in: ids }, ...(await liveFilter(now)) }).select('_id').lean();
  return new Set(rows.map((r) => String(r._id)));
}

/**
 * The app's heartbeat. Refreshes lastSeenAt (and position when sent) and
 * returns the server's view, so an app that was set offline finds out.
 */
async function heartbeat({ workerId, lat = null, lng = null }) {
  const set = { lastSeenAt: new Date() };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    set['currentLocation.coordinates'] = [lng, lat];
    set['currentLocation.updatedAt'] = new Date();
  }
  const w = await Worker.findOneAndUpdate({ _id: workerId, isOnline: true }, { $set: set }, { new: true })
    .select('isOnline currentLocation skills isAvailable').lean();
  if (w && set['currentLocation.coordinates']) {
    await require('./geo.service').updateLocation(String(workerId), lng, lat).catch(() => {});
  }
  return { isOnline: !!w };
}

/**
 * A worker taking a job is on duty: marked online and heard from now. Used
 * when someone who was offline answers a "job waiting near you" alert.
 */
async function markLive(workerId) {
  const w = await Worker.findOneAndUpdate(
    { _id: workerId },
    { $set: { isOnline: true, isAvailable: true, lastSeenAt: new Date() } },
    { new: true },
  ).select('isOnline isAvailable currentLocation skills onlineSince').lean();
  if (w && !w.onlineSince) await Worker.updateOne({ _id: workerId }, { $set: { onlineSince: new Date() } });
  if (w?.currentLocation?.coordinates?.length === 2) await require('./geo.service').markOnline(w).catch(() => {});
}

/** Workers silent past the window go offline, and their app is told. Run every minute. */
async function sweep({ now = Date.now() } = {}) {
  const cutoff = new Date(now - (await windowMin()) * 60000);
  const stale = await Worker.find({
    isOnline: true,
    $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: null }],
    currentOrderId: null, // the retired order flow manages its own
  }).select('_id').lean();

  const events = require('../jobs/job-events');
  for (const w of stale) {
    const res = await Worker.updateOne(
      { _id: w._id, isOnline: true, $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: null }] },
      { $set: { isOnline: false, isAvailable: false, onlineSince: null } },
    );
    if (!res.modifiedCount) continue;
    await require('./geo.service').markOffline(String(w._id)).catch(() => {});
    events.toProvider('worker', w._id, 'worker.presence', { online: false, reason: 'no_signal', at: new Date(now).toISOString() });
    events.push({ kind: 'worker', id: w._id }, {
      title: 'You are offline now',
      body: 'We lost contact with your phone, so new jobs stopped. Open the app and go online to get jobs again.',
      deepLink: '/worker', data: { kind: 'presence' },
    }).catch(() => {});
  }
  if (stale.length) logger.info({ count: stale.length }, '[presence] silent workers set offline');
  return stale.length;
}

module.exports = { windowMin, liveFilter, liveIds, heartbeat, markLive, sweep };
