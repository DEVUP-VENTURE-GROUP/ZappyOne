const logger = require('../core/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL' : 'ERROR');

  if (status >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path, reqId: req.id }, 'Unhandled error');
  } else {
    logger.warn({ err: err.message, path: req.path, status, code, reqId: req.id }, 'Handled error');
  }

  // Pick up any extra fields the caller attached (e.g. activeOrderId, kycStatus)
  const extras = {};
  for (const k of Object.keys(err)) {
    if (!['message', 'status', 'statusCode', 'code', 'stack', 'name', 'details'].includes(k)) {
      extras[k] = err[k];
    }
  }

  res.status(status).json({
    error: err.message || 'Internal Server Error',
    code,
    requestId: req.id,
    ...(err.details ? { details: err.details } : {}),
    ...extras,
  });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
}

module.exports = { errorHandler, notFound };
