// The dashboard Live switch: ON (the default) takes orders from where the owner is now; OFF takes none, even in opening hours.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(90000);
let app; let Shop; let shop; let auth; let matching;
const VIKARABAD = [77.9044, 17.3381];
const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Shop = require('../src/modules/shop/shop.model');
  await Shop.init();
  matching = require('../src/modules/repair/services/matching.service');
  shop = await Shop.create({ businessName: 'Zappy premium services', ownerName: 'F', phone: '9000097777', kyc: { status: 'approved' }, services: ['mobile_repair'],
    hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: '00:00', closesAt: '23:59' })), address: { text: 'Vikarabad', location: { type: 'Point', coordinates: VIKARABAD } } });
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  await ProviderServiceArea.create({ shopId: shop._id, cityCode: 'vikarabad', center: { type: 'Point', coordinates: VIKARABAD }, radiusKm: 10, serviceModes: ['doorstep'] });
  auth = { Authorization: `Bearer ${signAccessToken({ sub: String(shop._id), role: 'shop' })}` };
});
afterAll(stopMongo);

const found = async () => (await matching.findServiceableProviders({ ...GACHIBOWLI, serviceMode: 'doorstep' })).some((a) => String(a.shopId) === String(shop._id));
const live = () => require('../src/modules/shop/shop.service').isLive;

test('ON by default, as shops always were; far from the customer, so not found from the shop address', async () => {
  const s = await Shop.findById(shop._id).lean();
  expect(s.takingOrders).toBe(true);
  expect(live()(s)).toBe(true);
  expect(await found()).toBe(false);
});

test('ON needs the location; with it, orders near the owner come, wherever the shop is', async () => {
  expect((await request(app).put('/api/shops/me/live').set(auth).send({ on: true })).body.code).toBe('LOCATION_NEEDED');
  const r = await request(app).put('/api/shops/me/live').set(auth).send({ on: true, lat: 17.4411, lng: 78.3500 });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ takingOrders: true });
  expect(await found()).toBe(true);
});

test('OFF: no new orders, even in opening hours and with the owner right there', async () => {
  const r = await request(app).put('/api/shops/me/live').set(auth).send({ on: false });
  expect(r.body.takingOrders).toBe(false);
  expect(live()(await Shop.findById(shop._id).lean())).toBe(false);
  expect(await found()).toBe(false);
});

test('a live position more than 15 minutes old no longer moves the shop', async () => {
  await Shop.updateOne({ _id: shop._id }, { $set: { takingOrders: true, 'ownerLocation.at': new Date(Date.now() - 20 * 60000) } });
  expect(await found()).toBe(false);
});
