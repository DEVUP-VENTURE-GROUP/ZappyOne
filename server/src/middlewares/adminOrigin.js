const { adminOrigins } = require('../config/origins');

/**
 * Admin API calls from a browser must come from the admin portal's origin.
 *
 * The JWT is still what authorises the call — this is defence in depth: a
 * stolen admin token replayed from the customer site (an XSS there, say) is
 * refused by the browser-origin check before any handler runs. Requests with
 * no Origin header (server-to-server, curl) fall through to the JWT check.
 * Enforced in production only, so localhost and LAN testing keep working.
 */
function requireAdminOrigin(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();
  const origin = req.headers.origin;
  if (!origin || adminOrigins().includes(origin)) return next();
  return res.status(403).json({ error: 'Admin API is only reachable from the admin portal', code: 'ADMIN_ORIGIN' });
}

module.exports = { requireAdminOrigin };
