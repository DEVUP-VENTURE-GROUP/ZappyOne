const AuditLog = require('./audit-log.model');
const logger = require('../../core/logger');

async function log({ actor, action, target, before, after, ip, userAgent, portal }) {
  try {
    await AuditLog.create({ actor, action, target, before, after, ip, userAgent, portal });
  } catch (err) {
    // Audit failures must NOT break the main action — just log loudly.
    logger.error({ err: err.message, action }, 'Audit log write failed');
  }
}

function fromRequest(req, action, target, before, after) {
  // Lets a router-wide recorder (workforce/activity) skip what a route already logged in detail.
  req.audited = true;
  return log({
    actor: {
      kind: req.auth?.role || 'system',
      id: req.auth?.sub,
      email: req.auth?.email,
    },
    action,
    target,
    before,
    after,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    portal: req.get('x-client-type') || null,
  });
}

module.exports = { log, fromRequest };
