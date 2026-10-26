// A partner's monthly statement: only that month (Indian time), earnings, commission owed, dues paid and payouts, with matching totals and a CSV.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Transaction = require('../src/modules/payment/transaction.model');
const { ShopPayout } = require('../src/modules/shop/shop-payout');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(60000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);

test('one month, the right totals, and a CSV', async () => {
  const shop = await Shop.create({ phone: '9833300001', businessName: 'Ledger Cleaners, Kondapur', ownerName: 'D', agreement: { version: '2026-10', acceptedAt: new Date(), ratePct: 5 } });
  const id = String(shop._id);
  const at = (iso) => new Date(iso);
  await Transaction.create([
    { type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: 300000, reason: 'worker_earning', idempotencyKey: 's1', metadata: { shopId: id, bookingId: 'b1' }, status: 'succeeded', createdAt: at('2026-10-05T06:00:00Z') },
    { type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -20000, reason: 'platform_commission', idempotencyKey: 's2', metadata: { shopId: id, bookingId: 'b2' }, status: 'succeeded', createdAt: at('2026-10-31T18:00:00Z') },
    { type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: 999, reason: 'worker_earning', idempotencyKey: 's3', metadata: { shopId: id }, status: 'succeeded', createdAt: at('2026-09-30T17:00:00Z') },
  ]);
  await ShopPayout.create({ shopId: shop._id, amountPaise: 100000, destination: { type: 'upi', label: 'Shop UPI', upiId: 'x@upi' }, status: 'paid', reference: 'UTR5', decidedAt: at('2026-10-20T10:00:00Z') });
  const token = signAccessToken({ sub: id, role: 'shop', phone: shop.phone });

  const res = await request(app).get('/api/shops/me/statement?month=2026-10').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.rows).toHaveLength(2 + 1);
  expect(res.body.totals).toMatchObject({ earnedPaise: 300000, commissionOwedPaise: 20000, paidOutPaise: 100000, netPaise: 180000 });

  const sep = await request(app).get('/api/shops/me/statement?month=2026-09').set('Authorization', `Bearer ${token}`);
  expect(sep.body.totals.earnedPaise).toBe(999);

  const csv = await request(app).get('/api/shops/me/statement?month=2026-10&format=csv').set('Authorization', `Bearer ${token}`);
  expect(csv.headers['content-type']).toMatch(/text\/csv/);
  expect(csv.text).toContain('"Ledger Cleaners, Kondapur"');
  expect(csv.text).toContain('Net for the month,1800.00');
  expect((await request(app).get('/api/shops/me/statement?month=2026-13').set('Authorization', `Bearer ${token}`)).status).toBe(400);
});

test('the app opens the statement with a five-minute document link, only for that path', async () => {
  const shop = await Shop.create({ phone: '9833300002', businessName: 'Link Co', ownerName: 'E' });
  const docLink = require('../src/modules/account/doc-link');
  const path = '/api/shops/me/statement/2026-10.csv';
  const dl = docLink.sign({ sub: String(shop._id), role: 'shop' }, path);
  const res = await request(app).get(`${path}?dl=${encodeURIComponent(dl)}`);
  expect(res.status).toBe(200);
  expect(res.text).toContain('ZappyOne statement,Link Co,2026-10');
  expect((await request(app).get(`/api/shops/me/statement/2026-09.csv?dl=${encodeURIComponent(dl)}`)).status).toBe(401);
});
