/**
 * Passwords and email for every account type:
 *   - setup status says exactly what is missing, per account type
 *   - password rules (length, letter+number, not the phone number); changing needs the current one
 *   - sign-in by any phone format or verified email; unverified email does not sign in; lock after 8 misses
 *   - email verification: pending until the link is opened, links are single-use, taken emails refused
 *   - forgot password: a verified email gets a reset link that works once
 *   - the HTTP login sets the portal's cookie and refuses the wrong portal
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);

let app; let svc; let mailer; let mailOn; let User; let Shop; let redis;
const sent = [];

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  svc = require('../src/modules/account/account.service');
  mailer = require('../src/core/mail/mailer');
  User = require('../src/modules/user/user.model');
  Shop = require('../src/modules/shop/shop.model');
  ({ redis } = require('../src/config/redis'));
  jest.spyOn(mailer, 'sendMail').mockImplementation(async (m) => { sent.push(m); return { sent: true }; });
  mailOn = jest.spyOn(mailer, 'isConfigured').mockReturnValue(true);
});
afterAll(stopMongo);
beforeEach(async () => { sent.length = 0; await redis.flushall(); });

const linkToken = (m) => /token=([^&"\s]+)/.exec(m.text)[1];
let n = 0;
async function customer(extra = {}) {
  n += 1;
  return User.create({ phone: `+9190000${String(n).padStart(5, '0')}`, ...extra });
}

test('setup status lists what each account type still needs', async () => {
  const u = await customer();
  expect((await svc.getStatus('user', u._id)).needs).toEqual({ name: true, password: true, email: false });
  const s = await Shop.collection.insertOne({ businessName: 'Fix It', ownerName: 'Ravi', phone: '9000099001' });
  expect((await svc.getStatus('shop', s.insertedId)).needs).toEqual({ name: false, password: true, email: true });
});

test('password rules and changing it', async () => {
  const u = await customer({ name: 'Asha' });
  const digits = u.phone.slice(-10);
  await expect(svc.setPassword({ role: 'user', id: u._id, newPassword: 'short1' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  await expect(svc.setPassword({ role: 'user', id: u._id, newPassword: 'onlyletters' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  await expect(svc.setPassword({ role: 'user', id: u._id, newPassword: `x${digits}` })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  const st = await svc.setPassword({ role: 'user', id: u._id, newPassword: 'goodpass1' });
  expect(st.hasPassword).toBe(true);
  await expect(svc.setPassword({ role: 'user', id: u._id, currentPassword: 'wrong', newPassword: 'another2' })).rejects.toMatchObject({ code: 'BAD_CURRENT_PASSWORD' });
  await svc.setPassword({ role: 'user', id: u._id, currentPassword: 'goodpass1', newPassword: 'another2' });
});

test('sign in by any phone format; unverified email does not sign in; locks after 8 misses', async () => {
  const u = await customer({ name: 'Kiran' });
  await svc.setPassword({ role: 'user', id: u._id, newPassword: 'secret123' });
  const ten = u.phone.slice(-10);
  for (const id of [ten, `+91 ${ten}`, `0${ten}`]) {
    expect(String((await svc.loginWithPassword({ role: 'user', identifier: id, password: 'secret123' }))._id)).toBe(String(u._id));
  }
  await User.updateOne({ _id: u._id }, { $set: { email: 'kiran@example.com', emailVerified: false } });
  await expect(svc.loginWithPassword({ role: 'user', identifier: 'kiran@example.com', password: 'secret123' })).rejects.toMatchObject({ code: 'AUTH_INVALID' });
  for (let i = 0; i < 8; i += 1) {
    await expect(svc.loginWithPassword({ role: 'user', identifier: ten, password: 'nope0000' })).rejects.toMatchObject({ code: 'AUTH_INVALID' });
  }
  await expect(svc.loginWithPassword({ role: 'user', identifier: ten, password: 'secret123' })).rejects.toMatchObject({ code: 'LOGIN_LOCKED' });
});

test('email is pending until the link is opened; the link works once; a taken email is refused', async () => {
  const u = await customer({ name: 'Meena' });
  const st = await svc.startEmailVerification({ role: 'user', id: u._id, email: 'Meena@Example.com', baseUrl: 'http://x' });
  expect(st).toMatchObject({ email: 'meena@example.com', emailVerified: false });
  const token = linkToken(sent[0]);
  await svc.confirmEmail({ role: 'user', token });
  expect(await svc.getStatus('user', u._id)).toMatchObject({ email: 'meena@example.com', emailVerified: true });
  await expect(svc.confirmEmail({ role: 'user', token })).rejects.toMatchObject({ code: 'LINK_EXPIRED' });

  const other = await customer({ name: 'Other' });
  await expect(svc.startEmailVerification({ role: 'user', id: other._id, email: 'meena@example.com', baseUrl: 'http://x' }))
    .rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
});

test('forgot password: verified email gets a one-time reset link', async () => {
  const u = await customer({ name: 'Ravi', email: 'ravi@example.com', emailVerified: true });
  await svc.setPassword({ role: 'user', id: u._id, newPassword: 'oldpass11' });
  const out = await svc.requestPasswordReset({ role: 'user', identifier: 'ravi@example.com', baseUrl: 'http://x' });
  expect(out).toMatchObject({ channel: 'email' });
  expect(out.to).not.toContain('ravi@');
  const token = linkToken(sent.find((m) => /Reset/.test(m.subject)));
  await svc.resetWithToken({ role: 'user', token, newPassword: 'newpass22' });
  await expect(svc.resetWithToken({ role: 'user', token, newPassword: 'again333' })).rejects.toMatchObject({ code: 'LINK_EXPIRED' });
  expect(await svc.loginWithPassword({ role: 'user', identifier: 'ravi@example.com', password: 'newpass22' })).toBeTruthy();
  // Unknown accounts get the same answer, so the endpoint does not reveal who is registered.
  expect(await svc.requestPasswordReset({ role: 'user', identifier: 'nobody@example.com', baseUrl: 'http://x' })).toMatchObject({ sent: true, channel: 'email', to: null });
});

test('HTTP password login: portal cookie, and the wrong portal is refused', async () => {
  const u = await customer({ name: 'Web' });
  await svc.setPassword({ role: 'user', id: u._id, newPassword: 'webpass12' });
  const ok = await request(app).post('/api/auth/password/login').send({ role: 'user', identifier: u.phone, password: 'webpass12' });
  expect(ok.status).toBe(200);
  expect(ok.body.accessToken).toBeTruthy();
  expect(ok.body.user.passwordHash).toBeUndefined();
  const wrong = await request(app).post('/api/auth/password/login').set('X-Client-Type', 'events')
    .send({ role: 'user', identifier: u.phone, password: 'webpass12' });
  expect(wrong.status).toBe(403);
});

test('without a mail server: no email asked for or offered, and a reset goes to the phone', async () => {
  mailOn.mockReturnValue(false);
  const auth = require('../src/modules/auth/auth.service');
  const otp = jest.spyOn(auth, 'requestOtp').mockResolvedValue({ ok: true });
  try {
    const s = await Shop.collection.insertOne({ phone: '9800000777', businessName: 'Fix Hub', ownerName: 'Arun' });
    expect(await svc.getStatus('shop', s.insertedId)).toMatchObject({ mailConfigured: false, emailRequired: false, needs: { email: false } });
    await expect(svc.startEmailVerification({ role: 'shop', id: s.insertedId, email: 'a@b.co', baseUrl: 'http://x' }))
      .rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' });

    const u = await customer({ name: 'Lata', email: 'lata@example.com', emailVerified: true });
    const out = await svc.requestPasswordReset({ role: 'user', identifier: 'lata@example.com', baseUrl: 'http://x' });
    expect(out).toMatchObject({ channel: 'sms' });
    expect(otp).toHaveBeenCalledWith(u.phone, 'user');
    expect((await request(app).get('/api/account/capabilities')).body).toEqual({ email: false });
  } finally { mailOn.mockReturnValue(true); otp.mockRestore(); }
});

test('a reset email that fails to send falls back to the phone code', async () => {
  const auth = require('../src/modules/auth/auth.service');
  const otp = jest.spyOn(auth, 'requestOtp').mockResolvedValue({ ok: true });
  mailer.sendMail.mockImplementationOnce(async () => ({ sent: false, reason: 'send_failed' }));
  try {
    await customer({ name: 'Imran', email: 'imran@example.com', emailVerified: true });
    expect(await svc.requestPasswordReset({ role: 'user', identifier: 'imran@example.com', baseUrl: 'http://x' })).toMatchObject({ channel: 'sms' });
  } finally { otp.mockRestore(); }
});

test('profile photo: asked once, own uploads only, shown everywhere; each update seen once', async () => {
  const u = await customer({ name: 'Nisha' });
  expect(await svc.getStatus('user', u._id)).toMatchObject({ hasPhoto: false, askPhoto: true, lastSeenRelease: null, photoUrl: null });

  await expect(svc.setPhoto({ role: 'user', id: u._id, key: 'profile/someoneelse/abc' })).rejects.toMatchObject({ code: 'BAD_PHOTO' });
  const st = await svc.setPhoto({ role: 'user', id: u._id, key: `profile/${u._id}/a1b2-c3` });
  expect(st).toMatchObject({ hasPhoto: true, askPhoto: false });
  expect((await User.findById(u._id).lean()).avatarKey).toBe(`profile/${u._id}/a1b2-c3`);

  const v = await customer({ name: 'Om' });
  expect(await svc.skipPhoto({ role: 'user', id: v._id })).toMatchObject({ hasPhoto: false, askPhoto: false });

  await svc.markReleaseSeen({ role: 'user', id: v._id, release: '2026-10' });
  expect(await svc.getStatus('user', v._id)).toMatchObject({ lastSeenRelease: '2026-10' });

  // A worker with no photo of their own shows their verified ID selfie.
  const Worker = require('../src/modules/worker/worker.model');
  const w = await Worker.collection.insertOne({ phone: '9800000555', name: 'Raju', kyc: { selfieUrl: 'kyc/x/selfie' } });
  expect(await svc.getStatus('worker', w.insertedId)).toMatchObject({ hasPhoto: true, askPhoto: false });
});

void mongoose;
