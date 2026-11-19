require('./env');
// Password sign-in from the phone apps keeps each account in its own app: a shop's technician and an event partner sign in to ServicePro, an individual worker only to Rakshak.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(60000);
let app;
const PW = 'Strong#Pass2026';
const login = (xApp, role, identifier) => request(app).post('/api/auth/password/login')
  .set('X-Client-Type', 'mobile').set('X-App', xApp).send({ role, identifier, password: PW });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const passwordHash = await bcrypt.hash(PW, 4);
  const shopId = new mongoose.Types.ObjectId();
  await Shop.collection.insertOne({ _id: shopId, phone: '9100000101', businessName: 'Test Shop', passwordHash });
  await Worker.collection.insertMany([
    { phone: '9100000102', name: 'Shop Tech', shopId, passwordHash },
    { phone: '9100000103', name: 'Solo Worker', shopId: null, passwordHash },
  ]);
  await require('../src/modules/events/event-partner.model').collection.insertOne({ phone: '9100000104', businessName: 'Decor Co', passwordHash });
});
afterAll(stopMongo);

test('ServicePro signs in a shop owner, a technician and an event partner with their passwords', async () => {
  const shop = await login('servicepro', 'shop', '9100000101');
  expect(shop.status).toBe(200);
  expect(shop.body.shop.businessName).toBe('Test Shop');
  const tech = await login('servicepro', 'worker', '9100000102');
  expect(tech.status).toBe(200);
  expect(tech.body.worker.name).toBe('Shop Tech');
  expect(tech.body.refreshToken).toBeTruthy();
  const partner = await login('servicepro', 'event_partner', '9100000104');
  expect(partner.status).toBe(200);
  expect(partner.body.partner.businessName).toBe('Decor Co');
});

test('an individual worker is sent to Rakshak, and a shop technician to ServicePro', async () => {
  const solo = await login('servicepro', 'worker', '9100000103');
  expect(solo.status).toBe(403);
  expect(solo.body.code).toBe('NOT_A_SHOP_WORKER');
  expect((await login('rakshak', 'worker', '9100000103')).status).toBe(200);
  const tech = await login('rakshak', 'worker', '9100000102');
  expect(tech.status).toBe(403);
  expect(tech.body.code).toBe('SHOP_WORKER');
});
