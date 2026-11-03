// A money or bank change is confirmed with a code sent to the account's own number, even when the browser has lost the profile or the session carries no phone.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);

test('the code goes to the account phone and confirms the action', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const shop = await Shop.create({ businessName: 'Maxx Fixers', ownerName: 'Asif', phone: '9876543210' });
  // Signed in by email: the session has no phone, and the request body names none.
  const token = signAccessToken({ sub: String(shop._id), role: 'shop', email: 'a@b.c' });
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  const sent = await auth(request(app).post('/api/auth/otp/request-action')).send({ phone: '9000000000' });
  expect(sent.status).toBe(200);
  expect(sent.body.sentTo).toBe('98••••••10');
  expect(sent.body.otp).toBeTruthy();

  const wrong = await auth(request(app).post('/api/auth/otp/verify-action')).send({ otp: '000000' === sent.body.otp ? '111111' : '000000' });
  expect(wrong.status).toBe(401);
  const ok = await auth(request(app).post('/api/auth/otp/verify-action')).send({ otp: sent.body.otp });
  expect(ok.status).toBe(200);
});

test('signed out, no code is sent', async () => {
  const res = await request(app).post('/api/auth/otp/request-action');
  expect(res.status).toBe(401);
});
