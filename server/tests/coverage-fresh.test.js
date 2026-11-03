// What a customer can book here follows a provider's change on the next request, not when a cache runs out: paused, back, priced, and the area moved.
const { startMongo, stopMongo, pricedShopNear } = require('./helpers');

jest.setTimeout(120000);
let coverage; let search; let Shop; let ProviderServiceArea; let ProviderCapability; let ServiceLine;
const AT = { lat: 17.4486, lng: 78.3908 };
const bikeWashLive = async () => !!(await coverage.serviceabilityAt(AT)).lines.find((l) => l.code === 'bike_wash');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The version is read at most once a second per process; a change is seen within that second.
const next = () => wait(1100);

beforeAll(async () => {
  await startMongo();
  coverage = require('../src/modules/onboarding/coverage.service');
  search = require('../src/modules/search/search.service');
  Shop = require('../src/modules/shop/shop.model');
  ({ ProviderServiceArea } = require('../src/modules/repair/models/config.model'));
  ({ ProviderCapability } = require('../src/modules/repair/models/capability.model'));
  ({ ServiceLine } = require('../src/modules/onboarding/onboarding.model'));
});
afterAll(stopMongo);

test('pause, unpause, unprice and move the area: each shows on the next request', async () => {
  const shop = await pricedShopNear({ ...AT, vertical: 'bike_wash', lineCode: 'bike_wash', domainCode: 'vehicles', repairCode: 'bike_foam_wash', totalPaise: 19900 });
  await ServiceLine.updateOne({ code: 'bike_wash' }, { $set: { customerPath: '/repair/bike-wash', isActive: true, isArchived: false } });
  await next();
  expect(await bikeWashLive()).toBe(true);

  await Shop.updateOne({ _id: shop._id }, { $set: { isBlocked: true } });
  await next();
  expect(await bikeWashLive()).toBe(false);

  await Shop.updateOne({ _id: shop._id }, { $set: { isBlocked: false } });
  await next();
  expect(await bikeWashLive()).toBe(true);

  await ProviderCapability.updateMany({ shopId: shop._id }, { $set: { isActive: false } });
  await next();
  expect(await bikeWashLive()).toBe(false);

  await ProviderCapability.updateMany({ shopId: shop._id }, { $set: { isActive: true } });
  await ProviderServiceArea.updateOne({ shopId: shop._id }, { $set: { center: { type: 'Point', coordinates: [AT.lng, AT.lat + 1] } } });
  await next();
  expect(await bikeWashLive()).toBe(false);
});

test("search's own cache follows too: 'not at your address' turns into a bookable result", async () => {
  const shop = await Shop.findOne({ businessName: 'Nearby Pricer' });
  await ProviderServiceArea.updateOne({ shopId: shop._id }, { $set: { center: { type: 'Point', coordinates: [AT.lng, AT.lat + 1] } } });
  await next();
  const before = await search.search({ q: 'bike wash', ...AT });
  expect(before.comingSoon.map((c) => c.code || c.title).join(' ')).toMatch(/bike/i);

  await ProviderServiceArea.updateOne({ shopId: shop._id }, { $set: { center: { type: 'Point', coordinates: [AT.lng, AT.lat] } } });
  await next();
  const after = await search.search({ q: 'bike wash', ...AT });
  expect(after.comingSoon || []).toHaveLength(0);
  expect(after.services.some((s) => s.code === 'bike_wash')).toBe(true);
});

test("a pro's location heartbeat does not throw the caches away", async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const version = require('../src/modules/onboarding/coverage-version');
  const w = await Worker.create({ name: 'Imran', phone: '9000000911' });
  await next();
  const v1 = await version.current();
  await Worker.updateOne({ _id: w._id }, { $set: { currentLocation: { type: 'Point', coordinates: [AT.lng, AT.lat] } } });
  await next();
  expect(await version.current()).toBe(v1);
  await Worker.updateOne({ _id: w._id }, { $set: { isOnline: true } });
  await next();
  expect(await version.current()).not.toBe(v1);
});
