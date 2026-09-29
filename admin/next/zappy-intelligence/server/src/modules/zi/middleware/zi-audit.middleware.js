'use strict';

const ZIAuditLog = require('../models/ZIAuditLog');

/**
 * Derive a semantic action string from method + path.
 * e.g. GET /zi/v1/command/live -> command:read:live
 *      POST /zi/v1/expansion/analyze -> expansion:write:analyze
 *      POST /zi/v1/expansion/abc123/approve -> expansion:write:approve
 */
function deriveAction(method, path) {
  // Normalize path: strip query, strip leading /zi/v1/
  const cleanPath = path.split('?')[0].replace(/^\/zi\/v\d+\//, '');
  const segments = cleanPath.split('/').filter(Boolean);

  const resource = segments[0] || 'unknown';

  // Map HTTP verbs to intent
  const verbMap = {
    GET: 'read',
    POST: 'write',
    PUT: 'write',
    PATCH: 'write',
    DELETE: 'delete',
  };
  const intent = verbMap[method] || method.toLowerCase();

  // Last segment for specificity, skip if it looks like an ObjectId
  const isObjectId = (s) => /^[0-9a-f]{24}$/i.test(s);
  const lastSegment = segments[segments.length - 1];
  const subAction = lastSegment && !isObjectId(lastSegment) && lastSegment !== resource
    ? `:${lastSegment}`
    : '';

  return `${resource}:${intent}${subAction}`;
}

/**
 * Express middleware that logs every ZI request to ZIAuditLog after the response.
 * Fire-and-forget — never blocks the response or throws to the client.
 *
 * Usage: router.use(ziAudit)  — attach early in the ZI router chain
 */
function ziAudit(req, res, next) {
  const startTime = Date.now();

  // Hook into the response finish event so we capture the final status code
  res.on('finish', () => {
    // Only log if the request was authenticated (req.ziUser set by ziAuth)
    if (!req.ziUser) return;

    const durationMs = Date.now() - startTime;
    const action = deriveAction(req.method, req.path || req.url);
    const ip = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    const logEntry = {
      userId: req.ziUser.id,
      role: req.ziUser.role,
      action,
      resource: (req.path || '').split('/')[3] || null, // module name
      resourceId: req.params && (req.params.id || req.params.cityId || null),
      ip,
      userAgent: req.headers['user-agent'] || null,
      sessionId: req.headers['x-zi-session'] || null,
      method: req.method,
      path: req.path || req.url,
      statusCode: res.statusCode,
      durationMs,
      result: res.statusCode >= 200 && res.statusCode < 400 ? 'success'
        : res.statusCode === 403 ? 'denied'
        : 'error',
      metadata: {
        query: req.query && Object.keys(req.query).length ? req.query : undefined,
        bodyKeys: req.body && typeof req.body === 'object'
          ? Object.keys(req.body).filter(k => !['password', 'passwordHash', 'token', 'secret'].includes(k))
          : undefined,
      },
      timestamp: new Date(),
    };

    // Fire and forget — errors here must never surface to the client
    ZIAuditLog.create(logEntry).catch((err) => {
      // Log to stdout but do not rethrow
      process.stderr.write(`[ZIAudit] Failed to write audit log: ${err.message}\n`);
    });
  });

  return next();
}

module.exports = ziAudit;
