const crypto = require('crypto');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');
const mailer = require('../../core/mail/mailer');
const templates = require('../../core/mail/templates');

/**
 * Passwords, verified email and first-time setup for every account type.
 *
 * Why it exists: an OTP costs money on every sign-in. After the first OTP
 * sign-up, everyone sets a password; later sign-ins use phone/email +
 * password, and a forgotten password is reset by a free email link when the
 * email is verified (SMS only as the fallback).
 *
 *   role            account                       setup needs
 *   user            customer                      name + password (email optional)
 *   worker          independent / shop technician password + email
 *   shop            shop owner                    password + email
 *   event_partner   events partner                password + email
 */
const ROLES = {
  user: { model: () => require('../user/user.model'), nameOf: (a) => a.name, emailRequired: false, nameRequired: true },
  worker: { model: () => require('../worker/worker.model'), nameOf: (a) => a.name, emailRequired: true },
  shop: { model: () => require('../shop/shop.model'), nameOf: (a) => a.ownerName || a.businessName, emailRequired: true },
  event_partner: { model: () => require('../events/event-partner.model'), nameOf: (a) => a.ownerName || a.businessName, emailRequired: true },
};

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 30 * 60_000;

function roleCfg(role) {
  const cfg = ROLES[role];
  if (!cfg) throw err(400, 'BAD_ROLE', 'Unknown account type');
  return cfg;
}

/** 10 digits from anything a person might type: "+91 98765 43210", "098765...". */
function phoneVariants(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? [d, `+91${d}`, `91${d}`] : [];
}

function mask(email) {
  const [u, dom] = String(email || '').split('@');
  if (!dom) return null;
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${dom}`;
}

/** Password rules people can follow: 8+ characters, a letter and a number, not the phone number. */
function checkPassword(pw, account) {
  if (typeof pw !== 'string' || pw.length < 8) throw err(400, 'WEAK_PASSWORD', 'Use at least 8 characters');
  if (pw.length > 72) throw err(400, 'WEAK_PASSWORD', 'Use 72 characters or fewer');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw err(400, 'WEAK_PASSWORD', 'Use at least one letter and one number');
  const digits = String(account?.phone || '').replace(/\D/g, '').slice(-10);
  if (digits && pw.includes(digits)) throw err(400, 'WEAK_PASSWORD', 'Do not use your phone number in your password');
}

const bcrypt = require('bcryptjs');
const hashPassword = (pw) => bcrypt.hash(pw, 12);
const comparePassword = (pw, hash) => bcrypt.compare(pw, hash);

/**
 * Where each account type keeps its photo. Workers and partners already had
 * one; a shop's picture is its cover photo; customers use avatarKey. A worker
 * with no photo of their own shows their verified ID selfie.
 */
const PHOTO_FIELD = { user: 'avatarKey', worker: 'profilePhotoKey', shop: 'coverImageUrl', event_partner: 'profilePhotoKey' };
const photoKeyOf = (role, a) => a[PHOTO_FIELD[role]] || (role === 'worker' ? a.kyc?.selfieUrl : null) || null;

/** What a signed-in account still has to do; the single rule every app reads. */
function setupStatus(role, a) {
  const cfg = roleCfg(role);
  const name = (cfg.nameOf(a) || '').trim();
  // Until outgoing mail is set up, nobody is asked for an email we cannot confirm.
  const mailConfigured = mailer.isConfigured();
  const emailRequired = !!cfg.emailRequired && mailConfigured;
  const needs = {
    name: !!cfg.nameRequired && name.length < 2,
    password: !a.passwordHash,
    email: emailRequired && !a.email && !a.emailVerification?.email,
  };
  return {
    role,
    name,
    phone: a.phone || null,
    email: a.email || null,
    emailVerified: !!a.emailVerified,
    pendingEmail: a.emailVerification?.email && a.emailVerification.email !== a.email ? a.emailVerification.email : null,
    emailRequired,
    hasPassword: !!a.passwordHash,
    passwordSetAt: a.passwordSetAt || null,
    needs,
    needsSetup: Object.values(needs).some(Boolean),
    mailConfigured,
    hasPhoto: !!photoKeyOf(role, a),
    // Asked once, for new and existing accounts alike; skipping is remembered.
    askPhoto: !photoKeyOf(role, a) && !a.photoPromptSeenAt,
    lastSeenRelease: a.lastSeenRelease || null,
    joinedAt: a.createdAt || null,
  };
}

async function load(role, id, extra = '') {
  const a = await roleCfg(role).model().findById(id).select(`+passwordHash +emailVerification ${extra}`.trim());
  if (!a) throw err(404, 'NOT_FOUND', 'Account not found');
  return a;
}

async function getStatus(role, id) {
  const a = await load(role, id);
  const status = setupStatus(role, a);
  const key = photoKeyOf(role, a);
  status.photoUrl = key ? await require('../../core/storage/s3').signMedia(key).catch(() => null) : null;
  return status;
}

/**
 * A new profile photo. Only a key this account just uploaded (its own id in
 * the path, a photo folder) is accepted, so nobody can point their profile at
 * someone else's file.
 */
async function setPhoto({ role, id, key }) {
  const k = String(key || '');
  const ok = new RegExp(`^(profile|shop|event-photos)/${String(id)}/[A-Za-z0-9-]+([.][a-z0-9]+)?$`).test(k);
  if (!ok) throw err(400, 'BAD_PHOTO', 'Upload the photo again and then save.');
  const a = await load(role, id);
  a[PHOTO_FIELD[role]] = k;
  a.photoPromptSeenAt = a.photoPromptSeenAt || new Date();
  await a.save();
  return getStatus(role, id);
}

/** "Skip for now" on the photo prompt: not asked again. */
async function skipPhoto({ role, id }) {
  await roleCfg(role).model().updateOne({ _id: id }, { $set: { photoPromptSeenAt: new Date() } });
  return getStatus(role, id);
}

/** The person has seen this update's "What's new". */
async function markReleaseSeen({ role, id, release }) {
  await roleCfg(role).model().updateOne({ _id: id }, { $set: { lastSeenRelease: String(release).slice(0, 40) } });
  return { ok: true };
}

async function notifyPasswordChanged(role, a) {
  if (!a.email || !a.emailVerified) return;
  const t = templates.passwordChanged({ name: roleCfg(role).nameOf(a) });
  mailer.sendMail({ to: a.email, ...t }).catch(() => {});
}

/** First password: no current one needed. Changing it: the current one must match. */
async function setPassword({ role, id, currentPassword, newPassword }) {
  const a = await load(role, id);
  if (a.passwordHash) {
    const ok = await comparePassword(currentPassword || '', a.passwordHash);
    if (!ok) throw err(401, 'BAD_CURRENT_PASSWORD', 'Your current password is not right');
  }
  checkPassword(newPassword, a);
  const first = !a.passwordHash;
  a.passwordHash = await hashPassword(newPassword);
  a.passwordSetAt = new Date();
  await a.save();
  if (!first) await notifyPasswordChanged(role, a);
  return setupStatus(role, a);
}

/** Name for a customer during setup (providers name themselves at registration). */
async function setName({ role, id, name }) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 60) throw err(400, 'BAD_NAME', 'Enter your name (2 to 60 letters)');
  const a = await load(role, id);
  if (role === 'user' || role === 'worker') a.name = clean; else a.ownerName = clean;
  await a.save();
  return setupStatus(role, a);
}

/**
 * Start (or restart) email verification. The address is held as pending until
 * its link is opened, so typing someone else's address grants nothing.
 */
async function startEmailVerification({ role, id, email, baseUrl }) {
  const addr = String(email || '').trim().toLowerCase();
  if (!mailer.isConfigured()) throw err(409, 'EMAIL_UNAVAILABLE', 'Adding an email is not available yet. Your phone number keeps your account secure.');
  if (!EMAIL_RE.test(addr) || addr.length > 120) throw err(400, 'BAD_EMAIL', 'Enter a valid email address');
  const Model = roleCfg(role).model();
  const a = await load(role, id);
  if (a.email === addr && a.emailVerified) return setupStatus(role, a);

  const taken = await Model.exists({ email: addr, emailVerified: true, _id: { $ne: a._id } });
  if (taken) throw err(409, 'EMAIL_TAKEN', 'That email is already used by another account');

  const limitKey = `acct:mailsend:${role}:${a._id}`;
  const sends = await redis.incr(limitKey);
  if (sends === 1) await redis.expire(limitKey, 3600);
  if (sends > 5) throw err(429, 'TOO_MANY_EMAILS', 'Too many emails sent. Try again in an hour.');

  const token = newToken();
  a.emailVerification = { email: addr, tokenHash: sha(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS), sentAt: new Date() };
  // An account with no email yet shows the pending one, unverified.
  if (!a.email) { a.email = addr; a.emailVerified = false; }
  await a.save();

  const link = `${baseUrl}/verify-email?token=${token}&r=${role}`;
  const t = templates.verifyEmail({ name: roleCfg(role).nameOf(a), link });
  const sent = await mailer.sendMail({ to: addr, ...t });
  if (!sent.sent) logger.info({ role, id: String(a._id), link }, '[ACCOUNT] verification link (mail not sent)');
  return { ...setupStatus(role, a), emailSent: sent.sent };
}

async function confirmEmail({ role, token }) {
  const Model = roleCfg(role).model();
  const a = await Model.findOne({ 'emailVerification.tokenHash': sha(token || '') }).select('+emailVerification');
  if (!a || !a.emailVerification?.expiresAt || a.emailVerification.expiresAt < new Date()) {
    throw err(400, 'LINK_EXPIRED', 'This link has expired or was already used. Send a new one from your account.');
  }
  const addr = a.emailVerification.email;
  const taken = await Model.exists({ email: addr, emailVerified: true, _id: { $ne: a._id } });
  if (taken) throw err(409, 'EMAIL_TAKEN', 'That email is already used by another account');
  a.email = addr;
  a.emailVerified = true;
  a.emailVerifiedAt = new Date();
  a.emailVerification = undefined;
  await a.save();
  return { ok: true, email: addr, role };
}

/** Find an account by phone, verified email, or (workers) their worker ID. */
async function findByIdentifier(role, identifier, select = '') {
  const Model = roleCfg(role).model();
  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return null;
  const or = [];
  if (id.includes('@')) or.push({ email: id, emailVerified: true });
  const phones = phoneVariants(id);
  if (phones.length) or.push({ phone: { $in: phones } });
  if (role === 'worker' && /^[a-z0-9_]{3,30}$/.test(id)) or.push({ username: id });
  if (!or.length) return null;
  return Model.findOne({ $or: or }).select(select);
}

/** Password sign-in, with a lock after repeated failures. Returns the account; the caller issues tokens. */
async function loginWithPassword({ role, identifier, password }) {
  roleCfg(role);
  const failKey = `acct:pwfail:${role}:${String(identifier || '').trim().toLowerCase()}`;
  if ((Number(await redis.get(failKey)) || 0) >= 8) {
    throw err(429, 'LOGIN_LOCKED', 'Too many tries. Wait 15 minutes or reset your password.');
  }
  const fail = async () => {
    const n = await redis.incr(failKey);
    if (n === 1) await redis.expire(failKey, 900);
    throw err(401, 'AUTH_INVALID', 'That phone/email and password do not match');
  };
  if (!identifier || !password) throw err(400, 'MISSING_CREDENTIALS', 'Enter your phone or email and your password');
  const a = await findByIdentifier(role, identifier, '+passwordHash');
  if (!a || !a.passwordHash) return fail();
  if (!(await comparePassword(password, a.passwordHash))) return fail();
  if (a.isBlocked) throw err(403, 'ACCOUNT_BLOCKED', 'This account is blocked. Contact support.');
  await redis.del(failKey);
  return a;
}

/**
 * Forgotten password. A verified email gets a free one-time link; otherwise an
 * OTP goes to the phone. The answer looks the same whether or not the account
 * exists, so this cannot be used to find out who is registered.
 */
async function requestPasswordReset({ role, identifier, baseUrl }) {
  const a = await findByIdentifier(role, identifier, '+passwordReset');
  if (!a) return { sent: true, channel: 'email', to: null };
  // Email first (free); if mail is not set up or the send fails, the phone code is the backup.
  if (a.email && a.emailVerified && mailer.isConfigured()) {
    const token = newToken();
    a.passwordReset = { tokenHash: sha(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) };
    await a.save();
    const link = `${baseUrl}/reset-password?token=${token}&r=${role}`;
    const sent = await mailer.sendMail({ to: a.email, ...templates.passwordReset({ name: roleCfg(role).nameOf(a), link }) });
    if (sent.sent) return { sent: true, channel: 'email', to: mask(a.email) };
    logger.warn({ role, reason: sent.reason }, '[ACCOUNT] reset email not sent; falling back to SMS');
  }
  if (a.phone) {
    await require('../auth/auth.service').requestOtp(a.phone, role);
    return { sent: true, channel: 'sms', to: `******${String(a.phone).slice(-4)}` };
  }
  return { sent: true, channel: 'email', to: null };
}

async function finishReset(role, a, newPassword) {
  checkPassword(newPassword, a);
  a.passwordHash = await hashPassword(newPassword);
  a.passwordSetAt = new Date();
  a.passwordReset = undefined;
  await a.save();
  // A reset means someone may have had the old password: sign every device out.
  await require('../auth/token.service').revokeAllForUser(String(a._id)).catch(() => {});
  await notifyPasswordChanged(role, a);
  return { ok: true };
}

async function resetWithToken({ role, token, newPassword }) {
  const a = await roleCfg(role).model().findOne({ 'passwordReset.tokenHash': sha(token || '') }).select('+passwordReset +passwordHash');
  if (!a || !a.passwordReset?.expiresAt || a.passwordReset.expiresAt < new Date()) {
    throw err(400, 'LINK_EXPIRED', 'This reset link has expired or was already used. Ask for a new one.');
  }
  return finishReset(role, a, newPassword);
}

/** The person types the same phone/email as when asking; the number is looked up here, never sent to the browser. */
async function resetWithOtp({ role, identifier, otp, newPassword }) {
  const a = await findByIdentifier(role, identifier, '+passwordHash');
  const ok = a?.phone ? await require('../auth/auth.service').verifyOtp(a.phone, otp) : false;
  if (!ok) throw err(401, 'OTP_INVALID', 'That code is wrong or has expired');
  return finishReset(role, a, newPassword);
}

/** Mark setup done once nothing is missing; harmless to call repeatedly. */
async function completeSetup({ role, id }) {
  const a = await load(role, id);
  const st = setupStatus(role, a);
  if (st.needsSetup) {
    const what = Object.entries(st.needs).filter(([, v]) => v).map(([k]) => k);
    throw err(409, 'SETUP_INCOMPLETE', `Still needed: ${what.join(', ')}`);
  }
  if (!a.profileCompletedAt) { a.profileCompletedAt = new Date(); await a.save(); }
  return st;
}

module.exports = { setPhoto, skipPhoto, markReleaseSeen, PHOTO_FIELD,
  ROLES, checkPassword, phoneVariants, setupStatus,
  getStatus, setPassword, setName, startEmailVerification, confirmEmail,
  loginWithPassword, requestPasswordReset, resetWithToken, resetWithOtp, completeSetup,
};
