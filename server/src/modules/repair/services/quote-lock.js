// The distance a customer was quoted, signed so the booking can use exactly it for 10 minutes even if the pro moves meanwhile; a forged, edited or expired token is ignored and the live distance is used.
const crypto = require('crypto');
const config = require('../../../config');

const TTL_MS = 10 * 60000;
const key = () => crypto.createHash('sha256').update(`quote-lock:${config.jwt.secret}`).digest();
const providerOf = ({ shopId, workerId }) => (shopId ? `s:${shopId}` : workerId ? `w:${workerId}` : null);

function sign({ shopId = null, workerId = null, vertical, distanceKm, now = Date.now() }) {
  const p = providerOf({ shopId, workerId });
  if (!p || distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const body = Buffer.from(JSON.stringify({ p, v: vertical, d: Math.round(distanceKm * 1000) / 1000, e: now + TTL_MS })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', key()).update(body).digest('base64url')}`;
}

// The quoted distance, only for this provider and service, signed by us and not expired; otherwise null.
function verify(token, { shopId = null, workerId = null, vertical, now = Date.now() }) {
  if (typeof token !== 'string' || token.length > 400 || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  if (!mac || mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (data.e < now || data.v !== vertical || data.p !== providerOf({ shopId, workerId })) return null;
  return Number.isFinite(data.d) && data.d >= 0 ? data.d : null;
}

module.exports = { sign, verify, TTL_MS };
