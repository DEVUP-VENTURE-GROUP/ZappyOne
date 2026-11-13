// Admin App & traffic: who is on the website and the apps right now, daily traffic by surface, and which app versions and phones are in use. Counts only; no names or numbers.
const { redis } = require('../../config/redis');
const { VisitorSession } = require('../telemetry/telemetry.model');

const { ONLINE_KEY, ONLINE_WINDOW_MS: LIVE_WINDOW_MS } = require('../telemetry/telemetry.controller');
const LIVE_CAP = 5000;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

const surfaceOf = (s) => `${s.platform || 'web'}:${s.app || 'customer'}`;
const tally = (rows, key) => rows.reduce((m, r) => { const k = key(r) || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
const top = (m, n = 10) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

/** Everyone seen in the last minute, split by surface, user type, city and screen. */
async function live() {
  const now = Date.now();
  let ids = [];
  try { ids = await redis.zrangebyscore(ONLINE_KEY, now - LIVE_WINDOW_MS, '+inf', 'LIMIT', 0, LIVE_CAP); } catch { ids = []; }
  const rows = ids.length
    ? await VisitorSession.find({ sessionId: { $in: ids } }).select('platform app userType city currentPath device').lean()
    : [];
  return {
    total: rows.length,
    at: new Date(now).toISOString(),
    bySurface: tally(rows, surfaceOf),
    byUserType: tally(rows, (r) => r.userType),
    byCity: top(tally(rows, (r) => r.city), 12),
    byScreen: top(tally(rows, (r) => (r.currentPath || '/').split('?')[0]), 12),
  };
}

/** Per India day: sessions and unique people (signed-in by account, guests by session), split by surface, plus signed-in vs guest. */
async function summary({ days = 14, now = Date.now() } = {}) {
  const span = Math.min(90, Math.max(1, Number(days) || 14));
  const from = new Date(now - span * DAY_MS);
  const rows = await VisitorSession.aggregate([
    { $match: { firstSeen: { $gte: from }, device: { $ne: 'bot' } } },
    { $project: {
      day: { $dateToString: { format: '%Y-%m-%d', date: { $add: ['$firstSeen', IST_OFFSET_MS] } } },
      surface: { $concat: [{ $ifNull: ['$platform', 'web'] }, ':', { $ifNull: ['$app', 'customer'] }] },
      who: { $ifNull: [{ $toString: '$userId' }, '$sessionId'] },
      signedIn: { $ne: ['$userId', null] },
      minutes: { $divide: [{ $subtract: ['$lastSeen', '$firstSeen'] }, 60_000] },
      pageCount: 1,
    } },
    { $group: {
      _id: { day: '$day', surface: '$surface' },
      sessions: { $sum: 1 },
      people: { $addToSet: '$who' },
      signedIn: { $sum: { $cond: ['$signedIn', 1, 0] } },
      minutes: { $avg: '$minutes' },
      pages: { $avg: '$pageCount' },
    } },
    { $project: { _id: 0, day: '$_id.day', surface: '$_id.surface', sessions: 1, people: { $size: '$people' }, signedIn: 1, minutes: { $round: ['$minutes', 1] }, pages: { $round: ['$pages', 1] } } },
    { $sort: { day: 1, surface: 1 } },
  ]);
  const totals = rows.reduce((t, r) => ({ sessions: t.sessions + r.sessions, people: t.people + r.people, signedIn: t.signedIn + r.signedIn }), { sessions: 0, people: 0, signedIn: 0 });
  return { days: span, rows, totals, surfaces: [...new Set(rows.map((r) => r.surface))] };
}

/** App versions, Android versions and phone models in use over the period, for each app. */
async function versions({ days = 7, now = Date.now() } = {}) {
  const span = Math.min(90, Math.max(1, Number(days) || 7));
  const from = new Date(now - span * DAY_MS);
  const match = { lastSeen: { $gte: from }, platform: { $in: ['android', 'ios'] } };
  const group = (field) => VisitorSession.aggregate([
    { $match: match },
    { $group: { _id: { app: '$app', value: `$${field}` }, sessions: { $sum: 1 } } },
    { $sort: { sessions: -1 } },
    { $limit: 60 },
    { $project: { _id: 0, app: '$_id.app', value: { $ifNull: ['$_id.value', 'unknown'] }, sessions: 1 } },
  ]);
  const [appVersions, osVersions, models] = await Promise.all([group('appVersion'), group('osVersion'), group('deviceModel')]);
  return { days: span, appVersions, osVersions, models };
}

const sinceDays = (days, d = 30, max = 90) => { const n = Math.min(max, Math.max(1, Number(days) || d)); return { n, from: new Date(Date.now() - n * DAY_MS) }; };

/** Visits that opened a booking flow, per website and app, beside bookings made and lost in the same period (admin-portal/booking-health). */
async function funnel({ days = 14 } = {}) {
  const { n, from } = sinceDays(days, 14);
  const [rows, health] = await Promise.all([
    VisitorSession.aggregate([
      { $match: { firstSeen: { $gte: from }, device: { $ne: 'bot' } } },
      { $group: {
        _id: { $concat: [{ $ifNull: ['$platform', 'web'] }, ':', { $ifNull: ['$app', 'customer'] }] },
        visits: { $sum: 1 },
        signedIn: { $sum: { $cond: [{ $ne: ['$userId', null] }, 1, 0] } },
        startedBooking: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$bookingStartedAt', null] }, null] }, 1, 0] } },
      } },
      { $project: { _id: 0, surface: '$_id', visits: 1, signedIn: 1, startedBooking: 1 } },
      { $sort: { visits: -1 } },
    ]),
    require('./booking-health.service').bookingHealth({ days: n }).catch(() => ({ kinds: [] })),
  ]);
  const made = health.kinds.reduce((a, k) => a + (k.made || 0), 0);
  const done = health.kinds.reduce((a, k) => a + (k.done || 0), 0);
  const lost = health.kinds.reduce((a, k) => a + (k.noProvider || 0) + (k.cancelledOther || 0), 0);
  return { days: n, bySurface: rows, bookings: { made, done, lost } };
}

/** Notifications sent per type: how many went as a push, and how many were opened in the app. */
async function notifications({ days = 14 } = {}) {
  const { n, from } = sinceDays(days, 14);
  const Notification = require('../notification/notification.model');
  const rows = await Notification.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: {
      _id: { type: '$type', to: '$recipient.kind' },
      sent: { $sum: 1 },
      pushed: { $sum: { $cond: [{ $eq: ['$channels.push.sent', true] }, 1, 0] } },
      read: { $sum: { $cond: [{ $ifNull: ['$readAt', false] }, 1, 0] } },
    } },
    { $project: { _id: 0, type: '$_id.type', to: '$_id.to', sent: 1, pushed: 1, read: 1 } },
    { $sort: { sent: -1 } },
    { $limit: 60 },
  ]);
  const totals = rows.reduce((a, r) => ({ sent: a.sent + r.sent, pushed: a.pushed + r.pushed, read: a.read + r.read }), { sent: 0, pushed: 0, read: 0 });
  return { days: n, totals, rows };
}

/** Pros online and shops live right now, how fast jobs get accepted, and the partners doing the most jobs. */
async function partners({ days = 7 } = {}) {
  const { n } = sinceDays(days, 7);
  const Shop = require('../shop/shop.model');
  const Worker = require('../worker/worker.model');
  const fresh = new Date(Date.now() - 15 * 60_000);
  const [prosOnline, shopsLive, shopsWithAppOpen, health, topShops, topPros] = await Promise.all([
    redis.zcard('workers:online').catch(() => 0),
    Shop.countDocuments({ takingOrders: { $ne: false }, isActive: { $ne: false }, isBlocked: { $ne: true }, 'kyc.status': 'approved' }),
    Shop.countDocuments({ takingOrders: { $ne: false }, 'ownerLocation.at': { $gte: fresh } }),
    require('./booking-health.service').bookingHealth({ days: n }).catch(() => ({ kinds: [] })),
    Shop.find({ completedJobs: { $gt: 0 } }).sort({ completedJobs: -1 }).limit(10).select('businessName completedJobs rating reviewCount').lean(),
    Worker.find({ completedJobs: { $gt: 0 }, isBlocked: { $ne: true } }).sort({ completedJobs: -1 }).limit(10).select('name completedJobs rating reviewCount').lean(),
  ]);
  return {
    days: n,
    now: { prosOnline, shopsLive, shopsWithAppOpen },
    accept: health.kinds.map((k) => ({ kind: k.kind, made: k.made, noProvider: k.noProvider, acceptMedianMin: k.acceptMedianMin, acceptP90Min: k.acceptP90Min })),
    top: [
      ...topShops.map((s) => ({ kind: 'shop', name: s.businessName, jobs: s.completedJobs, rating: s.reviewCount ? s.rating : null })),
      ...topPros.map((w) => ({ kind: 'pro', name: w.name, jobs: w.completedJobs, rating: w.reviewCount ? w.rating : null })),
    ].sort((a, b) => b.jobs - a.jobs).slice(0, 12),
  };
}

/** Of signed-in people who first came in a week, the share back on a later day within 1, 7 and 30 days. */
async function retention({ weeks = 8, now = Date.now() } = {}) {
  const w = Math.min(12, Math.max(2, Number(weeks) || 8));
  const from = new Date(now - (w * 7 + 30) * DAY_MS);
  const people = await VisitorSession.aggregate([
    { $match: { userId: { $ne: null }, firstSeen: { $gte: from } } },
    { $group: { _id: '$userId', first: { $min: '$firstSeen' }, days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: { $add: ['$firstSeen', IST_OFFSET_MS] } } } } } },
  ]).allowDiskUse(true);
  const dayNo = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
  const cohorts = new Map();
  for (const p of people) {
    const firstDay = Math.floor((new Date(p.first).getTime() + IST_OFFSET_MS) / DAY_MS);
    const later = p.days.map(dayNo).filter((d) => d > firstDay).map((d) => d - firstDay);
    // Weeks start on Monday (day 0 of the epoch was a Thursday).
    const week = new Date((firstDay - ((firstDay + 3) % 7)) * DAY_MS).toISOString().slice(0, 10);
    const c = cohorts.get(week) || { week, people: 0, d1: 0, d7: 0, d30: 0 };
    c.people += 1;
    if (later.some((d) => d <= 1)) c.d1 += 1;
    if (later.some((d) => d <= 7)) c.d7 += 1;
    if (later.some((d) => d <= 30)) c.d30 += 1;
    cohorts.set(week, c);
  }
  return { weeks: w, cohorts: [...cohorts.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-w) };
}

/** What people searched for, and what found no service near them (what to launch next). */
async function searches({ days = 30 } = {}) {
  const { n, from } = sinceDays(days, 30);
  const { SearchEvent } = require('../telemetry/telemetry.model');
  const rows = await SearchEvent.aggregate([
    { $match: { createdAt: { $gte: from } } },
    { $group: { _id: '$category', total: { $sum: 1 }, noService: { $sum: { $cond: [{ $eq: ['$result', 'no_service'] }, 1, 0] } } } },
    { $project: { _id: 0, category: '$_id', total: 1, noService: 1 } },
    { $sort: { total: -1 } },
    { $limit: 40 },
  ]);
  return { days: n, top: rows, unmet: rows.filter((r) => r.noService > 0).sort((a, b) => b.noService - a.noService).slice(0, 15) };
}

/** Where website visits come from, and sign-ups through a friend's code. */
async function sources({ days = 30 } = {}) {
  const { n, from } = sinceDays(days, 30);
  const { ReferralUse } = require('../referral/referral.model');
  const [referrers, referralSignups] = await Promise.all([
    VisitorSession.aggregate([
      { $match: { firstSeen: { $gte: from }, platform: { $in: ['web', null] }, device: { $ne: 'bot' } } },
      { $group: { _id: { $ifNull: ['$referrer', 'direct'] }, visits: { $sum: 1 } } },
      { $project: { _id: 0, source: '$_id', visits: 1 } },
      { $sort: { visits: -1 } },
      { $limit: 15 },
    ]),
    ReferralUse.countDocuments({ createdAt: { $gte: from } }).catch(() => 0),
  ]);
  return { days: n, referrers, referralSignups };
}

/** The slowest API routes (typical and worst 5%) since the server last started, with the error stream's pulse. */
async function speed() {
  const { speedStats } = require('../../middlewares/requestTiming');
  const errors = await require('../telemetry/errors.service').pulse().catch(() => null);
  return { ...speedStats(25), errors };
}

module.exports = { live, summary, versions, funnel, notifications, partners, retention, searches, sources, speed };
