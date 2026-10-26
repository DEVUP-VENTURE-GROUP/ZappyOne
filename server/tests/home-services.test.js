// Home cleaning, electrician, plumbing and AC service seed as fixed-price packages, one price per type, and the washes they share a builder with are unchanged.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { run } = require('../src/modules/repair/seed/run-vertical-seed');
const { seedBands } = require('../src/modules/repair/seed/run-pricing-seed');
const { HOME_SERVICES } = require('../src/modules/repair/seed/home-services.seed');
const { VERTICALS } = require('../src/modules/repair/vertical');

jest.setTimeout(120000);
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGO_URI = `${server.getUri()}zappyhome`;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'table').mockImplementation(() => {});
  for (const v of Object.keys(HOME_SERVICES)) await run(v);
  await mongoose.connect(process.env.MONGO_URI);
  for (const [v, s] of Object.entries(HOME_SERVICES)) await seedBands(s.PRICING, v);
});
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

test('all four are registered verticals', () => {
  expect(VERTICALS).toEqual(expect.arrayContaining(['home_cleaning', 'electrician', 'plumbing', 'ac_service']));
});

test('packages and types land as data', async () => {
  const Brand = require('../src/modules/service/brand.model');
  const { Problem } = require('../src/modules/repair/models/problem.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  expect((await Brand.find({ category: 'home_cleaning' }).lean()).map((b) => b.name).sort()).toEqual(['1 BHK', '2 BHK', '3 BHK', '4 BHK or villa']);
  expect(await Brand.countDocuments({ category: 'electrician' })).toBe(1);
  expect(await Problem.countDocuments({ vertical: 'plumbing' })).toBe(7);
  expect(await Repair.countDocuments({ vertical: 'ac_service', pricingMode: 'fixed' })).toBe(5);
});

test('one price per type and package, never a range', async () => {
  const { resolveReferencePrice } = require('../src/modules/repair/services/pricing.service');
  expect(await resolveReferencePrice({ vertical: 'home_cleaning', repairCode: 'hc_full_deep', brandCode: 'hc_2bhk' }))
    .toMatchObject({ minPaise: 399900, recommendedPaise: 399900, maxPaise: 399900 });
  expect((await resolveReferencePrice({ vertical: 'electrician', repairCode: 'el_fan', brandCode: 'el_home' })).recommendedPaise).toBe(24900);
  expect((await resolveReferencePrice({ vertical: 'ac_service', repairCode: 'ac_gas', brandCode: 'ac_window' })).recommendedPaise).toBe(219900);
});

test('package list carries each package price and time for the chosen type', async () => {
  const { listProblems } = require('../src/modules/repair/controllers/catalog.controller');
  const DeviceModel = require('../src/modules/service/device-model.model');
  const model = await DeviceModel.findOne({ brandCode: 'hc_2bhk' }).lean();
  let body;
  await listProblems({ query: { vertical: 'home_cleaning', modelCode: model.code } }, { json: (b) => { body = b; } }, (e) => { throw e; });
  const full = body.categories.flatMap((c) => c.problems).find((p) => p.code === 'hc_full_deep_req');
  expect(full).toMatchObject({ pricePaise: 399900 });
  expect(full.durationMin).toBeGreaterThan(0);
});
