// Live services charge one price: water tank seeds as single figures, and the prod script collapses any old range to its recommended price.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WATER_TANK_CARE_PRICING } = require('../src/modules/repair/seed/reference-pricing.seed');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { singlePrices } = require('../scripts/single-prices');

jest.setTimeout(60000);
let server;
beforeAll(async () => { server = await MongoMemoryServer.create(); await mongoose.connect(`${server.getUri()}single`); });
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

test('every water tank row is one price', () => {
  for (const r of WATER_TANK_CARE_PRICING) expect([r.min, r.max]).toEqual([r.typical, r.typical]);
});

test('script collapses live ranges and leaves hidden verticals alone', async () => {
  const base = { repairCode: 'x', brandCode: null, modelCode: null, qualityCode: null, serviceMode: null, cityCode: null, supersededAt: null, isActive: true };
  await ZappyReferencePricing.collection.insertMany([
    { ...base, vertical: 'water_tank_care', minPaise: 24900, recommendedPaise: 34900, maxPaise: 49900 },
    { ...base, vertical: 'mobile', minPaise: 100, recommendedPaise: 200, maxPaise: 300 },
  ]);
  expect(await singlePrices()).toBe(1);
  expect(await singlePrices()).toBe(0);
  const water = await ZappyReferencePricing.findOne({ vertical: 'water_tank_care' }).lean();
  expect([water.minPaise, water.maxPaise]).toEqual([34900, 34900]);
  expect((await ZappyReferencePricing.findOne({ vertical: 'mobile' }).lean()).minPaise).toBe(100);
});
