/**
 * Token Service
 * ----------------------------------------------------------------------------
 * Two-token authentication:
 *   - Access token: short-lived (15 min), stateless JWT
 *   - Refresh token: long-lived (30 d), stateful (Redis), rotates on use
 *
 * Rotation + reuse detection:
 *   Refresh tokens have a "family" ID and a monotonically-incrementing generation.
 *   On /auth/refresh:
 *     - Load stored family by (userId, familyId)
 *     - If presented gen !== stored currentGen → TOKEN REUSE, revoke entire family
 *     - Else rotate: currentGen++, issue new RT with new gen, return new AT+RT pair
 *
 * This detects stolen-but-not-yet-used refresh tokens. The attacker and the real
 * user cannot both have the current gen; whichever refreshes second gets killed.
 * ----------------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../../config');
const { redis } = require('../../config/redis');
const logger = require('../../utils/logger');

const AT_EXPIRES = '15m';
const RT_EXPIRES_SEC = 60 * 60 * 24 * 30; // 30 days

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: AT_EXPIRES });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

function familyKey(userId, family) {
  return `rt:${userId}:${family}`;
}

// Maximum concurrent active sessions per role.
// Workers are capped at 3 (phone + tablet + emergency backup).
// Users are capped at 5 (more forgiving — family sharing, multiple browsers).
// Admins are capped at 2 (security).
const MAX_SESSIONS = { worker: 3, user: 5, admin: 2, event_partner: 3 };

/**
 * Issue a NEW token pair (fresh login).
 * Enforces per-role session limits: if the user already has MAX_SESSIONS
 * active families, the oldest one is revoked (sliding window keeps the most
 * recent N logins active).
 */
async function issueTokenPair({ sub, role, phone, email }) {
  const family = crypto.randomBytes(8).toString('hex');
  const gen = 0;
  const tokenId = crypto.randomBytes(16).toString('hex');

  // Workers = SINGLE active device
  // A new worker login kills EVERY other session: all prior refresh families are
  // revoked (so old devices can't refresh) and `wsid:<id>` records the one active
  // session. The access token carries this sid so the auth middleware can reject
  // the old device immediately (not just after its 15-min AT expires).
  if (role === 'worker') {
    try {
      const keys = [];
      const stream = redis.scanStream({ match: `rt:${sub}:*`, count: 100 });
      for await (const batch of stream) keys.push(...batch);
      if (keys.length) await redis.del(...keys);
    } catch (err) {
      logger.warn({ err: err.message, sub }, 'Single-device: prior-session revoke failed');
    }
  } else {
    // Other roles: sliding-window session cap — evict oldest if over the limit.
    const maxSessions = MAX_SESSIONS[role] ?? 5;
    try {
      const existingKeys = [];
      const stream = redis.scanStream({ match: `rt:${sub}:*`, count: 50 });
      for await (const batch of stream) existingKeys.push(...batch);

      if (existingKeys.length >= maxSessions) {
        const ttlPipe = redis.pipeline();
        existingKeys.forEach((k) => ttlPipe.ttl(k));
        const ttlResults = await ttlPipe.exec();
        const keysWithTtl = existingKeys
          .map((k, i) => ({ key: k, ttl: ttlResults[i][1] ?? 0 }))
          .sort((a, b) => a.ttl - b.ttl);
        const toEvict = keysWithTtl.slice(0, existingKeys.length - maxSessions + 1);
        if (toEvict.length > 0) {
          await redis.del(...toEvict.map((e) => e.key));
          logger.info({ sub, role, evicted: toEvict.length }, 'Session cap: evicted oldest families');
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, sub }, 'Session cap scan failed');
    }
  }

  const atPayload = { sub, role, phone, email };
  if (role === 'worker') atPayload.sid = family; // session id = active family
  const accessToken = signAccessToken(atPayload);
  const refreshToken = jwt.sign(
    { sub, role, family, gen, jti: tokenId, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: RT_EXPIRES_SEC }
  );

  await redis.setex(
    familyKey(sub, family),
    RT_EXPIRES_SEC,
    JSON.stringify({ currentGen: gen, sub, role, rotatedAt: 0 })
  );
  if (role === 'worker') {
    await redis.setex(`wsid:${sub}`, RT_EXPIRES_SEC, family);
  }

  return { accessToken, refreshToken };
}

/**
 * Rotate: verify the presented RT, ensure it's the current gen of its family,
 * issue a new pair with gen+1, invalidate the old one.
 */
async function rotateTokenPair(presentedRefreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(presentedRefreshToken, config.jwt.secret);
  } catch (err) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401, code: 'RT_INVALID' });
  }
  if (decoded.type !== 'refresh') {
    throw Object.assign(new Error('Not a refresh token'), { status: 401, code: 'RT_WRONG_TYPE' });
  }

  const { sub, family, gen, role } = decoded;
  const raw = await redis.get(familyKey(sub, family));
  if (!raw) {
    throw Object.assign(new Error('Refresh family revoked'), { status: 401, code: 'RT_REVOKED' });
  }
  const stored = JSON.parse(raw);

  if (stored.currentGen !== gen) {
    // Check if this is a multi-tab concurrent-rotation race vs actual token theft.
    // A concurrent race looks like: stored.currentGen === gen + 1 AND the last
    // rotation happened within the past 8 seconds. In this case the "winner" tab
    // already rotated; re-issue tokens for the current gen without burning the family.
    const isConcurrentRace =
      stored.currentGen === gen + 1 &&
      stored.rotatedAt &&
      Date.now() - stored.rotatedAt < 8000;

    if (!isConcurrentRace) {
      logger.warn({ sub, family, presentedGen: gen, currentGen: stored.currentGen }, 'RT reuse detected — revoking family');
      await redis.del(familyKey(sub, family));
      throw Object.assign(new Error('Token reuse detected — please log in again'), {
        status: 401,
        code: 'RT_REUSE',
      });
    }

    // Multi-tab race: issue fresh tokens for the already-current gen.
    logger.info({ sub, family, presentedGen: gen, currentGen: stored.currentGen }, 'RT concurrent race resolved — re-issuing for current gen');
    const raceAccessToken = signAccessToken({ sub, role, phone: decoded.phone, email: decoded.email, ...(role === 'worker' ? { sid: family } : {}) });
    const raceTokenId = crypto.randomBytes(16).toString('hex');
    const raceRefreshToken = jwt.sign(
      { sub, role, family, gen: stored.currentGen, jti: raceTokenId, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: RT_EXPIRES_SEC }
    );
    return { accessToken: raceAccessToken, refreshToken: raceRefreshToken, role };
  }

  const newGen = gen + 1;
  const newTokenId = crypto.randomBytes(16).toString('hex');
  const accessToken = signAccessToken({ sub, role, phone: decoded.phone, email: decoded.email, ...(role === 'worker' ? { sid: family } : {}) });
  const refreshToken = jwt.sign(
    { sub, role, family, gen: newGen, jti: newTokenId, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: RT_EXPIRES_SEC }
  );

  await redis.setex(
    familyKey(sub, family),
    RT_EXPIRES_SEC,
    JSON.stringify({ currentGen: newGen, sub, role, rotatedAt: Date.now() })
  );

  return { accessToken, refreshToken, role };
}

/**
 * Explicit logout — revoke the family.
 */
async function revokeRefreshToken(presentedRefreshToken) {
  try {
    const decoded = jwt.verify(presentedRefreshToken, config.jwt.secret);
    await redis.del(familyKey(decoded.sub, decoded.family));
  } catch {
    /* swallow — logout must succeed even with bad tokens */
  }
}

/**
 * "Log out everywhere" — finds & deletes all families for this user.
 */
async function revokeAllForUser(userId) {
  const stream = redis.scanStream({ match: `rt:${userId}:*`, count: 100 });
  const keys = [];
  for await (const batch of stream) keys.push(...batch);
  if (keys.length) await redis.del(...keys);
  return keys.length;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueTokenPair,
  rotateTokenPair,
  revokeRefreshToken,
  revokeAllForUser,
};
