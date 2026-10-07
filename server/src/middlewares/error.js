const logger = require('../core/logger');

/**
 * What a person sees when something fails. Errors we raise on purpose carry a
 * message written for people and pass through. Anything unexpected (a crash,
 * a database hiccup, a library's own wording) is logged in full with its
 * request id and the person gets a calm, plain sentence instead of internals.
 */
const CALM = 'That did not go through. Please try again in a moment.';

/** Database errors that are really a bad request, in words a person understands. */
function fromDatabase(err) {
  if (err.name === 'CastError') return { status: 400, code: 'BAD_ID', message: 'We could not find that. Check the link and try again.' };
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return { status: 400, code: 'VALIDATION_FAILED', message: first?.message || 'Some details are missing or not right.' };
  }
  if (err.code === 11000) return { status: 409, code: 'ALREADY_EXISTS', message: 'This already exists.' };
  return null;
}

/**
 * A message written for us, not for the person: job states in capitals
 * (IN_PROGRESS), database or library wording. Replaced by what it means.
 */
const INTERNAL = /\b[A-Z]{2,}(?:_[A-Z]+)+\b|Cast to|ObjectId|E11000|\bundefined\b|\bnull\b|is not a function|Cannot read prop|[Ii]llegal transition|Cannot move a/;
const PLAIN_BY_STATUS = {
  400: 'Some details are not quite right. Check them and try again.',
  401: 'Please sign in again to continue.',
  403: 'This is not available on your account.',
  404: 'We could not find that. It may have been removed.',
  409: 'This was just updated. Refresh to see the latest.',
  429: 'Please wait a moment and try again.',
};
const plain = (message, status) => (message && INTERNAL.test(message) ? PLAIN_BY_STATUS[status] || CALM : message);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const db = !Number.isInteger(err.status) && !Number.isInteger(err.statusCode) ? fromDatabase(err) : null;
  // Only a real HTTP error code may reach the response; a stray field (a job's
  // own status like 'QA_PENDING') must never crash the reply.
  const httpCode = (v) => (Number.isInteger(v) && v >= 400 && v <= 599 ? v : null);
  const status = db?.status || httpCode(err.status) || httpCode(err.statusCode) || 500;
  const code = db?.code || (typeof err.code === 'string' ? err.code : null) || (status >= 500 ? 'INTERNAL' : 'ERROR');

  if (status >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.path, reqId: req.id }, 'Unhandled error');
  } else {
    logger.warn({ err: err.message, path: req.path, status, code, reqId: req.id }, 'Handled error');
  }

  // Pick up any extra fields the caller attached (e.g. activeOrderId, kycStatus).
  // An unexpected error's own fields are internals, never sent.
  const expected = status < 500 || Boolean(httpCode(err.status) || httpCode(err.statusCode));
  const extras = {};
  if (expected && !db) for (const k of Object.keys(err)) {
    if (!['message', 'status', 'statusCode', 'code', 'stack', 'name', 'details'].includes(k)) {
      extras[k] = err[k];
    }
  }

  res.status(status).json({
    error: plain(db?.message || (expected && err.message), status) || CALM,
    code,
    requestId: req.id,
    ...(err.details ? { details: err.details } : {}),
    ...extras,
  });
}

function notFound(req, res) {
  res.status(404).json({ error: 'We could not find that.', code: 'NOT_FOUND', path: `${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
