/**
 * Every provider, shop or individual, charges its own price; a ZappyOne
 * standard never replaces it. Only ZappyOne's own salaried staff charge the
 * standard.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let pricing; let ZappyReferencePricing; let ProviderPricing;
const shopId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const staffId = new mongoose.Types.ObjectId();
const ctx = { vertical: 'mobile', repairCode: 'battery_replacement', brandCode: 'samsung', modelCode: 'galaxy-s23', qualityCode: null };

beforeAll(async () => {
  await startMongo();
  ({ ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model'));
  pricing = require('../src/modules/repair/services/pricing.service');
  const own = { vertical: 'mobile', repairCode: 'battery_replacement', brandCode: 'samsung', totalPaise: 50000, approvalStatus: 'approved' };
  await ProviderPricing.create([{ ...own, shopId }, { ...own, workerId }]);
  await mongoose.connection.collection('workers').insertMany([
    { _id: workerId, name: 'Ravi', phone: '9000000711', employment: { type: 'independent' } },
    { _id: staffId, name: 'Staff One', phone: '9000000712', employment: { type: 'staff' } },
  ]);
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement', minPaise: 120000, recommendedPaise: 150000, maxPaise: 180000,
    partCostPaise: 110000, labourPaise: 40000,
  });
});
afterAll(stopMongo);

test('a shop and an individual both charge their own price, even with a ZappyOne standard set', async () => {
  expect((await pricing.resolveProviderPrice(ctx, { shopId })).totalPaise).toBe(50000);
  expect((await pricing.resolveProviderPrice(ctx, { workerId })).totalPaise).toBe(50000);
  expect((await pricing.resolveProviderPriceOptions(ctx, { workerId })).map((o) => o.totalPaise)).toEqual([50000]);
});

test('ZappyOne staff charge the standard', async () => {
  const staff = await pricing.resolveProviderPrice(ctx, { workerId: staffId });
  expect(staff.totalPaise).toBe(150000);
  expect(staff.resolutionPath).toMatch(/^standard:/);
});

test('an individual with no price of their own has none: no standard stands in', async () => {
  const other = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('workers').insertOne({ _id: other, name: 'New Pro', phone: '9000000713', employment: { type: 'independent' } });
  expect(await pricing.resolveProviderPrice(ctx, { workerId: other })).toBeNull();
  expect(await pricing.resolveProviderPriceOptions(ctx, { workerId: other })).toEqual([]);
});

test('a service ZappyOne staff do keeps ZappyOne\'s price on offer near the customer, with no partner priced', async () => {
  const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'electronics', repairVertical: 'mobile', status: 'live', staffDoes: true });
  const flags = require('../src/modules/feature-flags/feature-flag.service');
  const ask = () => pricing.nearbyPriceMap({ vertical: 'mobile', brandCode: 'samsung', modelCode: 'galaxy-s23' }, ['battery_replacement'], { lat: 17.44, lng: 78.39 });
  // Version 1: own staff are off, so only partners' own prices count.
  await flags.set('own_staff', false, null);
  expect((await ask()).has('battery_replacement')).toBe(false);
  await flags.set('own_staff', true, null);
  expect((await ask()).get('battery_replacement')).toBe(150000);
  await flags.set('own_staff', false, null);
});
