// ServicePro module 4, the menu: prices, durations, names and photos are checked, a pro touches only their own jobs, and a mass price change stays in bounds.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const LAT = 17.44; const LNG = 78.39;
const V = 'daily_cleaning';
let app; let shop; let other; let menuSvc;
const auth = (s) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(s._id), role: 'shop' })}` });
const put = (s, body) => request(app).put('/api/repair/provider/menu/item').set(auth(s)).send({ vertical: V, ...body });
const PHOTO = 'menu/shop1/abc-123.jpg';

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  menuSvc = require('../src/modules/repair/services/provider-menu.service');
  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const make = async (name, phone) => {
    const s = await Shop.create({ businessName: name, ownerName: 'Owner', phone, isActive: true, kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: [LNG, LAT] } }, services: [V] });
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: V, status: 'approved' });
    await ProviderServiceArea.create({ shopId: s._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 15, serviceModes: ['doorstep'] });
    return s;
  };
  shop = await make('Menu Shop', '9100000001');
  other = await make('Other Shop', '9100000002');
});
afterAll(stopMongo);

describe('saving a job of their own: input', () => {
  test.each([
    ['no name', { prices: { daicle_2bhk: 40000 }, photoKeys: [PHOTO] }, 'NAME_REQUIRED'],
    ['a 1-letter name', { name: 'A', prices: { daicle_2bhk: 40000 }, photoKeys: [PHOTO] }, 'NAME_REQUIRED'],
    ['no price at all', { name: 'Deep clean', prices: {}, photoKeys: [PHOTO] }, 'PRICE_REQUIRED'],
    ['only blank prices', { name: 'Deep clean', prices: { daicle_2bhk: null }, photoKeys: [PHOTO] }, 'PRICE_REQUIRED'],
    ['a price under ₹1', { name: 'Deep clean', prices: { daicle_2bhk: 50 }, photoKeys: [PHOTO] }, 'BAD_PRICE'],
    ['no photo', { name: 'Deep clean', prices: { daicle_2bhk: 40000 } }, 'PHOTO_REQUIRED'],
    ['a web link as the photo', { name: 'Deep clean', prices: { daicle_2bhk: 40000 }, photoKeys: ['https://evil.example.com/x.jpg'] }, 'BAD_PHOTO'],
    ['a path that climbs out', { name: 'Deep clean', prices: { daicle_2bhk: 40000 }, photoKeys: ['menu/../kyc/id.jpg'] }, 'BAD_PHOTO'],
    ['a script as the photo', { name: 'Deep clean', prices: { daicle_2bhk: 40000 }, photoKey: 'javascript:alert(1)' }, 'BAD_PHOTO'],
  ])('%s → refused (%s)', async (_name, body, code) => {
    const r = await put(shop, body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(r.body.code).toBe(code);
  });
  test.each([
    ['minutes 4', { minutes: 4 }], ['minutes 1441', { minutes: 1441 }], ['minutes as text', { minutes: 'soon' }],
    ['a price of ₹10 crore and one paisa', { prices: { daicle_2bhk: 100000001 } }], ['a negative price', { prices: { daicle_2bhk: -100 } }],
    ['a decimal price', { prices: { daicle_2bhk: 400.5 } }], ['13 includes', { includes: Array.from({ length: 13 }, (_, i) => `item ${i}`) }],
    ['an 81-letter name', { name: 'x'.repeat(81) }], ['7 photos', { photoKeys: Array.from({ length: 7 }, (_, i) => `menu/u/${i}.jpg`) }],
    ['an unknown service', { vertical: 'teleportation!' }],
  ])('%s → 400', async (_name, extra) => {
    const r = await put(shop, { name: 'Deep clean', prices: { daicle_2bhk: 40000 }, photoKeys: [PHOTO], ...extra });
    expect(r.status).toBe(400);
  });
  test('a price for a home size that does not exist is ignored, not stored', async () => {
    const r = await put(shop, { name: 'Window wash', prices: { daicle_2bhk: 30000, castle_99bhk: 999900 }, photoKeys: [PHOTO] });
    expect(r.status).toBe(200);
    const item = r.body.items.find((i) => i.name === 'Window wash');
    expect(item.prices.castle_99bhk).toBeUndefined();
  });
});

describe('a good job goes live, and edits keep what was saved', () => {
  let code;
  test('saved with a price and a photo, it is offered at once', async () => {
    const r = await put(shop, { name: 'Kitchen deep clean', minutes: 120, includes: ['Chimney', 'Tiles'], prices: { daicle_2bhk: 149900 }, photoKeys: [PHOTO, 'menu/shop1/second.jpg'] });
    expect(r.status).toBe(200);
    const item = r.body.items.find((i) => i.name === 'Kitchen deep clean');
    expect(item).toMatchObject({ own: true, offered: true, photoKey: PHOTO });
    code = item.repairCode;
  });
  test('editing without sending photos keeps the saved ones', async () => {
    const r = await put(shop, { repairCode: code, name: 'Kitchen deep clean', prices: { daicle_2bhk: 159900 } });
    expect(r.status).toBe(200);
    expect(r.body.items.find((i) => i.repairCode === code).photoKeys).toEqual([PHOTO, 'menu/shop1/second.jpg']);
  });
  test('a photo saved before the new rule (any form) can still be sent back on edit', async () => {
    const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
    await ProviderCapability.updateOne({ shopId: shop._id, repairCode: code }, { $set: { photoKeys: ['legacy-photo-from-old-app.jpg'], photoKey: 'legacy-photo-from-old-app.jpg' } });
    const r = await put(shop, { repairCode: code, name: 'Kitchen deep clean', prices: { daicle_2bhk: 159900 }, photoKeys: ['legacy-photo-from-old-app.jpg'] });
    expect(r.status).toBe(200);
  });
  test('the same price sent again changes nothing', async () => {
    const r = await put(shop, { repairCode: code, name: 'Kitchen deep clean', prices: { daicle_2bhk: 159900 } });
    expect(r.status).toBe(200);
  });
  test('a blank price takes that option off; no prices takes the job off the menu', async () => {
    const r = await put(shop, { repairCode: code, name: 'Kitchen deep clean', prices: { daicle_2bhk: null } });
    expect(r.body.items.find((i) => i.repairCode === code).offered).toBe(false);
  });
});

describe('only their own jobs', () => {
  let code;
  beforeAll(async () => {
    const r = await put(other, { name: 'Other private job', prices: { daicle_2bhk: 50000 }, photoKeys: ['menu/o/1.jpg'] });
    code = r.body.items.find((i) => i.name === 'Other private job').repairCode;
  });
  test('another shop cannot edit it', async () => {
    const r = await put(shop, { repairCode: code, name: 'Hijacked', prices: { daicle_2bhk: 100 }, photoKeys: [PHOTO] });
    expect(r.status).toBe(404);
  });
  test('another shop cannot delete it', async () => {
    const r = await request(app).delete(`/api/repair/provider/menu/item/${code}?vertical=${V}`).set(auth(shop));
    expect(r.status).toBe(404);
    const theirs = await menuSvc.menu({ shopId: other._id, workerId: null }, V);
    expect(theirs.items.find((i) => i.repairCode === code).offered).toBe(true);
  });
  test('another shop never sees it on their menu', async () => {
    const mine = await menuSvc.menu({ shopId: shop._id, workerId: null }, V);
    expect(mine.items.find((i) => i.repairCode === code)).toBeUndefined();
  });
  test.each([['a customer', 'user'], ['no token', null]])('%s cannot touch any menu', async (_name, role) => {
    let req = request(app).put('/api/repair/provider/menu/item');
    if (role) req = req.set('Authorization', `Bearer ${signAccessToken({ sub: String(shop._id), role })}`);
    expect([401, 403]).toContain((await req.send({ vertical: V, name: 'x', prices: {} })).status);
  });
});

describe('raise or lower every price at once', () => {
  test.each([[-51], [101], [0], ['ten']])('%s%% is refused', async (pct) => {
    const r = await request(app).post('/api/repair/provider/menu/adjust').set(auth(shop)).send({ vertical: V, pct });
    expect(r.status).toBe(400);
  });
  test('+10% moves every live price up, rounded to the rupee', async () => {
    const r1 = await put(shop, { name: 'Sofa clean', prices: { daicle_2bhk: 99900 }, photoKeys: [PHOTO] });
    const code = r1.body.items.find((i) => i.name === 'Sofa clean').repairCode;
    const r = await request(app).post('/api/repair/provider/menu/adjust').set(auth(shop)).send({ vertical: V, pct: 10 });
    expect(r.status).toBe(200);
    const price = r.body.items.find((i) => i.repairCode === code).prices.daicle_2bhk;
    expect(price % 100).toBe(0);
    expect(price).toBe(109900);
  });
  test('-50% never takes a price under ₹1', async () => {
    const r = await request(app).post('/api/repair/provider/menu/adjust').set(auth(shop)).send({ vertical: V, pct: -50 });
    expect(r.status).toBe(200);
    for (const item of r.body.items) for (const p of Object.values(item.prices || {})) if (p != null) expect(p).toBeGreaterThanOrEqual(100);
  });
});

describe('scale', () => {
  test('a pro saving the same job 15 times at once ends with one job, not 15', async () => {
    const before = (await menuSvc.menu({ shopId: shop._id, workerId: null }, V)).items.length;
    const first = await put(shop, { name: 'Bathroom clean', prices: { daicle_2bhk: 49900 }, photoKeys: [PHOTO] });
    const code = first.body.items.find((i) => i.name === 'Bathroom clean').repairCode;
    const res = await Promise.all(Array.from({ length: 15 }, (_, i) => put(shop, { repairCode: code, name: 'Bathroom clean', prices: { daicle_2bhk: 49900 + i * 100 } })));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const after = await menuSvc.menu({ shopId: shop._id, workerId: null }, V);
    expect(after.items.filter((i) => i.name === 'Bathroom clean')).toHaveLength(1);
    expect(after.items.length).toBe(before + 1);
  });
});
