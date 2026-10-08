/**
 * Two supply models: a shop charges its own price; an individual (ZappyOne's
 * own provider) charges the ZappyOne standard, whatever they saved, and only
 * falls back to their own where no standard is set yet.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let pricing; let ZappyReferencePricing; let ProviderPricing;
const shopId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const ctx = { vertical: 'mobile', repairCode: 'battery_replacement', brandCode: 'samsung', modelCode: 'galaxy-s23', qualityCode: null };

beforeAll(async () => {
  await startMongo();
  ({ ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model'));
  pricing = require('../src/modules/repair/services/pricing.service');
  const own = { vertical: 'mobile', repairCode: 'battery_replacement', brandCode: 'samsung', totalPaise: 50000, approvalStatus: 'approved' };
  await ProviderPricing.create([{ ...own, shopId }, { ...own, workerId }]);
});
afterAll(stopMongo);

test('with no ZappyOne standard set, both use their own price', async () => {
  expect((await pricing.resolveProviderPrice(ctx, { shopId })).totalPaise).toBe(50000);
  expect((await pricing.resolveProviderPrice(ctx, { workerId })).totalPaise).toBe(50000);
});

test('once a standard is set, the individual charges it and the shop keeps its own', async () => {
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement', minPaise: 120000, recommendedPaise: 150000, maxPaise: 180000,
    partCostPaise: 110000, labourPaise: 40000,
  });
  expect((await pricing.resolveProviderPrice(ctx, { shopId })).totalPaise).toBe(50000);
  const individual = await pricing.resolveProviderPrice(ctx, { workerId });
  expect(individual.totalPaise).toBe(150000);
  expect(individual.resolutionPath).toMatch(/^standard:/);
  const options = await pricing.resolveProviderPriceOptions(ctx, { workerId });
  expect(options.map((o) => o.totalPaise)).toEqual([150000]);
});
