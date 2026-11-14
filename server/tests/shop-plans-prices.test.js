/**
 * Shop plans (draft vs publish), monthly statement months, and changing every
 * price by a % with a way back to normal.
 */
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(90000);

let app; let shop; let auth;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const Shop = require('../src/modules/shop/shop.model');
  const ServiceCatalog = require('../src/modules/service/service-catalog.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  await ServiceCatalog.create({ code: 'screen_fix', name: 'Screen fix', category: 'mobile', priceRangeMinPaise: 1, priceRangeMaxPaise: 2, requiredSkills: [] });
  await Repair.create({ code: 'battery_swap', name: 'Battery swap', vertical: 'mobile' });
  shop = await Shop.create({ businessName: 'Test Mobiles', ownerName: 'Ravi', phone: '9812300099', services: ['screen_fix'] });
  auth = { Authorization: `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone })}` };
});
afterAll(stopMongo);

test('a half-filled plan saves as a draft; publishing says what is missing', async () => {
  const draft = await request(app).post('/api/shops/me/plans').set(auth).send({ kind: 'monthly', title: '', status: 'draft' });
  expect(draft.status).toBe(200);
  expect(draft.body.plan.status).toBe('draft');

  const bad = await request(app).post('/api/shops/me/plans').set(auth).send({ kind: 'monthly', title: 'Care', status: 'published' });
  expect(bad.status).toBe(400);

  const pub = await request(app).put(`/api/shops/me/plans/${draft.body.plan._id}`).set(auth)
    .send({ kind: 'monthly', title: 'Care', services: ['screen_fix'], pricePaise: 49900, perk: 'Free check-up', status: 'published' });
  expect(pub.status).toBe(200);
  expect(pub.body.plan).toMatchObject({ status: 'published', pricePaise: 49900 });

  const foreign = await request(app).post('/api/shops/me/plans').set(auth)
    .send({ kind: 'one_day', title: 'X', services: ['not_ours'], pricePaise: 100, status: 'published' });
  expect(foreign.status).toBe(400);

  const list = await request(app).get('/api/shops/me/plans').set(auth);
  expect(list.body.plans).toHaveLength(1);
  expect(list.body.services).toEqual([{ code: 'screen_fix', name: 'Screen fix' }]);
});

test('statement months never start before launch', async () => {
  const res = await request(app).get('/api/shops/me/statement').set(auth);
  expect(res.status).toBe(200);
  expect(res.body.months.at(-1) >= '2026-11').toBe(true);
  expect(res.body.months.every((m) => m >= '2026-11')).toBe(true);
  expect((await request(app).get('/api/shops/me/statement?month=2025-06').set(auth)).status).toBe(400);
});

test('all prices +10%, again +10% does not stack, then back to normal', async () => {
  const save = await request(app).post('/api/repair/provider/pricing').set(auth)
    .send({ vertical: 'mobile', repairCode: 'battery_swap', totalPaise: 100000 });
  expect(save.status).toBe(201);

  const price = async () => (await request(app).get('/api/repair/provider/pricing?vertical=mobile').set(auth)).body.pricing[0];
  await request(app).post('/api/repair/provider/pricing/adjust').set(auth).send({ vertical: 'mobile', percent: 10 }).expect(200);
  expect(await price()).toMatchObject({ totalPaise: 110000, normalPaise: 100000 });
  await request(app).post('/api/repair/provider/pricing/adjust').set(auth).send({ vertical: 'mobile', percent: 10 }).expect(200);
  expect((await price()).totalPaise).toBe(110000);
  await request(app).post('/api/repair/provider/pricing/adjust').set(auth).send({ vertical: 'mobile', percent: 0 }).expect(200);
  expect(await price()).toMatchObject({ totalPaise: 100000, normalPaise: null });
});
