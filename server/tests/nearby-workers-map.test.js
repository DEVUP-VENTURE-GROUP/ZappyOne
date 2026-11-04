// The scooters on the customer's map (GET /workers/nearby): live pros near the pin, for one service only those who may do it plus shop owners out with ServicePro open; never who they are.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let ids = {};
const HOME = { lat: 17.4401, lng: 78.3489 };

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const Worker = require('../src/modules/worker/worker.model');
  const Shop = require('../src/modules/shop/shop.model');
  const { ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.create({ code: 'daily_cleaning', name: 'Daily cleaning', domainCode: 'home_daily_help', repairVertical: 'daily_cleaning' });
  // The live index itself is Redis GEO (worker/geo.service), which the test Redis cannot do: it answers with the pros it holds.
  const live = [];
  jest.spyOn(require('../src/modules/worker/geo.service'), 'findNearbyWorkers').mockImplementation(async () => live.map((x) => ({ ...x })));
  const online = async (name, lng, lat) => {
    const w = await Worker.create({ phone: `90000981${String(Object.keys(ids).length).padStart(2, '0')}`, name, kyc: { status: 'approved' }, isOnline: true, currentLocation: { type: 'Point', coordinates: [lng, lat] } });
    live.push({ id: String(w._id), lat, lng, distanceKm: 0.2 + live.length * 0.1 });
    return w._id;
  };
  ids.cleaner = await online('Cleaner', 78.3501, 17.4412);
  ids.plumber = await online('Plumber', 78.3511, 17.4422);
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: ids.cleaner, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
  const shop = await Shop.create({ businessName: 'Shine', ownerName: 'O', phone: '9000098199', address: { text: 'x', location: { type: 'Point', coordinates: [77.9, 17.3] } }, ownerLocation: { coordinates: [78.3521, 17.4432], at: new Date() } });
  ids.shop = shop._id;
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
});
afterAll(stopMongo);

test('every live pro near the pin without a service; for a service, only those who may do it plus a shop owner out live', async () => {
  const all = await request(app).get('/api/workers/nearby').query(HOME);
  expect(all.status).toBe(200);
  expect(all.body.count).toBe(2);
  const cleaning = await request(app).get('/api/workers/nearby').query({ ...HOME, vertical: 'daily_cleaning' });
  expect(cleaning.body.count).toBe(2); // the cleaner and the shop owner, not the plumber
  const raw = JSON.stringify(cleaning.body);
  for (const id of Object.values(ids)) expect(raw).not.toContain(String(id));
  expect(raw).not.toMatch(/Cleaner|Shine|phone|name/);
});

test('the same pro keeps one key between polls, so the scooter glides', async () => {
  const keys = async () => (await request(app).get('/api/workers/nearby').query({ ...HOME, vertical: 'daily_cleaning' })).body.workers.map((w) => w.key).sort();
  expect(await keys()).toEqual(await keys());
});
