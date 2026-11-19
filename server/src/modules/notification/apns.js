// iPhone push straight to Apple (APNs HTTP/2, .p8 token auth); needs APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY or APNS_KEY_PATH, else iPhone push is skipped and logged.
const http2 = require('http2');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const logger = require('../../core/logger');

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
// Which app a recipient uses: customers the ZappyOne app, every partner ServicePro.
const BUNDLE = { customer: 'com.zappyone.app', servicepro: 'com.zappyone.servicepro' };
const bundleFor = (kind) => (kind === 'user' ? BUNDLE.customer : BUNDLE.servicepro);
const other = (topic) => (topic === BUNDLE.customer ? BUNDLE.servicepro : BUNDLE.customer);

/** A raw APNs device token (hex, 32 bytes today; Apple says the length may grow); FCM registration tokens carry a colon. */
const isApnsToken = (t) => typeof t === 'string' && /^[0-9a-f]{64,200}$/i.test(t);

function keyConfig() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  let key = process.env.APNS_KEY ? process.env.APNS_KEY.replace(/\\n/g, '\n') : null;
  if (!key && process.env.APNS_KEY_PATH) { try { key = fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8'); } catch { key = null; } }
  return keyId && teamId && key ? { keyId, teamId, key } : null;
}
const isConfigured = () => !!keyConfig();

// Apple accepts a provider token for up to an hour and rejects refreshing it more than every 20 minutes.
let cached = { token: null, at: 0 };
function providerToken(cfg) {
  if (cached.token && Date.now() - cached.at < 40 * 60 * 1000) return cached.token;
  cached = { token: jwt.sign({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) }, cfg.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.keyId }, noTimestamp: true }), at: Date.now() };
  return cached.token;
}

// One long-lived HTTP/2 connection per host, as Apple asks.
const sessions = {};
function session(env) {
  const s = sessions[env];
  if (s && !s.closed && !s.destroyed) return s;
  const fresh = http2.connect(HOSTS[env]);
  fresh.on('error', (e) => logger.warn({ err: e.message, env }, '[APNs] connection error'));
  fresh.on('goaway', () => fresh.close());
  fresh.unref();
  fresh.pending = 0;
  sessions[env] = fresh;
  return fresh;
}

function post(env, deviceToken, headers, body, auth) {
  return new Promise((resolve) => {
    let req;
    // Idle, the connection never keeps the process alive; while a push is on its way, it does.
    const s = session(env);
    s.pending += 1; s.ref();
    const done = resolve;
    let settled = false;
    resolve = (v) => { if (settled) return; settled = true; s.pending -= 1; if (s.pending <= 0 && !s.destroyed) s.unref(); done(v); };
    try {
      req = s.request({ ':method': 'POST', ':path': `/3/device/${deviceToken}`, ...(auth && { authorization: `bearer ${auth}` }), ...headers });
    } catch (e) { resolve({ status: 0, reason: e.message }); return; }
    let status = 0; let data = '';
    req.setTimeout(10000, () => { req.close(); resolve({ status: 0, reason: 'Timeout' }); });
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { data += c; });
    req.on('end', () => { let reason = ''; try { reason = data ? JSON.parse(data).reason : ''; } catch { reason = data; } resolve({ status, reason }); });
    req.on('error', (e) => resolve({ status: 0, reason: e.message }));
    req.end(body);
  });
}

// One APNs request: data rides in `body` (expo-notifications reads it there); job offers ring with zappy_ring.wav, break through Focus and expire with the offer.
function buildRequest({ title, body, data = {}, offer = false, windowSec = 60 }) {
  const payload = {
    aps: {
      alert: { title: String(title || ''), body: String(body || '') },
      sound: offer ? 'zappy_ring.wav' : 'default',
      ...(offer && { 'interruption-level': 'time-sensitive' }),
    },
    body: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  };
  const headers = {
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + (offer ? Math.min(900, Math.max(15, Number(windowSec) || 60)) : 24 * 3600)),
    ...(offer && data.orderId && { 'apns-collapse-id': `offer-${String(data.orderId).slice(0, 50)}` }),
  };
  return { headers, body: JSON.stringify(payload) };
}

// Sends to raw APNs tokens for the recipient's app, retrying once on the other app or the sandbox; returns { ok, success, failure, stale } (stale = tokens to prune).
async function sendApns({ tokens, kind, title, body, data, offer, windowSec }) {
  const list = [...new Set((tokens || []).filter(isApnsToken))];
  if (!list.length) return { skipped: true, reason: 'no_tokens', success: 0, failure: 0, stale: [] };
  const cfg = keyConfig();
  if (!cfg) {
    logger.info({ tokens: list.length, title }, '[APNs] not configured - skipping iPhone push');
    return { skipped: true, reason: 'apns_not_configured', success: 0, failure: 0, stale: [] };
  }
  const req = buildRequest({ title, body, data, offer, windowSec });
  const auth = providerToken(cfg);
  let success = 0; let failure = 0; const stale = [];
  // A few hundred streams at a time, so a broadcast never opens thousands at once on one connection.
  const one = async (token) => {
    let env = 'production';
    let topic = bundleFor(kind);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const r = await post(env, token, { ...req.headers, 'apns-topic': topic }, req.body, auth);
      if (r.status === 200) { success += 1; return; }
      if (r.reason === 'BadDeviceToken' && env === 'production') { env = 'sandbox'; continue; }
      if (r.reason === 'DeviceTokenNotForTopic') { topic = other(topic); continue; }
      if (r.status === 410 || r.reason === 'Unregistered' || r.reason === 'BadDeviceToken') stale.push(token);
      if (r.status === 403) cached = { token: null, at: 0 };
      logger.warn({ status: r.status, reason: r.reason, env, topic }, '[APNs] push refused');
      failure += 1;
      return;
    }
    failure += 1;
  };
  for (let i = 0; i < list.length; i += 200) await Promise.all(list.slice(i, i + 200).map(one));
  return { ok: success > 0, success, failure, stale };
}

module.exports = { sendApns, isApnsToken, isConfigured, buildRequest, bundleFor, HOSTS, _post: post };
