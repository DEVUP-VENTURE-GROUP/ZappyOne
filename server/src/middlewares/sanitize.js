/**
 * Sanitize request inputs against:
 *   1. NoSQL operator injection — strip keys starting with '$' or containing '.'
 *   2. Prototype pollution — strip __proto__, constructor, prototype keys
 *   3. HTML/script injection — strip HTML tags from user-facing text fields
 *   4. Excessive nesting — cap recursion depth to prevent DoS via deeply nested JSON
 */

const FORBIDDEN_KEY = /^\$|\./;

// Prototype pollution vectors — must never appear as object keys.
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_DEPTH = 15; // reject objects nested deeper than 15 levels

// Fields whose string values should be HTML-stripped.
const HTML_STRIP_FIELDS = new Set([
  'description', 'review', 'reason', 'name', 'address', 'landmark',
  'flatNumber', 'notes', 'unitDetails', 'caption', 'text', 'message',
  'subject', 'body', 'title', 'content',
]);

const HTML_TAG_RE = /<[^>]*>/g;

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(HTML_TAG_RE, '').trim();
}

function sanitize(obj, depth = 0) {
  if (!obj || typeof obj !== 'object') return obj;
  // Depth cap — reject bomb payloads silently
  if (depth > MAX_DEPTH) return {};
  if (Array.isArray(obj)) return obj.map((v) => sanitize(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    // Block NoSQL operators
    if (FORBIDDEN_KEY.test(k)) continue;
    // Block prototype pollution
    if (PROTOTYPE_KEYS.has(k)) continue;
    if (typeof v === 'string' && HTML_STRIP_FIELDS.has(k)) {
      out[k] = stripHtml(v);
    } else if (v && typeof v === 'object') {
      out[k] = sanitize(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeMiddleware(req, res, next) {
  if (req.body) req.body = sanitize(req.body);
  // Note: req.query is a getter in Express 5 — mutate in place
  if (req.query) {
    for (const k of Object.keys(req.query)) {
      if (FORBIDDEN_KEY.test(k)) delete req.query[k];
    }
  }
  if (req.params) {
    for (const k of Object.keys(req.params)) {
      if (FORBIDDEN_KEY.test(k)) delete req.params[k];
    }
  }
  next();
}

module.exports = { sanitize, sanitizeMiddleware };
