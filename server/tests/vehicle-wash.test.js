// Bike Wash and Car Wash seed as data on the repair engine: vehicle types, one model each, three packages, a single admin price per type.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { run } = require('../src/modules/repair/seed/run-vertical-seed');
const { seedBands } = require('../src/modules/repair/seed/run-pricing-seed');
const { BIKE, CAR } = require('../src/modules/repair/seed/wash.seed');
const { VERTICALS } = require('../src/modules/repair/vertical');

jest.setTimeout(120000);
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGO_URI = `${server.getUri()}zappywash`;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'table').mockImplementation(() => {});
  await run('bike_wash');
  await run('car_wash');
  await mongoose.connect(process.env.MONGO_URI);
  await seedBands(BIKE.PRICING, 'bike_wash');
  await seedBands(CAR.PRICING, 'car_wash');
});
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

test('both washes are registered verticals', () => {
  expect(VERTICALS).toEqual(expect.arrayContaining(['bike_wash', 'car_wash']));
});

test('each wash has its vehicle types, one model per type and three packages', async () => {
  const Brand = require('../src/modules/service/brand.model');
  const DeviceModel = require('../src/modules/service/device-model.model');
  const { Problem } = require('../src/modules/repair/models/problem.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  expect((await Brand.find({ category: 'car_wash' }).lean()).map((b) => b.name).sort()).toEqual(['Hatchback', 'SUV', 'Sedan']);
  expect(await DeviceModel.countDocuments({ vertical: 'bike_wash' })).toBe(3);
  expect((await Problem.find({ vertical: 'bike_wash' }).sort({ displayOrder: 1 }).lean()).map((p) => p.name))
    .toEqual(['Quick wash (waterless wipe)', 'Foam wash', 'Foam wash + polish']);
  expect(await Repair.countDocuments({ vertical: 'car_wash', pricingMode: 'fixed' })).toBe(3);
});

test('one price per vehicle type and package, no range', async () => {
  const { resolveReferencePrice } = require('../src/modules/repair/services/pricing.service');
  const quick = await resolveReferencePrice({ vertical: 'bike_wash', repairCode: 'bw_quick', brandCode: 'bw_scooter' });
  expect(quick.recommendedPaise).toBe(9900);
  const full = await resolveReferencePrice({ vertical: 'car_wash', repairCode: 'cw_full_clean', brandCode: 'cw_suv' });
  expect(full).toMatchObject({ minPaise: 99900, recommendedPaise: 99900, maxPaise: 99900 });
});
