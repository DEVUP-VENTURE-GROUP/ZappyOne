// Admin sees every partner's dues and every payment to ZappyOne in one place, and a recorded payment shows at once.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(120000);
let app; let admin;
const call = (method, path) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
beforeAll(async () => { await startMongo(); app = require('../src/app')(); admin = await adminToken(); });
afterAll(stopMongo);

test('totals, who is paused, and each payment with who paid and how', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const Wallet = require('../src/modules/wallet/wallet.model');
  const Shop = require('../src/modules/shop/shop.model');
  const pro = await Worker.create({ name: 'Imran', phone: '9000000601' });
  await Wallet.updateOne({ 'owner.kind': 'worker', 'owner.id': pro._id }, { $set: { balancePaise: -250000 } }, { upsert: true });
  const shop = await Shop.create({ businessName: 'Kondapur Fixers', ownerName: 'Ravi', phone: '9000000602' });

  const pay = await call('post', `/dues/shops/${shop._id}/payment`).send({ amountRupees: 300, reference: 'UTR123456' });
  expect(pay.status).toBe(200);

  const res = await call('get', '/dues/overview');
  expect(res.status).toBe(200);
  expect(res.body.totals.owedPaise).toBeGreaterThanOrEqual(250000);
  expect(res.body.totals.paused).toBeGreaterThanOrEqual(1);
  expect(res.body.totals.collectedThisMonthPaise).toBeGreaterThanOrEqual(30000);
  expect(res.body.payments[0]).toMatchObject({ amountPaise: 30000, how: 'Recorded by admin', reference: 'UTR123456', partner: { kind: 'shop', name: 'Kondapur Fixers' } });
  // Who owes, most owed first, with status and what they have paid before.
  const imran = res.body.partners.find((p) => p.name === 'Imran');
  expect(imran).toMatchObject({ kind: 'worker', owedPaise: 250000, status: 'paused', paidPaise: 0, lastPaidAt: null });
  expect(res.body.partners[0].owedPaise).toBeGreaterThanOrEqual(res.body.partners[res.body.partners.length - 1].owedPaise);
  // A shop that has paid everything is not on the list.
  expect(res.body.partners.some((p) => p.name === 'Kondapur Fixers')).toBe(false);
  // Six months, oldest first, this month last with the payment just recorded.
  expect(res.body.monthly).toHaveLength(6);
  expect(res.body.monthly[5].paise).toBeGreaterThanOrEqual(30000);
  expect(res.body.monthly[5].count).toBeGreaterThanOrEqual(1);
  // Which gateway Pay now uses, from payment/gateway, so admin knows the receiving account is the gateway's own.
  expect(res.body.onlineGateway).toBe(require('../src/modules/payment/gateway').active());
});

test('admin sets the ZappyOne receiving account; partners see where to pay; a bad UPI ID is refused', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const bad = await call('patch', '/cancellation-config').send({ zappyPayUpiId: 'not a upi' });
  expect(bad.status).toBe(400);
  const ok = await call('patch', '/cancellation-config').send({ zappyPayUpiId: 'zappyone@okaxis', zappyPayAccountName: 'DEVUP Venture Group', zappyPayAccountNumber: '50100123456789', zappyPayIfsc: 'hdfc0001234' });
  expect(ok.status).toBe(200);
  const shop = await Shop.create({ businessName: 'Madhapur Mobiles', ownerName: 'Asif', phone: '9000000603' });
  const dues = await request(app).get('/api/shops/me/dues').set('Authorization', `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop' })}`);
  expect(dues.status).toBe(200);
  expect((dues.body.dues || dues.body).payTo).toMatchObject({ upiId: 'zappyone@okaxis', accountNumber: '50100123456789', ifsc: 'HDFC0001234' });
});
