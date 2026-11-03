// A UPI ID is checked with Razorpay: one that does not exist is never saved, a real one keeps the name it is under, and no answer never blocks.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(120000);
let app; let rz; let config;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  config = require('../src/config');
  rz = require('../src/modules/payment/razorpay.client');
});
afterAll(stopMongo);
afterEach(() => { jest.restoreAllMocks(); config.razorpay.keyId = ''; config.razorpay.keySecret = ''; });
const withKeys = () => { config.razorpay.keyId = 'rzp_test_x'; config.razorpay.keySecret = 'y'; };

test('check: real, missing, Razorpay error, no keys', async () => {
  const { checkUpi } = require('../src/modules/payment/upi-check');
  expect(await checkUpi('not-a-upi')).toEqual({ status: 'invalid' });
  expect(await checkUpi('asif@oksbi')).toEqual({ status: 'unchecked' });
  withKeys();
  jest.spyOn(rz, 'validateVpa').mockResolvedValueOnce({ vpa: 'asif@oksbi', success: true, customer_name: 'ASIF MOHAMMED' });
  expect(await checkUpi('asif@oksbi')).toEqual({ status: 'verified', name: 'ASIF MOHAMMED' });
  rz.validateVpa.mockResolvedValueOnce({ vpa: 'nobody@oksbi', success: false });
  expect(await checkUpi('nobody@oksbi')).toEqual({ status: 'invalid' });
  rz.validateVpa.mockRejectedValueOnce(Object.assign(new Error('Invalid VPA. Please enter a valid Virtual Payment Address'), { code: 'RAZORPAY_API_ERROR' }));
  expect(await checkUpi('nobody@oksbi')).toEqual({ status: 'invalid' });
  rz.validateVpa.mockRejectedValueOnce(Object.assign(new Error('Razorpay did not answer'), { code: 'RAZORPAY_UNREACHABLE' }));
  expect(await checkUpi('asif@oksbi')).toEqual({ status: 'unchecked' });
});

test('a partner saves only a UPI ID that exists, with its verified name', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const shop = await Shop.create({ businessName: 'Maxx Fixers', ownerName: 'Asif', phone: '9876500001' });
  const token = signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone });
  await require('../src/modules/auth/auth.service').markOtpActionVerified(String(shop._id));
  const post = (path, body) => request(app).post(`/api${path}`).set('Authorization', `Bearer ${token}`).send(body);
  withKeys();
  jest.spyOn(rz, 'validateVpa')
    .mockResolvedValueOnce({ success: true, customer_name: 'ASIF MOHAMMED' })
    .mockResolvedValueOnce({ success: false })
    .mockResolvedValueOnce({ success: true, customer_name: 'ASIF MOHAMMED' });

  const check = await post('/workers/bank-accounts/upi/check', { upiId: 'asif@oksbi' });
  expect(check.body).toEqual({ status: 'verified', name: 'ASIF MOHAMMED' });

  const fake = await post('/workers/bank-accounts', { type: 'upi', upiId: 'nobody@oksbi' });
  expect(fake.status).toBe(400);
  expect(fake.body.code).toBe('UPI_NOT_FOUND');

  const ok = await post('/workers/bank-accounts', { type: 'upi', upiId: 'asif@oksbi' });
  expect(ok.status).toBe(201);
  expect(ok.body.upiIds[0]).toMatchObject({ upiId: 'asif@oksbi', verifiedName: 'ASIF MOHAMMED' });
});

test("ZappyOne's own UPI ID is checked when admin saves it, and partners see the verified name", async () => {
  const admin = await adminToken();
  const patch = (body) => request(app).patch(`/api/${process.env.ADMIN_LOGIN_SLUG}/cancellation-config`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174').send(body);
  withKeys();
  jest.spyOn(rz, 'validateVpa').mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true, customer_name: 'DEVUP VENTURE GROUP' });

  expect((await patch({ zappyPayUpiId: 'nobody@okaxis' })).status).toBe(400);
  expect((await patch({ zappyPayUpiId: 'zappyone@okaxis' })).status).toBe(200);
  const { payTo } = await require('../src/modules/worker/worker-dues.service').limits();
  expect(payTo).toMatchObject({ upiId: 'zappyone@okaxis', upiName: 'DEVUP VENTURE GROUP' });
});
