const { verifyToken } = require('../modules/auth/auth.service');
const { redis }       = require('../config/redis');
const logger          = require('../core/logger');

// Redis cache TTL for ban status — 60s means a ban takes effect within 1 minute
// across all active sessions without a DB hit on every request.
const BAN_CACHE_TTL = 60;

/**
 * Call this whenever isBlocked changes (ban or unban) to immediately invalidate
 * the cache so the next request reflects the new status within one request cycle.
 */
async function invalidateBanCache(role, sub) {
  try { await redis.del(`ban:${role}:${sub}`); } catch {}
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  let auth;
  try {
    auth = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.auth = auth;

  const { sub, role } = auth;

  // Single-device enforcement (workers)
  // A worker may only be signed in on ONE device. Login records the active
  // session id (`wsid:<id>`) and stamps it into the access token. If this token's
  // sid isn't the active one, the account was opened on another device → reject.
  if (role === 'worker' && auth.sid) {
    try {
      const activeSid = await redis.get(`wsid:${sub}`);
      if (activeSid && activeSid !== auth.sid) {
        return res.status(401).json({ error: 'Signed in on another device', code: 'SESSION_REPLACED' });
      }
    } catch (err) {
      // Redis hiccup — fail open (don't lock out a legit worker on infra blips).
      logger.warn({ err: err.message, sub }, 'Single-device check failed — allowing through');
    }
  }

  // Ban check — Redis-cached 60s, DB fallback
  if (role === 'worker' || role === 'user') {
    try {
      const cacheKey = `ban:${role}:${sub}`;
      let banned = await redis.get(cacheKey);

      if (banned === null) {
        // Not cached — hit DB and cache result
        let isBlocked = false;
        if (role === 'worker') {
          const Worker = require('../modules/worker/worker.model');
          const w = await Worker.findById(sub).select('isBlocked').lean();
          isBlocked = w?.isBlocked ?? false;
        } else {
          const User = require('../modules/user/user.model');
          const u = await User.findById(sub).select('isBlocked').lean();
          isBlocked = u?.isBlocked ?? false;
        }
        banned = isBlocked ? '1' : '0';
        await redis.setex(cacheKey, BAN_CACHE_TTL, banned);
      }

      if (banned === '1') {
        return res.status(403).json({ error: 'Account suspended', code: 'ACCOUNT_BLOCKED' });
      }
    } catch (err) {
      // Ban check failure is non-fatal — allow through but log it
      logger.warn({ err: err.message, sub, role }, 'Ban cache check failed — allowing request through');
    }
  }

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * Require a recent OTP verification (within 10 minutes) for sensitive actions.
 * Set by /auth/otp/verify-action after the user re-confirms their OTP.
 * Protects: payout requests, bank account changes, phone number changes.
 */
async function requireRecentOtp(req, res, next) {
  const { sub } = req.auth || {};
  if (!sub) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const ok = await redis.get(`otp_action:${sub}`);
    if (!ok) {
      return res.status(403).json({
        error: 'Please re-verify your OTP to continue',
        code: 'OTP_REQUIRED',
      });
    }
  } catch {
    // Redis failure — allow through (don't block users for infra issues)
  }
  next();
}

module.exports = { authenticate, requireRole, requireRecentOtp, invalidateBanCache };
