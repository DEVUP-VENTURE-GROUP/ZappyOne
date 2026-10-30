// Partner sign-up: any of four types, the type's live rate shown and recorded with acceptance; older apps still sign up and accept later.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const Shop = require('../src/modules/shop/shop.model');
const authService = require('../src/modules/auth/auth.service');
const terms = require('../src/modules/shop/partner-terms');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(60000);
let app;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  jest.spyOn(redis, 'hgetall').mockResolvedValue({ code: '1234' });
  for (const m of ['del', 'hincrby', 'incr', 'expire', 'hset']) jest.spyOn(redis, m).mockResolvedValue(1);
});
afterAll(stopMongo);

test('the terms a new partner reads carry their type\'s live rate', async () => {
  const res = await request(app).get('/api/auth/shop/partner-terms?type=individual');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ version: terms.VERSION, type: 'individual', ratePct: 5 });
  expect(res.body.points[0]).toContain('5% commission');
});

test('accepting at sign-up records version, time and rate; an explicit no is refused', async () => {
  const { shop } = await authService.loginShopWithOtp({ phone: '9811100001', otp: '1234', businessName: 'Ramesh Electricals', ownerName: 'Ramesh', partnerType: 'individual', acceptTerms: true });
  expect(shop.partnerType).toBe('individual');
  expect(shop.agreement).toMatchObject({ version: terms.VERSION, ratePct: 5 });
  await expect(authService.loginShopWithOtp({ phone: '9811100002', otp: '1234', businessName: 'X', ownerName: 'Y', acceptTerms: false }))
    .rejects.toMatchObject({ code: 'TERMS_REQUIRED' });
  expect(await Shop.exists({ phone: '9811100002' })).toBeNull();
});

test('an older app signs up without terms; the dashboard asks and accepting records it', async () => {
  const { shop } = await authService.loginShopWithOtp({ phone: '9811100003', otp: '1234', businessName: 'Old App Shop', ownerName: 'Ravi' });
  expect(shop.agreement?.version || null).toBeNull();
  const token = signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone });
  const before = await request(app).get('/api/shops/me/agreement').set('Authorization', `Bearer ${token}`);
  expect(before.body.current).toBe(false);
  await request(app).post('/api/shops/me/agreement').set('Authorization', `Bearer ${token}`).expect(200);
  const after = await request(app).get('/api/shops/me/agreement').set('Authorization', `Bearer ${token}`);
  expect(after.body).toMatchObject({ current: true, agreement: { version: terms.VERSION, ratePct: 5 } });
});
