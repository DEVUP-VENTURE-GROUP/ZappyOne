// A partner sees every setup step with where to fix it, and the storefront link they share opens for customers who are not signed in.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(120000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);

test('profile status lists every step, done or not, each pointing at the page that holds it', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const shop = await Shop.create({ businessName: 'Madhapur Mobiles', ownerName: 'Ravi', phone: '9000000961' });
  const res = await request(app).get('/api/provider/onboarding/profile-status').set('Authorization', `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop' })}`);
  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(res.body.total);
  const byKey = Object.fromEntries(res.body.items.map((i) => [i.key, i]));
  expect(byKey.businessName).toMatchObject({ done: true, path: '/shop/profile' });
  expect(byKey.ownerName).toMatchObject({ done: true, path: '/shop/account' });
  expect(byKey.email).toMatchObject({ done: false, path: '/shop/profile' });
  expect(res.body.missing.map((m) => m.key)).toEqual(res.body.items.filter((i) => !i.done).map((i) => i.key));
});

test('a shared storefront opens signed out, and the terms link is the partner terms', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const w = await Worker.create({ name: 'Asif', phone: '9000000962' });
  const pro = await request(app).get(`/api/workers/${w._id}/public`);
  expect(pro.status).toBe(200);
  expect(pro.body.worker).toMatchObject({ name: 'Asif' });
  expect(pro.body.worker.phone).toBeUndefined();
  expect((await request(app).get(`/api/shops/${w._id}`)).status).not.toBe(401);
  expect((await request(app).get(`/api/repair/storefronts/worker/${w._id}/menu?vertical=mobile`)).status).not.toBe(401);
  const terms = await request(app).get('/api/auth/shop/partner-terms?type=agency');
  expect(terms.body.fullTermsUrl).toMatch(/\/policy\/partner-terms$/);
});

test('a partner sees the services they asked for, and sending again updates the waiting request', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const shop = await Shop.create({ businessName: 'Kukatpally Zumba', ownerName: 'Neha', phone: '9000000963' });
  const auth = { Authorization: `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop' })}` };
  const ask = (photos) => request(app).post('/api/provider/onboarding/line-requests').set(auth).send({ proposedName: 'Zumba classes', description: 'Group dance fitness', photos });
  expect((await ask(['line-requests/a.jpg'])).status).toBe(201);
  expect((await ask(['line-requests/a.jpg', 'line-requests/b.jpg'])).body.deduped).toBe(true);

  const mine = await request(app).get('/api/provider/onboarding/line-requests').set(auth);
  expect(mine.status).toBe(200);
  expect(mine.body.requests).toHaveLength(1);
  expect(mine.body.requests[0]).toMatchObject({ proposedName: 'Zumba classes', status: 'pending', photos: ['line-requests/a.jpg', 'line-requests/b.jpg'] });
  expect(mine.body.requests[0].photoUrls).toHaveLength(2);
});

test('admin sees every request with who sent it, filtered by status', async () => {
  const admin = await adminToken();
  const call = (q) => request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}/onboarding/line-requests${q}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
  const pending = await call('?status=pending');
  expect(pending.status).toBe(200);
  const zumba = pending.body.items.find((r) => r.proposedName === 'Zumba classes');
  expect(zumba.requester).toMatchObject({ kind: 'shop', name: 'Kukatpally Zumba', ownerName: 'Neha', phone: '9000000963', kycStatus: 'not_submitted' });
  expect((await call('?status=approved')).body.items.map((r) => r.proposedName)).not.toContain('Zumba classes');
});
