// ServicePro's one sign-in: the code is checked once, a number with one account opens it, several are offered with a short ticket, none starts sign-up as a business or an event partner; tickets cannot be forged or reused across purposes.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const config = require('../src/config');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(60000);
let app;
const sp = (path) => request(app).post(`/api/auth/servicepro/${path}`).set('X-Client-Type', 'servicepro');

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  jest.spyOn(redis, 'hgetall').mockResolvedValue({ code: '1234' });
  for (const m of ['del', 'hincrby', 'incr', 'expire', 'hset', 'smembers', 'sadd']) jest.spyOn(redis, m).mockResolvedValue(1);
});
afterAll(stopMongo);

test('a new number signs up as a solo pro and lands signed in', async () => {
  const first = await sp('login').send({ phone: '9822200001', otp: '1234' });
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ needsRegistration: true, accounts: [] });
  const reg = await sp('register').send({ ticket: first.body.ticket, kind: 'services', businessName: 'Asha Beauty at Home', ownerName: 'Asha', partnerType: 'individual', acceptTerms: true });
  expect(reg.status).toBe(200);
  expect(reg.body).toMatchObject({ role: 'shop', account: { businessName: 'Asha Beauty at Home', partnerType: 'individual' } });
  expect(reg.body.accessToken).toBeTruthy();
  expect((await sp('register').send({ ticket: first.body.ticket, kind: 'services', businessName: 'Again Shop', ownerName: 'Asha', acceptTerms: true })).body.code).toBe('ALREADY_REGISTERED');
});

test('a number with one account opens it straight away', async () => {
  const r = await sp('login').send({ phone: '9822200001', otp: '1234' });
  expect(r.body).toMatchObject({ role: 'shop' });
  expect(r.body.accessToken).toBeTruthy();
});

test('a number with several accounts is offered them, then opens the one picked without a second code', async () => {
  const shop = await Shop.findOne({ phone: '9822200001' });
  await Worker.create({ name: 'Asha', phone: '9822200002', shopId: shop._id });
  await Shop.create({ phone: '9822200002', businessName: 'Asha Side Business', ownerName: 'Asha', isActive: true });
  const first = await sp('login').send({ phone: '9822200002', otp: '1234' });
  expect(first.body.accounts.map((a) => a.role).sort()).toEqual(['shop', 'worker']);
  expect(first.body.accounts.find((a) => a.role === 'worker')).toMatchObject({ shopName: 'Asha Beauty at Home' });
  const picked = await sp('login').send({ ticket: first.body.ticket, role: 'worker' });
  expect(picked.body).toMatchObject({ role: 'worker' });
  expect(picked.body.accessToken).toBeTruthy();
  expect((await sp('login').send({ ticket: first.body.ticket, role: 'event_partner' })).body.code).toBe('NO_SUCH_ACCOUNT');
});

test('event partners sign up and sign in through the same door', async () => {
  const first = await sp('login').send({ phone: '9822200003', otp: '1234' });
  const reg = await sp('register').send({ ticket: first.body.ticket, kind: 'events', businessName: 'Bloom Decor', ownerName: 'Ravi', acceptTerms: true });
  expect(reg.body).toMatchObject({ role: 'event_partner', account: { businessName: 'Bloom Decor' } });
  expect((await sp('login').send({ phone: '9822200003', otp: '1234' })).body.role).toBe('event_partner');
});

test('forged, expired or other-purpose tickets and wrong codes are refused; other apps cannot use this door', async () => {
  const forged = jwt.sign({ phone: '9822200001', p: 'servicepro_login' }, 'not-the-secret-not-the-secret-123456');
  expect((await sp('login').send({ ticket: forged, role: 'shop' })).body.code).toBe('TICKET_EXPIRED');
  const otherPurpose = jwt.sign({ phone: '9822200001', p: 'something_else' }, config.jwt.secret);
  expect((await sp('login').send({ ticket: otherPurpose, role: 'shop' })).body.code).toBe('TICKET_EXPIRED');
  const expired = jwt.sign({ phone: '9822200001', p: 'servicepro_login' }, config.jwt.secret, { expiresIn: -10 });
  expect((await sp('login').send({ ticket: expired, role: 'shop' })).body.code).toBe('TICKET_EXPIRED');
  redis.hgetall.mockResolvedValueOnce({ code: '9999' });
  expect((await sp('login').send({ phone: '9822200001', otp: '1234' })).body.code).toBe('OTP_INVALID');
  expect((await request(app).post('/api/auth/servicepro/login').set('X-Client-Type', 'rakshak').send({ phone: '9822200001', otp: '1234' })).status).toBe(403);
  expect((await sp('login').send({ phone: '9822200001' })).status).toBe(400);
});

test('the dashboard opens only once every required detail is filled, per kind of account', async () => {
  const { profileStatus } = require('../src/modules/onboarding/profile-check');
  const shop = await Shop.findOne({ phone: '9822200001' });
  const before = await profileStatus('shop', shop._id);
  expect(before.complete).toBe(false);
  expect(before.missing.map((m) => m.key)).toEqual(['email', 'address', 'photo', 'hours', 'bio', 'years', 'kyc']);
  expect(before.missing.find((m) => m.key === 'kyc').path).toBe('/shop/kyc');
  await Shop.updateOne({ _id: shop._id }, { $set: {
    email: 'asha@example.com', address: { text: 'Flat 2, Kondapur', location: { type: 'Point', coordinates: [78.36, 17.46] } }, coverImageUrl: 'shop/a.jpg',
    hours: [{ day: 1, opensAt: '09:00', closesAt: '19:00' }], bio: 'Bridal makeup and salon services at home since 2018.', yearsActive: 7, 'kyc.status': 'pending_review',
  } });
  expect(await profileStatus('shop', shop._id)).toMatchObject({ complete: true, missing: [] });
  const EventPartner = require('../src/modules/events/event-partner.model');
  const partner = await EventPartner.findOne({ phone: '9822200003' });
  expect((await profileStatus('event_partner', partner._id)).missing.map((m) => m.key)).toEqual(['cities', 'photo', 'bio', 'years', 'kyc']);
});
