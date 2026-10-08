/**
 * Live errors — what real people are hitting, across every app and role.
 *
 *   capture   four sources, one shape (ErrorEvent):
 *               crash    a screen fell over (React error boundary)
 *               js       an uncaught error / rejected promise in the browser
 *               api      a request the person made failed (5xx, network, or a
 *                        4xx they were shown — 401 never, it is a sign-in refresh)
 *               server   an unexpected 5xx raised on the API itself
 *             Each carries who it happened to (role + id, from their verified
 *             token — never from what the browser claims), the app, the screen.
 *
 *   group     events with the same fingerprint (kind · app · message with ids
 *             and numbers taken out · the screen or endpoint) are one Issue:
 *             count, people affected, roles, first and last seen. A resolved
 *             issue that happens again reopens itself, marked as come back.
 *
 *   act       ops plans the fix on the issue (priority, owner, steps, ETA,
 *             status) and can message the people affected — one person or all.
 *
 * Bounded: per issue at most EVENTS_PER_MIN rows a minute are stored (the
 * count still rises), events expire after 30 days.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../../core/logger');

const EVENTS_PER_MIN = 20;
const KINDS = ['crash', 'js', 'api', 'server'];
const ROLES = ['user', 'worker', 'shop', 'event_partner', 'admin', 'guest'];

const eventSchema = new mongoose.Schema({
  issueId: { type: mongoose.Schema.Types.ObjectId, index: true },
  fingerprint: { type: String, index: true },
  kind: { type: String, enum: KINDS },
  severity: { type: String, enum: ['error', 'warning'], default: 'error' },
  app: { type: String, default: '' },
  role: { type: String, enum: ROLES, default: 'guest' },
  userId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  path: { type: String, default: '' },
  message: { type: String, default: '' },
  stack: { type: String, default: '' },
  componentStack: { type: String, default: '' },
  api: { method: String, url: String, status: Number, code: String, requestId: String },
  ua: { type: String, default: '' },
  device: { type: String, default: '' },
  release: { type: String, default: '' },
  at: { type: Date, default: Date.now, index: true },
}, { versionKey: false });
eventSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 86400 });

const issueSchema = new mongoose.Schema({
  fingerprint: { type: String, unique: true },
  kind: { type: String, enum: KINDS },
  severity: { type: String, enum: ['error', 'warning'], default: 'error' },
  app: { type: String, default: '' },
  title: { type: String, default: '' },
  where: { type: String, default: '' },
  count: { type: Number, default: 0 },
  people: { type: [String], default: [] }, // "role:id", capped
  roles: { type: [String], default: [] },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['open', 'planned', 'fixing', 'resolved', 'ignored'], default: 'open', index: true },
  cameBack: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  plan: {
    priority: { type: String, enum: ['P0', 'P1', 'P2', 'P3'], default: 'P2' },
    owner: { type: String, default: '' },
    steps: { type: String, default: '' },
    eta: { type: Date, default: null },
    updatedBy: { type: String, default: '' },
    updatedAt: { type: Date, default: null },
  },
  messaged: [{ _id: false, to: String, title: String, at: Date, by: String }],
}, { timestamps: true, versionKey: false });

const ErrorEvent = mongoose.models.ErrorEvent || mongoose.model('ErrorEvent', eventSchema);
const ErrorIssue = mongoose.models.ErrorIssue || mongoose.model('ErrorIssue', issueSchema);

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Ids, numbers, hashes and quoted values out, so the same fault groups together. */
function normalise(s = '') {
  return String(s)
    .replace(/[0-9a-f]{24}/gi, ':id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .replace(/\b\d+(\.\d+)?\b/g, '#')
    .replace(/(["'`]).{1,80}?\1/g, '"…"')
    .replace(/\?.*$/, '')
    .trim()
    .slice(0, 300);
}

/** The screen or endpoint, as a pattern: /repair/bookings/:id, not one booking. */
const pattern = (p = '') => normalise(String(p).split('?')[0]).replace(/\/#(?=\/|$)/g, '/:n');

function deviceOf(ua = '') {
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Other';
  const br = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : /firefox|fxios/i.test(ua) ? 'Firefox' : 'Other';
  return `${os} · ${br}${/mobile/i.test(ua) ? ' · phone' : ''}`;
}

/** Who sent it, from their own access token only. */
function whoFrom(token) {
  if (!token || typeof token !== 'string') return { role: 'guest', userId: null };
  try {
    // Signature checked; an expired token still says who it was (identity only, no access).
    const d = require('jsonwebtoken').verify(token.replace(/^Bearer\s+/i, ''), require('../../config').jwt.secret, { ignoreExpiration: true });
    const role = ROLES.includes(d.role) ? d.role : 'guest';
    return { role, userId: mongoose.isValidObjectId(d.sub) ? d.sub : null };
  } catch { return { role: 'guest', userId: null }; }
}

/** Record one error. Never throws: monitoring must not become the outage. */
async function record(input) {
  try {
    const kind = KINDS.includes(input.kind) ? input.kind : 'js';
    const message = clip(input.message, 500) || '(no message)';
    const where = kind === 'api' || kind === 'server'
      ? `${input.api?.method || ''} ${pattern(input.api?.url || input.path)}`.trim()
      : pattern(input.path);
    const severity = input.severity === 'warning' ? 'warning' : 'error';
    const app = clip(input.app, 40);
    const fingerprint = crypto.createHash('sha1').update([kind, app, normalise(message), where].join('|')).digest('hex');
    const person = input.userId ? `${input.role}:${input.userId}` : null;
    const now = new Date();

    // Group first; a resolved issue that happens again is open again.
    const issue = await ErrorIssue.findOneAndUpdate(
      { fingerprint },
      {
        $setOnInsert: { fingerprint, kind, severity, app, title: message.slice(0, 200), where, firstSeen: now },
        $inc: { count: 1 },
        $set: { lastSeen: now },
        $addToSet: { roles: input.role || 'guest', ...(person ? { people: person } : {}) },
      },
      { upsert: true, new: true },
    );
    if (issue.status === 'resolved' && issue.resolvedAt && issue.resolvedAt < now) {
      await ErrorIssue.updateOne({ _id: issue._id }, { $set: { status: 'open', cameBack: true } });
    }
    if (issue.people.length > 500) await ErrorIssue.updateOne({ _id: issue._id }, { $push: { people: { $each: [], $slice: -500 } } });

    // At most EVENTS_PER_MIN stored a minute per issue; the count above always rises.
    const { redis, scoped } = require('../../config/redis');
    const key = scoped ? scoped(`errs:rate:${fingerprint}:${Math.floor(Date.now() / 60000)}`) : `errs:rate:${fingerprint}`;
    const n = await redis.incr(key).catch(() => 1);
    if (n === 1) redis.expire(key, 120).catch(() => {});
    if (n > EVENTS_PER_MIN) return issue;

    await ErrorEvent.create({
      issueId: issue._id, fingerprint, kind, severity, app, role: input.role || 'guest', userId: input.userId || null,
      path: clip(input.path, 220), message, stack: clip(input.stack, 3000), componentStack: clip(input.componentStack, 1500),
      api: input.api ? {
        method: clip(input.api.method, 10), url: clip(input.api.url, 300), status: Number(input.api.status) || 0,
        code: clip(input.api.code, 60), requestId: clip(input.api.requestId, 60),
      } : undefined,
      ua: clip(input.ua, 250), device: deviceOf(input.ua || ''), release: clip(input.release, 40), at: now,
    });
    return issue;
  } catch (e) {
    logger.warn({ err: e.message }, '[errors] not recorded');
    return null;
  }
}

/* Reading, for the admin console */

/** Names for the people in a list of events, in one read per role. */
async function namesFor(rows) {
  const byRole = {};
  for (const r of rows) if (r.userId) (byRole[r.role] ||= new Set()).add(String(r.userId));
  const out = new Map();
  const load = async (role, Model, fields, name) => {
    if (!byRole[role]?.size) return;
    const docs = await Model.find({ _id: { $in: [...byRole[role]] } }).select(fields).lean().catch(() => []);
    for (const d of docs) out.set(`${role}:${d._id}`, { name: name(d) || 'Unnamed', phone: d.phone || '' });
  };
  await Promise.all([
    load('user', require('../user/user.model'), 'name phone', (d) => d.name),
    load('worker', require('../worker/worker.model'), 'name phone', (d) => d.name),
    load('shop', require('../shop/shop.model'), 'businessName ownerName phone', (d) => d.businessName || d.ownerName),
    load('event_partner', require('../events/event-partner.model'), 'businessName name phone', (d) => d.businessName || d.name),
  ]);
  return out;
}

const withNames = async (rows) => {
  const names = await namesFor(rows);
  return rows.map((r) => ({ ...r, who: r.userId ? names.get(`${r.role}:${r.userId}`) || null : null }));
};

/** The newest events, optionally only those after a moment (the live feed polls this). */
async function live({ since = null, app, role, kind, severity, limit = 60 } = {}) {
  const q = {};
  if (since) q.at = { $gt: new Date(since) };
  if (app) q.app = app;
  if (role) q.role = role;
  if (kind) q.kind = kind;
  if (severity) q.severity = severity;
  const rows = await ErrorEvent.find(q).sort({ at: -1 }).limit(Math.min(200, limit)).select('-stack -componentStack').lean();
  return withNames(rows);
}

/** The headline numbers and a per-minute line for the last hour. */
async function pulse() {
  const hour = new Date(Date.now() - 3600e3);
  const day = new Date(Date.now() - 86400e3);
  const [lastHour, people, byRole, byApp, perMin, openIssues, newToday, p0] = await Promise.all([
    ErrorEvent.countDocuments({ at: { $gte: hour }, severity: 'error' }),
    ErrorEvent.distinct('userId', { at: { $gte: hour }, userId: { $ne: null } }),
    ErrorEvent.aggregate([{ $match: { at: { $gte: day } } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
    ErrorEvent.aggregate([{ $match: { at: { $gte: day } } }, { $group: { _id: '$app', n: { $sum: 1 } } }]),
    ErrorEvent.aggregate([
      { $match: { at: { $gte: hour } } },
      { $group: { _id: { $dateTrunc: { date: '$at', unit: 'minute' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ErrorIssue.countDocuments({ status: { $in: ['open', 'planned', 'fixing'] } }),
    ErrorIssue.countDocuments({ firstSeen: { $gte: day } }),
    ErrorIssue.countDocuments({ 'plan.priority': 'P0', status: { $nin: ['resolved', 'ignored'] } }),
  ]);
  const prevHour = await ErrorEvent.countDocuments({ at: { $gte: new Date(Date.now() - 7200e3), $lt: hour }, severity: 'error' });
  return {
    lastHour, prevHour, peopleLastHour: people.length, openIssues, newToday, p0,
    byRole: Object.fromEntries(byRole.map((r) => [r._id || 'guest', r.n])),
    byApp: Object.fromEntries(byApp.map((r) => [r._id || 'unknown', r.n])),
    perMinute: perMin.map((r) => ({ at: r._id, n: r.n })),
  };
}

async function issues({ status = 'active', app, role, kind, q, sort = 'recent' } = {}) {
  const f = {};
  if (status === 'active') f.status = { $in: ['open', 'planned', 'fixing'] };
  else if (status && status !== 'all') f.status = status;
  if (app) f.app = app;
  if (role) f.roles = role;
  if (kind) f.kind = kind;
  if (q) f.title = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), $options: 'i' };
  const order = sort === 'count' ? { count: -1 } : sort === 'people' ? { peopleCount: -1 } : { lastSeen: -1 };
  const rows = await ErrorIssue.aggregate([
    { $match: f },
    { $addFields: { peopleCount: { $size: '$people' } } },
    { $sort: order },
    { $limit: 200 },
    { $project: { people: 0, messaged: 0 } },
  ]);
  // Last 24 h, per hour, for each row's sparkline.
  const since = new Date(Date.now() - 86400e3);
  const spark = await ErrorEvent.aggregate([
    { $match: { issueId: { $in: rows.map((r) => r._id) }, at: { $gte: since } } },
    { $group: { _id: { i: '$issueId', h: { $floor: { $divide: [{ $subtract: ['$at', since] }, 3600e3] } } }, n: { $sum: 1 } } },
  ]);
  const lines = new Map();
  for (const s of spark) {
    const k = String(s._id.i);
    if (!lines.has(k)) lines.set(k, Array(24).fill(0));
    lines.get(k)[Math.min(23, s._id.h)] = s.n;
  }
  return rows.map((r) => ({ ...r, spark: lines.get(String(r._id)) || Array(24).fill(0) }));
}

async function issue(id) {
  const row = await ErrorIssue.findById(id).lean();
  if (!row) throw Object.assign(new Error('Issue not found'), { status: 404 });
  const events = await withNames(await ErrorEvent.find({ issueId: row._id }).sort({ at: -1 }).limit(50).lean());
  const people = await namesFor(row.people.slice(-200).map((p) => { const [role, userId] = p.split(':'); return { role, userId }; }));
  return {
    ...row,
    people: row.people.slice(-200).reverse().map((p) => { const [role, userId] = p.split(':'); return { role, userId, ...(people.get(p) || {}) }; }),
    events,
  };
}

async function plan(id, { status, priority, owner, steps, eta }, adminName = '') {
  const set = { 'plan.updatedBy': adminName, 'plan.updatedAt': new Date() };
  if (priority) set['plan.priority'] = priority;
  if (owner != null) set['plan.owner'] = String(owner).slice(0, 80);
  if (steps != null) set['plan.steps'] = String(steps).slice(0, 4000);
  if (eta !== undefined) set['plan.eta'] = eta ? new Date(eta) : null;
  if (status) {
    set.status = status;
    if (status === 'resolved') { set.resolvedAt = new Date(); set.cameBack = false; }
  }
  const row = await ErrorIssue.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!row) throw Object.assign(new Error('Issue not found'), { status: 404 });
  return row;
}

/**
 * Message the people an issue affected: one ("role:id") or everyone on it.
 * In-app notification + push, through the one notification service.
 */
async function message(id, { to = 'all', title, body }, adminName = '') {
  const row = await ErrorIssue.findById(id).select('people').lean();
  if (!row) throw Object.assign(new Error('Issue not found'), { status: 404 });
  const targets = (to === 'all' ? row.people : [to]).filter((p) => row.people.includes(p));
  const notify = require('../notification/notification.service').notify;
  let sent = 0;
  for (const p of targets.slice(0, 500)) {
    const [kind, recipientId] = p.split(':');
    if (!['user', 'worker', 'shop', 'event_partner'].includes(kind)) continue;
    await notify({ recipient: { kind, id: recipientId }, type: 'system_alert', title: String(title).slice(0, 80), body: String(body).slice(0, 300), data: { type: 'error_followup' } })
      .then(() => { sent += 1; }).catch(() => {});
  }
  await ErrorIssue.updateOne({ _id: id }, { $push: { messaged: { to, title, at: new Date(), by: adminName } } });
  return { sent, message: `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}.` };
}

module.exports = { record, whoFrom, live, pulse, issues, issue, plan, message, normalise, ErrorEvent, ErrorIssue };
