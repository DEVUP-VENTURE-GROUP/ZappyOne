// Zomato-style browsing: storefronts verified and priced for a service near the customer, sorted the way they choose, and each storefront's menu linking into the booking flow with that provider chosen.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
const LAT = 17.44; const LNG = 78.39;
let svc; const shops = [];

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderPricing } = require('../src/modules/repair/models/pricing.model');
  const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
  svc = require('../src/modules/repair/services/storefront.service');
  const make = async (name, phone, { approved = true, price = 1199, rating = 0, reviewCount = 0, completedJobs = 0, km = 0 }) => {
    const shop = await Shop.create({ businessName: name, ownerName: 'Owner', phone, isActive: true, partnerType: 'agency', rating, reviewCount, completedJobs, kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: [LNG + km / 100, LAT] } }, services: ['pest_control'] });
    if (approved) await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'specialist_home', lineCode: 'pest_control', status: 'approved' });
    await ProviderServiceArea.create({ shopId: shop._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG + km / 100, LAT] }, radiusKm: 15, serviceModes: ['doorstep'] });
    for (const repairCode of ['pescon_general', 'pescon_cockroach']) await ProviderCapability.create({ shopId: shop._id, vertical: 'pest_control', repairCode, isActive: true });
    await ProviderPricing.create({ shopId: shop._id, vertical: 'pest_control', repairCode: 'pescon_general', brandCode: 'pescon_2bhk', totalPaise: price * 100, approvalStatus: 'approved' });
    await ProviderPricing.create({ shopId: shop._id, vertical: 'pest_control', repairCode: 'pescon_cockroach', brandCode: 'pescon_2bhk', totalPaise: 79900, approvalStatus: 'approved' });
    await ProviderPricing.create({ shopId: shop._id, vertical: 'pest_control', repairCode: 'pescon_general', brandCode: 'pescon_3bhk', totalPaise: 149900, approvalStatus: 'pending' });
    shops.push(shop);
    return shop;
  };
  await make('Safe Home Pest Care', '9000000101', { price: 1099, rating: 4.8, reviewCount: 120, completedJobs: 300, km: 3 });
  await make('Quick Kill Pest', '9000000102', { price: 899, km: 1 });
  await make('Unverified Pest Co', '9000000103', { approved: false, price: 499 });
});
afterAll(stopMongo);

test('only verified, live, priced storefronts covering the address are listed, sorted as asked', async () => {
  const best = await svc.listStorefronts({ vertical: 'pest_control', lat: LAT, lng: LNG });
  expect(best.items.map((i) => i.name).sort()).toEqual(['Quick Kill Pest', 'Safe Home Pest Care']);
  expect(best.items[0].name).toBe('Safe Home Pest Care');
  expect(best.items.find((i) => i.name === 'Quick Kill Pest')).toMatchObject({ kind: 'shop', partnerType: 'agency', fromPaise: 79900, jobs: 2, rating: null });
  const cheap = await svc.listStorefronts({ vertical: 'pest_control', lat: LAT, lng: LNG, sort: 'nearest' });
  expect(cheap.items[0].name).toBe('Quick Kill Pest');
  expect((await svc.listStorefronts({ vertical: 'pest_control', lat: 12.97, lng: 77.59 })).items).toEqual([]);
});

test('a storefront menu shows only approved prices and links into the flow with that provider chosen', async () => {
  const menu = await svc.storefrontMenu({ kind: 'shop', id: String(shops[1]._id), vertical: 'pest_control' });
  expect(menu.items.map((i) => i.name)).toEqual(['Cockroach gel treatment', 'General pest control']);
  const general = menu.items.find((i) => i.repairCode === 'pescon_general');
  expect(general.options).toHaveLength(1);
  expect(general.options[0]).toMatchObject({ typeName: '2 BHK', totalPaise: 89900 });
  const url = new URL(general.options[0].path, 'https://x');
  expect(url.pathname).toBe('/repair/pest-control');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ brand: 'pescon_2bhk', problem: 'pescon_general_req', provider: `shop:${shops[1]._id}` });
  expect(url.searchParams.get('model')).toBeTruthy();
  expect(await svc.storefrontMenu({ kind: 'hacker', id: 'x', vertical: 'pest_control' })).toBeNull();
});
