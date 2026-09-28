/**
 * Allowed browser origins — SINGLE SOURCE OF TRUTH.
 *
 * Express CORS (app.js) and socket.io (sockets/index.js) MUST allow the same
 * hosts. They used to be two hand-maintained arrays and they drifted: the
 * rakshak/events subdomains were added to Express but not to socket.io, so on
 * rakshak.zappyone.com the REST API worked while every socket connection was
 * rejected — workers silently got no job-offer popups, no live tracking, no chat.
 *
 * Anything that serves the SPA must be listed here.
 */

const PRODUCTION_ORIGINS = [
  'https://zappyone.com',           // consumer (apex)
  'https://www.zappyone.com',       // consumer (www)
  'https://rakshak.zappyone.com',   // independent workers (rakshak/ app)
  'https://servicepro.zappyone.com', // shop owners + shop workers (servicepro/ app)
  'https://events.zappyone.com',    // event partner portal
  'https://admin.zappyone.com',     // admin portal (admin/ app)
];

/** Origins the admin portal is served from. `ADMIN_URL` adds staging. */
function adminOrigins() {
  const list = ['https://admin.zappyone.com'];
  if (process.env.ADMIN_URL && !list.includes(process.env.ADMIN_URL)) list.push(process.env.ADMIN_URL);
  return list;
}

/**
 * Origins allowed in production. `CLIENT_URL` (staging/preview) is appended when
 * set. In non-production we allow everything so localhost:5173 and LAN/device
 * testing work without config.
 */
function allowedOrigins() {
  const list = [...PRODUCTION_ORIGINS];
  if (process.env.CLIENT_URL && !list.includes(process.env.CLIENT_URL)) {
    list.push(process.env.CLIENT_URL);
  }
  for (const o of adminOrigins()) if (!list.includes(o)) list.push(o);
  return list;
}

/** Value for `cors({ origin })` / socket.io `cors.origin`. */
function corsOrigin() {
  return process.env.NODE_ENV === 'production' ? allowedOrigins() : true;
}

/** socket.io rejects `true`, so it needs an explicit list (or '*' in dev). */
function socketCorsOrigin() {
  return process.env.NODE_ENV === 'production' ? allowedOrigins() : '*';
}

module.exports = { PRODUCTION_ORIGINS, allowedOrigins, adminOrigins, corsOrigin, socketCorsOrigin };
