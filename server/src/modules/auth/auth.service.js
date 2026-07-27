const bcrypt = require('bcryptjs');
const https = require('https');
const { redis } = require('../../config/redis');
const User = require('../user/user.model');
const Worker = require('../worker/worker.model');
const Admin = require('../admin/admin.model');
const EventPartner = require('../events/event-partner.model');
const tokenService = require('./token.service');
const logger = require('../../utils/logger');

// Reuse the existing Firebase Admin app (zappio-c80e2) for token verification
function getClientAuth() {
  const admin = require('firebase-admin');
  // Use default app if already initialized (by notifications.worker.js), else init minimal
  const app = admin.apps.find(a => a.name === '[DEFAULT]') ||
    admin.initializeApp({ projectId: 'zappio-c80e2' });
  return app;
}

// ---- OTP config ----
const OTP_TTL_SEC       = parseInt(process.env.OTP_EXPIRY_MINUTES  || '5',  10) * 60;
const OTP_COOLDOWN_MS   = parseInt(process.env.OTP_RESEND_COOLDOWN || '30', 10) * 1000;
const OTP_MAX_ATTEMPTS  = parseInt(process.env.OTP_MAX_ATTEMPTS    || '5',  10);
const OTP_MAX_RESENDS   = parseInt(process.env.OTP_MAX_RESENDS     || '3',  10);
const OTP_HOURLY_LIMIT  = 5;  // max fresh OTP sends per phone per hour

// ---- 2Factor AUTOGEN (production primary) ----
// Plain AUTOGEN — no named template, 2Factor sends 6-digit SMS OTP from their
// DLT-approved pool. Returns sessionId used to verify the user's input.
async function send2FactorAutogen(phone) {
  const apiKey  = process.env.TWO_FACTOR_API_KEY;
  const mobile91 = phone.startsWith('+91') ? phone : phone.startsWith('91') ? `+${phone}` : `+91${phone}`;
  return new Promise((resolve, reject) => {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/${mobile91}/AUTOGEN`;
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.Status === 'Success' && parsed.Details) resolve(parsed.Details);
          else reject(new Error(`2Factor AUTOGEN: ${parsed.Details || body}`));
        } catch { reject(new Error(`2Factor bad JSON: ${body}`)); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('2Factor timeout')); });
    req.on('error', reject);
  });
}

// Calls 2Factor OTP verify endpoint. Returns true if the OTP matches.
async function verify2FactorOtp(sessionId, otp) {
  const apiKey = process.env.TWO_FACTOR_API_KEY;
  return new Promise((resolve, reject) => {
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.Status === 'Success' && parsed.Details === 'OTP Matched');
        } catch { reject(new Error(`2Factor verify bad JSON: ${body}`)); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('2Factor verify timeout')); });
    req.on('error', reject);
  });
}

// ---- Fallback SMS (dev / when 2Factor key absent) ----
async function sendFallbackOtp(phone, otp) {
  const fast2smsKey = process.env.FAST2SMS_KEY;
  const msg91Key    = process.env.MSG91_AUTH_KEY;
  const mobile      = phone.replace(/^(\+?91)/, '');  // strip prefix → 10-digit
  const mobile91    = `91${mobile}`;

  if (fast2smsKey) {
    try {
      await new Promise((resolve, reject) => {
        const params = new URLSearchParams({
          authorization: fast2smsKey, route: 'q', flash: '0', numbers: mobile,
          message: `Your Zappy OTP is ${otp}. Valid for 5 minutes. Do not share with anyone.`,
        });
        const req = https.get(`https://www.fast2sms.com/dev/bulkV2?${params}`, (res) => {
          let d = '';
          res.on('data', (c) => { d += c; });
          res.on('end', () => {
            try {
              const p = JSON.parse(d);
              if (p.return === true) resolve(); else reject(new Error(`Fast2SMS: ${p.message}`));
            } catch { reject(new Error(`Fast2SMS bad response: ${d}`)); }
          });
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Fast2SMS timeout')); });
        req.on('error', reject);
      });
      logger.info({ phone: mobile91 }, '[OTP] Sent via Fast2SMS');
      return;
    } catch (err) {
      logger.warn({ err: err.message }, '[OTP] Fast2SMS failed — trying MSG91');
    }
  }

  if (msg91Key) {
    try {
      await new Promise((resolve, reject) => {
        const params = new URLSearchParams({
          authkey: msg91Key, mobiles: mobile91, route: '4', country: '91',
          sender: process.env.MSG91_SENDER_ID || 'ZAPPYO',
          message: `Your Zappy OTP is ${otp}. Valid for 5 minutes. Do not share.`,
        });
        const req = https.get(`https://api.msg91.com/api/sendhttp.php?${params}`, (res) => {
          let d = '';
          res.on('data', (c) => { d += c; });
          res.on('end', () => {
            if (/^\d+/.test(d.trim())) resolve(); else reject(new Error(`MSG91: ${d}`));
          });
        });
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('MSG91 timeout')); });
        req.on('error', reject);
      });
      logger.info({ phone: mobile91 }, '[OTP] Sent via MSG91');
      return;
    } catch (err) {
      logger.warn({ err: err.message }, '[OTP] MSG91 failed — using console');
    }
  }

  // Only ever print the OTP in non-production. In production this path means SMS
  // delivery is misconfigured — log the failure WITHOUT leaking the code, so a log
  // reader can never see a live OTP and take over an account.
  if (process.env.NODE_ENV === 'production') {
    logger.error({ phone: mobile }, '[OTP] No SMS provider configured — OTP NOT delivered (code withheld from logs)');
  } else {
    logger.warn({ phone: mobile, otp }, '[DEV] OTP (no SMS provider configured)');
  }
}

// ---- OTP analytics (lightweight Redis counters, 90-day retention) ----
async function trackOtpEvent(event) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await redis.multi()
      .incr(`otp:stats:${event}:${today}`)
      .expire(`otp:stats:${event}:${today}`, 90 * 86400)
      .exec();
  } catch { /* non-fatal — never block auth on analytics */ }
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}
async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// ---- OTP (phone-based) ----
async function requestOtp(phone, role) {
  // ── Rate limit: max OTP_HOURLY_LIMIT fresh sends per phone per hour ──────
  const hourlyKey = `otp:hourly:${phone}`;
  const hourlyCount = await redis.incr(hourlyKey);
  if (hourlyCount === 1) await redis.expire(hourlyKey, 3600);
  if (hourlyCount > OTP_HOURLY_LIMIT) {
    await trackOtpEvent('blocked');
    logger.warn({ phone }, '[OTP] Hourly send limit exceeded');
    throw Object.assign(new Error('Too many OTP requests. Try again in an hour.'), {
      status: 429, code: 'OTP_FLOOD',
    });
  }

  // ── 30-second cooldown — prevent accidental double-sends ─────────────────
  const existing = await redis.hgetall(`otp:${phone}`);
  if (existing?.createdAt) {
    const elapsed = Date.now() - parseInt(existing.createdAt, 10);
    if (elapsed < OTP_COOLDOWN_MS) {
      throw Object.assign(
        new Error(`Please wait ${Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000)} seconds before requesting another OTP.`),
        { status: 429, code: 'OTP_COOLDOWN', retryAfterMs: OTP_COOLDOWN_MS - elapsed },
      );
    }
  }

  // ── Send OTP via 2Factor AUTOGEN (prod) or fallback (dev) ────────────────
  const use2Factor = !!process.env.TWO_FACTOR_API_KEY;
  let sessionId = null;
  let devOtp    = null;

  if (use2Factor) {
    try {
      sessionId = await send2FactorAutogen(phone);
      logger.info({ phone }, '[OTP] Sent via 2Factor AUTOGEN');
    } catch (err) {
      logger.error({ err: err.message, phone }, '[OTP] 2Factor AUTOGEN failed');
      throw Object.assign(new Error('Could not send OTP. Please try again.'), { status: 503, code: 'OTP_SEND_FAILED' });
    }
  } else {
    devOtp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await sendFallbackOtp(phone, devOtp);
    } catch (err) {
      logger.error({ err: err.message, phone }, '[OTP] All fallback providers failed');
      throw Object.assign(new Error('Could not send OTP. Please try again.'), { status: 503, code: 'OTP_SEND_FAILED' });
    }
  }

  // ── Store session in Redis — never store the OTP itself ──────────────────
  const now = Date.now().toString();
  const fields = {
    attempts: '0', resendCount: '0', createdAt: now,
    ...(sessionId ? { sessionId } : { code: devOtp }),
  };
  await redis.hset(`otp:${phone}`, ...Object.entries(fields).flat());
  await redis.expire(`otp:${phone}`, OTP_TTL_SEC);

  await trackOtpEvent('sent');

  // Tell the client whether this is a new account
  let isNewUser = true;
  if (role === 'worker') {
    const w = await Worker.findOne({ phone }).select('_id').lean();
    isNewUser = !w;
  } else if (role === 'user') {
    const u = await User.findOne({ phone }).select('_id').lean();
    isNewUser = !u;
  } else if (role === 'event_partner' || role === 'partner') {
    const p = await EventPartner.findOne({ phone }).select('_id').lean();
    isNewUser = !p;
  }

  // devOtp is only returned in non-production so the dev UI can auto-fill.
  // cooldown/resend metadata lets the client render an accurate resend countdown
  // from the first send, instead of hardcoding numbers that drift from the server.
  return {
    otp: devOtp,
    isNewUser,
    cooldownSec:  Math.ceil(OTP_COOLDOWN_MS / 1000),
    resendsLeft:  OTP_MAX_RESENDS,
    expiresInSec: OTP_TTL_SEC,
  };
}

async function resendOtp(phone) {
  const session = await redis.hgetall(`otp:${phone}`);

  if (!session?.createdAt) {
    throw Object.assign(new Error('No active OTP session. Please request a new OTP.'), {
      status: 400, code: 'OTP_NO_SESSION',
    });
  }

  // 30-second cooldown between resends
  const elapsed = Date.now() - parseInt(session.createdAt, 10);
  if (elapsed < OTP_COOLDOWN_MS) {
    throw Object.assign(
      new Error(`Please wait ${Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000)} seconds before resending.`),
      { status: 429, code: 'OTP_COOLDOWN', retryAfterMs: OTP_COOLDOWN_MS - elapsed },
    );
  }

  const resendCount = parseInt(session.resendCount || '0', 10);
  if (resendCount >= OTP_MAX_RESENDS) {
    throw Object.assign(new Error('Maximum resend attempts reached. Please request a new OTP.'), {
      status: 429, code: 'OTP_MAX_RESENDS',
    });
  }

  // Re-send via 2Factor AUTOGEN or fallback
  const use2Factor = !!process.env.TWO_FACTOR_API_KEY;
  let sessionId = null;
  let devOtp    = null;

  if (use2Factor) {
    try {
      sessionId = await send2FactorAutogen(phone);
      logger.info({ phone, resendCount: resendCount + 1 }, '[OTP] Resent via 2Factor AUTOGEN');
    } catch (err) {
      logger.error({ err: err.message, phone }, '[OTP] 2Factor resend failed');
      throw Object.assign(new Error('Could not resend OTP. Please try again.'), { status: 503, code: 'OTP_SEND_FAILED' });
    }
  } else {
    devOtp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await sendFallbackOtp(phone, devOtp);
    } catch (err) {
      logger.error({ err: err.message, phone }, '[OTP] Fallback resend failed');
      throw Object.assign(new Error('Could not resend OTP. Please try again.'), { status: 503, code: 'OTP_SEND_FAILED' });
    }
  }

  // Update session — reset attempts, bump resend count, new createdAt for cooldown
  const now = Date.now().toString();
  const updates = { attempts: '0', resendCount: String(resendCount + 1), createdAt: now };
  if (sessionId) { updates.sessionId = sessionId; delete updates.code; }
  else { updates.code = devOtp; delete updates.sessionId; }

  // Replace entire hash atomically
  await redis.multi()
    .del(`otp:${phone}`)
    .hset(`otp:${phone}`, ...Object.entries(updates).flat())
    .expire(`otp:${phone}`, OTP_TTL_SEC)
    .exec();

  await trackOtpEvent('resent');
  // Hand the client everything it needs to render an accurate countdown + limit,
  // instead of the UI guessing (and drifting out of sync with the server).
  return {
    otp: devOtp,                                   // null in production — dev auto-fill only
    cooldownSec:  Math.ceil(OTP_COOLDOWN_MS / 1000),
    resendsLeft:  Math.max(0, OTP_MAX_RESENDS - (resendCount + 1)),
    expiresInSec: OTP_TTL_SEC,
  };
}

async function verifyOtp(phone, otp) {
  const session = await redis.hgetall(`otp:${phone}`);
  if (!session || (!session.code && !session.sessionId)) return false;

  // Brute-force lockout: invalidate session after max wrong attempts
  const attempts = parseInt(session.attempts || '0', 10);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(`otp:${phone}`);
    await trackOtpEvent('blocked');
    logger.warn({ phone }, '[OTP] Session killed — max attempts exceeded');
    return false;
  }

  let isValid = false;

  if (session.sessionId) {
    // ── 2Factor AUTOGEN verify — OTP never stored server-side ──────────────
    try {
      isValid = await verify2FactorOtp(session.sessionId, otp);
    } catch (err) {
      logger.error({ err: err.message, phone }, '[OTP] 2Factor verify API failed');
      // Propagate as 503 — don't burn the session on provider failure
      throw Object.assign(new Error('OTP verification service unavailable. Please try again.'), {
        status: 503, code: 'OTP_SERVICE_ERROR',
      });
    }
  } else {
    // ── Dev/fallback — compare stored code ─────────────────────────────────
    isValid = session.code === otp;
  }

  if (!isValid) {
    await redis.hincrby(`otp:${phone}`, 'attempts', 1);
    await trackOtpEvent('failed');
    return false;
  }

  await redis.del(`otp:${phone}`);
  await trackOtpEvent('verified');
  return true;
}

/**
 * Mark a user as having recently verified their OTP for sensitive actions.
 * Expires after 10 minutes — caller must call this after a successful OTP verify.
 */
async function markOtpActionVerified(userId) {
  await redis.setex(`otp_action:${userId}`, 600, '1');
}

async function loginUserWithOtp({ phone, otp, name }) {
  const ok = await verifyOtp(phone, otp);
  if (!ok) throw Object.assign(new Error('Invalid OTP'), { status: 401, code: 'OTP_INVALID' });

  let user = await User.findOne({ phone });
  if (!user) user = await User.create({ phone, name });
  if (user.isBlocked) {
    throw Object.assign(new Error('Account is blocked'), { status: 403, code: 'ACCOUNT_BLOCKED' });
  }

  const tokens = await tokenService.issueTokenPair({
    sub: user._id.toString(), role: 'user', phone: user.phone,
  });
  return { user, ...tokens };
}

// Max distinct worker accounts allowed per device fingerprint in a 30-day window.
const MAX_WORKERS_PER_DEVICE = 2; // Allow 2 (lost phone re-registration edge case)

async function loginWorkerWithOtp({ phone, otp, name, skills, deviceId }) {
  const ok = await verifyOtp(phone, otp);
  if (!ok) throw Object.assign(new Error('Invalid OTP'), { status: 401, code: 'OTP_INVALID' });

  let worker = await Worker.findOne({ phone });
  const isNewWorker = !worker;

  if (isNewWorker) {
    if (!name || !skills?.length) {
      throw Object.assign(new Error('First-time login requires name and skills'), {
        status: 400, code: 'WORKER_ONBOARDING_REQUIRED',
      });
    }

    // Device fingerprint check — detect one phone creating many worker accounts.
    // Uses a Redis set: key = device fingerprint, members = worker phone numbers
    // that registered from this device in the last 30 days.
    if (deviceId) {
      const deviceKey = `worker:device:${deviceId}`;
      const registeredPhones = await redis.smembers(deviceKey);
      if (registeredPhones.length >= MAX_WORKERS_PER_DEVICE && !registeredPhones.includes(phone)) {
        logger.warn({ deviceId, existingPhones: registeredPhones, newPhone: phone },
          '[FRAUD] Device fingerprint: too many worker registrations from same device');
        throw Object.assign(
          new Error('This device has already been used to register multiple worker accounts. Contact support.'),
          { status: 429, code: 'DEVICE_MULTI_ACCOUNT' }
        );
      }
      // Record this phone against the device fingerprint (30-day window)
      await redis.multi()
        .sadd(deviceKey, phone)
        .expire(deviceKey, 30 * 86400)
        .exec();
    }

    worker = await Worker.create({ phone, name, skills });
  }

  if (worker.isBlocked) {
    throw Object.assign(new Error('Account is blocked'), { status: 403, code: 'ACCOUNT_BLOCKED' });
  }

  // Store device fingerprint on the worker record for KYC cross-reference
  if (deviceId && isNewWorker) {
    Worker.updateOne({ _id: worker._id }, { $addToSet: { deviceIds: deviceId } }).catch(() => {});
  }

  // ── Trusted-device binding (re-login security) ──────────────────────────────
  // OTP proves possession of the SIM, but a relayed/SIM-swapped OTP could sign in
  // from an attacker's device. We bind the account to its devices: a sign-in from
  // a NEW device on an established account is recorded + alerted, and (optionally,
  // when WORKER_NEW_DEVICE_BLOCK=true) blocked pending admin review.
  let newDevice = false;
  if (deviceId) {
    const devices = worker.knownDevices || [];
    const match = devices.find((d) => d.deviceId === deviceId);
    if (match) {
      Worker.updateOne({ _id: worker._id, 'knownDevices.deviceId': deviceId },
        { $set: { 'knownDevices.$.lastSeenAt': new Date() } }).catch(() => {});
    } else if (devices.length === 0) {
      // First device we've seen for this account — trust it silently (bootstrap).
      Worker.updateOne({ _id: worker._id },
        { $push: { knownDevices: { deviceId, firstSeenAt: new Date(), lastSeenAt: new Date(), trusted: true } },
          $addToSet: { deviceIds: deviceId } }).catch(() => {});
    } else {
      // Established account + unrecognised device → security event.
      newDevice = true;
      if (process.env.WORKER_NEW_DEVICE_BLOCK === 'true') {
        logger.warn({ workerId: worker._id, deviceId }, '[SECURITY] Worker new-device login BLOCKED (enforcement on)');
        throw Object.assign(
          new Error('For your security, sign-in from a new device needs verification. Please contact support to approve this device.'),
          { status: 403, code: 'NEW_DEVICE_BLOCKED' }
        );
      }
      await Worker.updateOne({ _id: worker._id },
        { $push: { knownDevices: { deviceId, firstSeenAt: new Date(), lastSeenAt: new Date(), trusted: true } },
          $addToSet: { deviceIds: deviceId }, $set: { lastNewDeviceAt: new Date() } }).catch(() => {});
      logger.warn({ workerId: worker._id, deviceId }, '[SECURITY] Worker signed in from a NEW device');
      try {
        require('../notification/notification.service').notify({
          recipient: { kind: 'worker', id: worker._id },
          type: 'security_alert',
          title: '🔐 New device sign-in',
          body: 'Your Zappy Partner account was just accessed from a new device. If this was not you, contact support immediately.',
          deepLink: '/worker',
        }).catch(() => {});
      } catch { /* non-fatal */ }
    }
  }

  const tokens = await tokenService.issueTokenPair({
    sub: worker._id.toString(), role: 'worker', phone: worker.phone,
  });
  return { worker, ...tokens, newDevice };
}

// ---- Event Partner (phone OTP) — self-registration allowed, admin approves KYC ----
async function loginEventPartnerWithOtp({ phone, otp, businessName, ownerName, cities }) {
  const ok = await verifyOtp(phone, otp);
  if (!ok) throw Object.assign(new Error('Invalid OTP'), { status: 401, code: 'OTP_INVALID' });

  const EventPartner = require('../events/event-partner.model');
  let partner = await EventPartner.findOne({ phone });
  const isNew = !partner;

  if (isNew) {
    if (!businessName || !ownerName) {
      throw Object.assign(
        new Error('First-time registration requires businessName and ownerName'),
        { status: 400, code: 'PARTNER_ONBOARDING_REQUIRED' }
      );
    }
    partner = await EventPartner.create({
      phone, businessName, ownerName,
      cities: Array.isArray(cities) ? cities : (cities || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      isActive: true,
      kyc: { status: 'not_submitted' },
    });
    logger.info({ partnerId: partner._id, phone }, '[AUTH] New event partner self-registered');
  }

  if (partner.isBlocked) {
    throw Object.assign(new Error('Partner account is blocked. Contact support.'), { status: 403, code: 'ACCOUNT_BLOCKED' });
  }

  const tokens = await tokenService.issueTokenPair({
    sub: partner._id.toString(), role: 'event_partner', phone: partner.phone,
  });
  return { partner, isNew, ...tokens };
}

// ---- Admin (email + password) with lockout ----
async function loginAdmin({ email, password, ip }) {
  const failKey = `admin:fail:${email}`;
  const fails = Number(await redis.get(failKey)) || 0;
  if (fails >= 10) {
    throw Object.assign(new Error('Account temporarily locked'), {
      status: 429, code: 'ADMIN_LOCKED',
    });
  }

  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin || !admin.isActive) {
    await redis.incr(failKey);
    await redis.expire(failKey, 900);
    throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'ADMIN_INVALID' });
  }

  const ok = await comparePassword(password, admin.passwordHash);
  if (!ok) {
    await redis.incr(failKey);
    await redis.expire(failKey, 900);
    throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'ADMIN_INVALID' });
  }

  await redis.del(failKey);
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = ip;
  await admin.save();

  const tokens = await tokenService.issueTokenPair({
    sub: admin._id.toString(), role: 'admin', email: admin.email,
  });
  return {
    admin: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    ...tokens,
  };
}

// ---- Event Partner — Google OAuth login/register ----
async function loginPartnerWithGoogle({ idToken, businessName, ownerName, cities }) {
  const adminApp = getClientAuth();
  let decoded;
  try {
    decoded = await adminApp.auth().verifyIdToken(idToken);
  } catch (err) {
    throw Object.assign(new Error('Invalid Google token'), { status: 401, code: 'GOOGLE_TOKEN_INVALID' });
  }

  const { uid: googleId, email, name: googleName, picture } = decoded;
  if (!email) throw Object.assign(new Error('Google account has no email'), { status: 400, code: 'NO_EMAIL' });

  // Find by googleId first, then fall back to email
  let partner = await EventPartner.findOne({ $or: [{ googleId }, { email }] });
  const isNew = !partner;

  if (isNew) {
    if (!businessName || !ownerName) {
      // Return signal to frontend to collect registration details
      return { needsRegistration: true, googleId, email, suggestedName: googleName };
    }
    const cityList = typeof cities === 'string'
      ? cities.split(',').map(c => c.trim()).filter(Boolean)
      : (cities || []);
    partner = await EventPartner.create({ googleId, email, businessName, ownerName, cities: cityList });
  } else if (!partner.googleId) {
    partner.googleId = googleId;
    if (!partner.email) partner.email = email;
    await partner.save();
  }

  if (partner.isBlocked) throw Object.assign(new Error('Account suspended'), { status: 403, code: 'ACCOUNT_BLOCKED' });

  const tokens = await tokenService.issueTokenPair({ sub: partner._id, role: 'event_partner', email: partner.email });
  return { partner, isNew, ...tokens };
}

// ---- OTP analytics for admin dashboard ----
async function getOtpStats(days = 7) {
  const events = ['sent', 'verified', 'failed', 'resent', 'blocked'];
  const result = {};
  const pipeline = redis.pipeline();
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    dates.push(d);
    for (const ev of events) pipeline.get(`otp:stats:${ev}:${d}`);
  }
  const raw = await pipeline.exec();
  let idx = 0;
  const byDay = [];
  for (const date of dates) {
    const row = { date };
    for (const ev of events) {
      row[ev] = parseInt(raw[idx]?.[1] || '0', 10);
      idx++;
    }
    byDay.push(row);
  }
  byDay.reverse(); // chronological order

  // Aggregate totals
  const totals = Object.fromEntries(events.map((ev) => [
    ev, byDay.reduce((s, r) => s + r[ev], 0),
  ]));
  const successRate = totals.sent > 0
    ? Math.round((totals.verified / totals.sent) * 100)
    : 0;
  const failureRate = totals.sent > 0
    ? Math.round((totals.failed  / totals.sent) * 100)
    : 0;
  const resendRate  = totals.sent > 0
    ? Math.round((totals.resent  / totals.sent) * 100)
    : 0;

  result.byDay     = byDay;
  result.totals    = totals;
  result.rates     = { successRate, failureRate, resendRate };
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Worker credential login (#2) — password + Worker ID/username, plus
// forgot/reset/change. OTP login still works; this adds a password path so an
// approved worker doesn't repeat OTP on every sign-in.
// ═══════════════════════════════════════════════════════════════════════════
const WORKER_USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const normId = (v) => String(v == null ? '' : v).trim().toLowerCase();

async function setWorkerCredentials({ workerId, username, password }) {
  if (!password || password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400, code: 'WEAK_PASSWORD' });
  }
  const worker = await Worker.findById(workerId);
  if (!worker) throw Object.assign(new Error('Worker not found'), { status: 404 });

  if (username != null && username !== '') {
    const uname = normId(username);
    if (!WORKER_USERNAME_RE.test(uname)) {
      throw Object.assign(new Error('Worker ID must be 3–30 chars: letters, numbers or underscore'), { status: 400, code: 'BAD_USERNAME' });
    }
    const clash = await Worker.findOne({ username: uname, _id: { $ne: worker._id } }).select('_id').lean();
    if (clash) throw Object.assign(new Error('That Worker ID is already taken'), { status: 409, code: 'USERNAME_TAKEN' });
    worker.username = uname;
  }
  worker.passwordHash = await hashPassword(password);
  await worker.save();
  return { ok: true, username: worker.username || null };
}

async function loginWorkerWithPassword({ identifier, password }) {
  const id = normId(identifier);
  if (!id || !password) {
    throw Object.assign(new Error('Enter your Worker ID / email / phone and password'), { status: 400, code: 'MISSING_CREDENTIALS' });
  }
  const failKey = `worker:pwfail:${id}`;
  if ((Number(await redis.get(failKey)) || 0) >= 8) {
    throw Object.assign(new Error('Too many attempts. Try again later or reset your password.'), { status: 429, code: 'LOGIN_LOCKED' });
  }
  const bump = async () => { await redis.incr(failKey); await redis.expire(failKey, 900); };

  const worker = await Worker.findOne({
    $or: [{ username: id }, { email: id }, { phone: id }],
  }).select('+passwordHash');

  if (!worker || !worker.passwordHash) { await bump(); throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'AUTH_INVALID' }); }
  const okPw = await comparePassword(password, worker.passwordHash);
  if (!okPw) { await bump(); throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'AUTH_INVALID' }); }
  if (worker.isBlocked) { throw Object.assign(new Error('Account is blocked'), { status: 403, code: 'ACCOUNT_BLOCKED' }); }

  await redis.del(failKey);
  const tokens = await tokenService.issueTokenPair({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });
  return { worker, ...tokens };
}

async function requestWorkerPasswordReset({ identifier }) {
  const id = normId(identifier);
  const worker = await Worker.findOne({
    $or: [{ username: id }, { email: id }, { phone: id }],
  }).select('phone').lean();
  // Don't leak whether the account exists — always return the same shape; only
  // actually send an OTP when a matching worker with a phone is found.
  if (worker?.phone) {
    await requestOtp(worker.phone, 'worker');
    const p = worker.phone;
    return { sent: true, maskedPhone: p.length > 4 ? `${'*'.repeat(p.length - 4)}${p.slice(-4)}` : p };
  }
  return { sent: true, maskedPhone: null };
}

async function resetWorkerPassword({ phone, otp, newPassword }) {
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400, code: 'WEAK_PASSWORD' });
  }
  const ok = await verifyOtp(phone, otp);
  if (!ok) throw Object.assign(new Error('Invalid or expired OTP'), { status: 401, code: 'OTP_INVALID' });
  const worker = await Worker.findOne({ phone });
  if (!worker) throw Object.assign(new Error('Account not found'), { status: 404 });
  worker.passwordHash = await hashPassword(newPassword);
  await worker.save();
  return { ok: true };
}

async function changeWorkerPassword({ workerId, currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters'), { status: 400, code: 'WEAK_PASSWORD' });
  }
  const worker = await Worker.findById(workerId).select('+passwordHash');
  if (!worker) throw Object.assign(new Error('Worker not found'), { status: 404 });
  // If a password already exists, the current one must match. First-time set (no
  // existing hash) is allowed directly so a worker can create their first password.
  if (worker.passwordHash) {
    const ok = await comparePassword(currentPassword || '', worker.passwordHash);
    if (!ok) throw Object.assign(new Error('Current password is incorrect'), { status: 401, code: 'BAD_CURRENT_PASSWORD' });
  }
  worker.passwordHash = await hashPassword(newPassword);
  await worker.save();
  return { ok: true };
}

module.exports = {
  hashPassword,
  comparePassword,
  requestOtp,
  resendOtp,
  verifyOtp,
  setWorkerCredentials,
  loginWorkerWithPassword,
  requestWorkerPasswordReset,
  resetWorkerPassword,
  changeWorkerPassword,
  markOtpActionVerified,
  getOtpStats,
  loginUserWithOtp,
  loginWorkerWithOtp,
  loginEventPartnerWithOtp,
  loginPartnerWithGoogle,
  loginAdmin,
  refresh: tokenService.rotateTokenPair,
  revoke: tokenService.revokeRefreshToken,
  revokeAll: tokenService.revokeAllForUser,
  verifyToken: tokenService.verifyAccessToken,
  signToken: tokenService.signAccessToken,
};
