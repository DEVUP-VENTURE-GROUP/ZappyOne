// A provider's own menu for a fixed-price service: start from the samples, add jobs of their own with what is included and a photo, a price per home size live at once, raise all prices, take a job off; own jobs show only on their storefront and nobody else can touch them.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
const LAT = 17.44; const LNG = 78.39;
const V = 'daily_cleaning';
let menu; let shop; let other;
const actor = (s) => ({ role: 'shop', id: String(s._id) });
const own = (s) => ({ shopId: s._id, workerId: null });

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  menu = require('../src/modules/repair/services/provider-menu.service');
  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const make = async (name, phone) => {
    const s = await Shop.create({ businessName: name, ownerName: 'Owner', phone, isActive: true, kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: [LNG, LAT] } }, services: ['daily_cleaning'] });
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
    await ProviderServiceArea.create({ shopId: s._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 15, serviceModes: ['doorstep'] });
    return s;
  };
  shop = await make('Sparkle Helpers', '9000000801');
  other = await make('Other Helpers', '9000000802');
});
afterAll(stopMongo);

test('a fixed-price service is a menu; a phone repair is not', async () => {
  expect(await menu.isMenuService(V)).toBe(true);
  expect(await menu.isMenuService('mobile')).toBe(false);
});

test('the starter menu shows sample jobs with suggested starting prices, nothing offered until they choose', async () => {
  const m = await menu.menu(own(shop), V);
  expect(m.types.map((t) => t.code)).toEqual(expect.arrayContaining(['daicle_1bhk', 'daicle_2bhk']));
  const full = m.items.find((i) => i.repairCode === 'daicle_full_daily');
  expect(full).toMatchObject({ own: false, offered: false });
  expect(full.suggested.daicle_2bhk).toBe(44900);
  expect(full.prices.daicle_2bhk).toBeNull();
  expect(m.tips).toContain('Add at least one job with a price');
});

test('using the samples prices every sample at the suggestion; editing one changes only that job, live at once', async () => {
  let m = await menu.useSamples(own(shop), V, actor(shop));
  expect(m.items.filter((i) => !i.own).every((i) => i.offered)).toBe(true);
  m = await menu.saveItem(own(shop), V, { repairCode: 'daicle_full_daily', includes: ['Sweep', 'Mop', 'Dust', 'Sweep'], minutes: 80, prices: { daicle_1bhk: 39900, daicle_2bhk: 49900, daicle_3bhk: null, daicle_4bhk: null } }, actor(shop));
  const full = m.items.find((i) => i.repairCode === 'daicle_full_daily');
  expect(full).toMatchObject({ offered: true, includes: ['Sweep', 'Mop', 'Dust'], minutes: 80 });
  expect(full.prices).toMatchObject({ daicle_1bhk: 39900, daicle_2bhk: 49900, daicle_3bhk: null });
});

test('a job of their own: on their storefront and in the flow from it, never in the shared list or for anyone else', async () => {
  const m = await menu.saveItem(own(shop), V, { name: 'Fridge inside clean', includes: ['Shelves', 'Trays'], minutes: 45, photoKey: 'menu/fridge.jpg', prices: { daicle_2bhk: 29900 } }, actor(shop));
  const job = m.items.find((i) => i.own);
  expect(job).toMatchObject({ name: 'Fridge inside clean', offered: true, includes: ['Shelves', 'Trays'], photoKey: 'menu/fridge.jpg' });
  expect((await menu.menu(own(other), V)).items.some((i) => i.repairCode === job.repairCode)).toBe(false);
  await expect(menu.saveItem(own(other), V, { repairCode: job.repairCode, prices: { daicle_2bhk: 100 } }, actor(other))).rejects.toMatchObject({ code: 'UNKNOWN_JOB' });

  const { storefrontMenu } = require('../src/modules/repair/services/storefront.service');
  const front = await storefrontMenu({ kind: 'shop', id: String(shop._id), vertical: V });
  const item = front.items.find((i) => i.repairCode === job.repairCode);
  expect(item).toMatchObject({ name: 'Fridge inside clean', fromPaise: 29900 });

  const { listProblems } = require('../src/modules/repair/controllers/catalog.controller');
  const DeviceModel = require('../src/modules/service/device-model.model');
  const model = await DeviceModel.findOne({ brandCode: 'daicle_2bhk' }).lean();
  const codes = async (query) => {
    let body;
    await listProblems({ query: { vertical: V, modelCode: model.code, ...query } }, { json: (b) => { body = b; } }, (e) => { throw e; });
    return body.categories.flatMap((c) => c.problems).map((p) => p.code);
  };
  expect(await codes({})).not.toContain(`${job.repairCode}_req`);
  expect(await codes({ provider: `shop:${shop._id}` })).toContain(`${job.repairCode}_req`);
  expect(await codes({ provider: `shop:${other._id}` })).not.toContain(`${job.repairCode}_req`);

  // A customer books it from the storefront at the provider's own price.
  const { createBooking } = require('../src/modules/repair/services/booking.service');
  const { booking } = await createBooking({
    userId: new mongoose.Types.ObjectId(), vertical: V, brandCode: 'daicle_2bhk', modelCode: model.code,
    problemCodes: [`${job.repairCode}_req`], repairCode: job.repairCode, serviceMode: 'doorstep', paymentMethod: 'cash', shopId: shop._id,
    location: { coordinates: [LNG, LAT], address: '12 Kondapur Main Road', cityCode: 'hyderabad' }, idempotencyKey: 'menu-own-1',
  });
  expect(booking.priceSnapshot.totalPaise).toBeGreaterThanOrEqual(29900);
  expect(String(booking.shopId)).toBe(String(shop._id));
});

test('raise every price by a percentage, rounded to the rupee; take a job off', async () => {
  let m = await menu.adjustAll(own(shop), V, 10, actor(shop));
  expect(m.items.find((i) => i.repairCode === 'daicle_full_daily').prices.daicle_2bhk).toBe(54900);
  await expect(menu.adjustAll(own(shop), V, 500, actor(shop))).rejects.toMatchObject({ code: 'BAD_PERCENT' });
  const job = m.items.find((i) => i.own);
  m = await menu.removeItem(own(shop), V, job.repairCode);
  expect(m.items.some((i) => i.repairCode === job.repairCode)).toBe(false);
  m = await menu.removeItem(own(shop), V, 'daicle_dusting');
  expect(m.items.find((i) => i.repairCode === 'daicle_dusting')).toMatchObject({ offered: false });
});

test('a new job needs a name and a price', async () => {
  await expect(menu.saveItem(own(shop), V, { name: 'x', prices: { daicle_2bhk: 10000 } }, actor(shop))).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  await expect(menu.saveItem(own(shop), V, { name: 'Window wash', prices: {} }, actor(shop))).rejects.toMatchObject({ code: 'PRICE_REQUIRED' });
  await expect(menu.menu(own(shop), 'mobile')).rejects.toMatchObject({ code: 'NOT_A_MENU_SERVICE' });
  expect(mongoose.Types.ObjectId.isValid(String(shop._id))).toBe(true);
});

test('one search across nearby menus finds matching jobs from every provider pricing them, cheapest first, and nothing far away', async () => {
  const { searchMenus } = require('../src/modules/repair/services/storefront.service');
  await menu.saveItem(own(other), V, { repairCode: 'daicle_full_daily', prices: { daicle_2bhk: 42900 } }, actor(other));
  const near = await searchMenus({ q: 'daily clean', lat: LAT, lng: LNG });
  const names = near.items.filter((i) => i.repairCode === 'daicle_full_daily').map((i) => i.provider.name);
  expect(names).toEqual(expect.arrayContaining(['Sparkle Helpers', 'Other Helpers']));
  const prices = near.items.map((i) => i.fromPaise);
  expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  expect(near.items[0].path).toMatch(/^\/storefront\/shop\/[a-f0-9]{24}\?service=daily_cleaning$/);
  expect((await searchMenus({ q: 'daily clean', lat: 12.97, lng: 77.59 })).items).toEqual([]);
  expect((await searchMenus({ q: 'd', lat: LAT, lng: LNG })).items).toEqual([]);
});
