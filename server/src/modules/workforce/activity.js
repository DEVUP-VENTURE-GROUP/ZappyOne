// Fleet activity: every Fleet action recorded and readable by whoever runs Fleet.
const AuditLog = require('../admin/audit-log.model');
const auditService = require('../admin/audit.service');

const FLEET_ACTION = /^(workforce\.|fleet\.|economics\.workforce)/;
const SENSITIVE_READS = [[/^\/workforce\/shifts\/[^/]+\/selfie$/, 'fleet.view_selfie'], [/^\/workforce\/payroll/, 'fleet.view_payroll']];
const clip = (v) => { const s = JSON.stringify(v ?? null); return s.length > 2000 ? `${s.slice(0, 2000)}…` : JSON.parse(s); };

// Router middleware: a Fleet write a route did not log in detail, and private reads (a staff selfie, payroll), are recorded once the response is sent.
function recorder(req, res, next) {
  if (!req.path.startsWith('/workforce')) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || req.audited) return;
    const read = req.method === 'GET' ? SENSITIVE_READS.find(([re]) => re.test(req.path)) : null;
    if (req.method === 'GET' && !read) return;
    auditService.log({
      actor: { kind: 'admin', id: req.auth?.sub, email: req.auth?.email },
      action: read ? read[1] : `fleet.${req.method.toLowerCase()}`,
      target: { kind: 'workforce' },
      after: { path: req.originalUrl.split('?')[0], query: clip(req.query), ...(read ? {} : { body: clip(req.body) }) },
      ip: req.ip, userAgent: req.get('user-agent'), portal: req.get('x-client-type') || null,
    });
  });
  return next();
}

// Newest first: Fleet actions and every sign-in to the Fleet portal, optionally one person's.
async function list({ page = 1, actorId = null, limit = 50 } = {}) {
  const filter = { $or: [{ action: FLEET_ACTION }, { portal: 'fleet' }] };
  if (actorId) filter['actor.id'] = actorId;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((Math.max(1, page) - 1) * limit).limit(limit)
      .select('actor action target after ip userAgent portal at').lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { logs, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { recorder, list, FLEET_ACTION };
