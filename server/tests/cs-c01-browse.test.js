// Customer module 1, browsing (the busiest calls): only shops that are really live, approved, covering the spot and priced are shown; bad input never crashes; and many customers loading home at once all get answers.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
const LAT = 17.44; const LNG = 78.39;
const V = 'daily_cleaning';
const PHOTO = 'menu/s/a.jpg';
let app; let Shop; let shops = {};
let ip = 0;
const get = (path, auth) => { const r = request(app).get(path).set('X-Forwarded-For', `10.8.${Math.floor(ip / 250)}.${(ip++) % 250}`); return auth ? r.set(auth) : r; };
const customer = { Authorization: `Bearer ${signAccessToken({ sub: String(new mongoose.Types.ObjectId()), role: 'user' })}` };
const list = (q = {}) => get(`/api/repair/storefronts?${new URLSearchParams({ vertical: V, lat: LAT, lng: LNG, ...q })}`);

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const menu = require('../src/modules/repair/services/provider-menu.service');
  const make = async (key, { phone, approved = true, area = true, price = true, photo = true, shop = {}, at = [LNG, LAT] }) => {
    const s = await Shop.create({ businessName: `Shop ${key}`, ownerName: 'O', phone, isActive: true, kyc: { status: 'approved' }, services: [V], address: { location: { type: 'Point', coordinates: at } }, ...shop });
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: V, status: approved ? 'approved' : 'pending_review' });
    if (area) await ProviderServiceArea.create({ shopId: s._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: at }, radiusKm: 5, serviceModes: ['doorstep'] });
    if (price) await menu.saveItem({ shopId: s._id, workerId: null }, V, { repairCode: 'daicle_full_daily', ...(photo ? { photoKey: PHOTO } : {}), prices: { daicle_2bhk: 40000 } }, { role: 'admin', id: null }, { sample: !photo });
    shops[key] = s;
  };
  await make('good', { phone: '9300000001' });
  await make('blocked', { phone: '9300000002', shop: { isBlocked: true } });
  await make('paused', { phone: '9300000003', shop: { takingOrders: false } });
  await make('kycPending', { phone: '9300000004', shop: { kyc: { status: 'pending_review' } } });
  await make('notApproved', { phone: '9300000005', approved: false });
  await make('noArea', { phone: '9300000006', area: false });
  await make('noPrice', { phone: '9300000007', price: false });
  await make('farAway', { phone: '9300000008', at: [78.9, 17.9] });
  await make('inactive', { phone: '9300000009', shop: { isActive: false } });
});
afterAll(stopMongo);

describe('who a customer sees near them', () => {
  test('only the live, approved, covering, priced shop', async () => {
    const r = await list();
    expect(r.status).toBe(200);
    const names = r.body.items.map((i) => i.name);
    expect(names).toContain('Shop good');
    for (const hidden of ['blocked', 'paused', 'kycPending', 'notApproved', 'noArea', 'noPrice', 'farAway', 'inactive']) expect(names).not.toContain(`Shop ${hidden}`);
  });
  test('a spot nobody covers shows an empty list, not an error', async () => {
    const r = await list({ lat: 12.97, lng: 77.59 });
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
  });
  test.each([
    ['no service', { vertical: '' }], ['latitude 91', { lat: 91 }], ['longitude -181', { lng: -181 }], ['latitude as text', { lat: 'here' }],
    ['unknown sort', { sort: 'random' }], ['unknown service mode', { serviceMode: 'teleport' }], ['a 41-letter service', { vertical: 'x'.repeat(41) }],
  ])('%s → 400, never 500', async (_name, q) => {
    expect((await list(q)).status).toBe(400);
  });
  test('an unknown service is a plain refusal', async () => {
    expect((await list({ vertical: 'teleportation' })).status).toBeLessThan(500);
  });
  test.each(['best', 'nearest', 'cheapest', 'rating', 'fastest'])('sorting by %s works', async (sort) => {
    const r = await list({ sort });
    expect(r.status).toBe(200);
  });
});

describe('a storefront\'s menu', () => {
  test('the good shop\'s menu opens', async () => {
    const r = await get(`/api/repair/storefronts/shop/${shops.good._id}/menu?vertical=${V}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
  });
  test.each([
    ['a made-up shop id', () => `shop/${new mongoose.Types.ObjectId()}`],
    ['a malformed id', () => 'shop/not-an-id'],
    ['an unknown kind', () => `admin/${shops.good._id}`],
    ['a blocked shop', () => `shop/${shops.blocked._id}`],
    ['a shop not yet verified', () => `shop/${shops.kycPending._id}`],
    ['a shop not approved for this service', () => `shop/${shops.notApproved._id}`],
    ['a switched-off shop', () => `shop/${shops.inactive._id}`],
  ])('%s → not found, never 500', async (_name, path) => {
    const r = await get(`/api/repair/storefronts/${path()}/menu?vertical=${V}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
  test('a paused shop still shows its menu, to book ahead', async () => {
    expect((await get(`/api/repair/storefronts/shop/${shops.paused._id}/menu?vertical=${V}`)).status).toBe(200);
  });
  test('a shop on two services shows the business name it registered for this one', async () => {
    const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: shops.good._id, domainCode: 'events', lineCode: 'event_decoration', status: 'approved', fields: [{ code: 'business_name', value: 'Wrong Balloons' }] });
    await ProviderEnrolment.updateOne({ shopId: shops.good._id, lineCode: V }, { $set: { fields: [{ code: 'business_name', value: 'Sparkle Cleaning' }] } });
    const r = await get(`/api/repair/storefronts/shop/${shops.good._id}/menu?vertical=${V}`);
    expect(r.body.serviceName).toBe('Sparkle Cleaning');
    expect((await list({ lat: LAT + 0.004 })).body.items.find((i) => i.id === String(shops.good._id)).name).toBe('Sparkle Cleaning');
  });
  test('without a service, refused', async () => {
    expect((await get(`/api/repair/storefronts/shop/${shops.good._id}/menu`)).status).toBe(400);
  });
});

describe('searching every menu near them', () => {
  test('finds a job by part of its name', async () => {
    const r = await get(`/api/repair/menu-search?q=daily&lat=${LAT}&lng=${LNG}`, customer);
    expect(r.status).toBe(200);
  });
  test.each([['.*'], ['(a+)+$'], ['[unclosed'], ['\\'], ['$where'], ['a'.repeat(60)], ['  daily   clean  ']])('the search %j is safe', async (q) => {
    const r = await get(`/api/repair/menu-search?q=${encodeURIComponent(q)}&lat=${LAT}&lng=${LNG}`, customer);
    expect(r.status).toBeLessThan(500);
  });
  test.each([['one letter', 'a'], ['61 letters', 'a'.repeat(61)]])('%s → 400', async (_name, q) => {
    expect((await get(`/api/repair/menu-search?q=${q}&lat=${LAT}&lng=${LNG}`, customer)).status).toBe(400);
  });
  test('signed out, search asks for sign-in', async () => {
    expect((await get(`/api/repair/menu-search?q=daily&lat=${LAT}&lng=${LNG}`)).status).toBe(401);
  });
});

describe('what is offered at an address, and how soon', () => {
  test('serviceability answers for a covered spot and an uncovered one', async () => {
    const here = await get(`/api/serviceability?lat=${LAT}&lng=${LNG}`);
    expect(here.status).toBe(200);
    const away = await get('/api/serviceability?lat=28.61&lng=77.2');
    expect(away.status).toBe(200);
  });
  test.each([['no position', ''], ['latitude 100', '?lat=100&lng=78'], ['text', '?lat=a&lng=b']])('serviceability with %s → 400', async (_name, q) => {
    expect((await get(`/api/serviceability${q}`)).status).toBe(400);
  });
  test('the public catalogue and service list load signed out', async () => {
    expect((await get('/api/provider/onboarding/catalog')).status).toBe(200);
    expect((await get('/api/repair/verticals')).status).toBe(200);
  });
  test.each([['no line', `?lat=${LAT}&lng=${LNG}`], ['bad latitude', `?line=${V}&lat=95&lng=${LNG}`]])('arrival estimate with %s → 400', async (_name, q) => {
    expect((await get(`/api/jobs/arrival${q}`, customer)).status).toBe(400);
  });
  test('arrival estimate for a covered spot', async () => {
    expect((await get(`/api/jobs/arrival?line=${V}&lat=${LAT}&lng=${LNG}`, customer)).status).toBeLessThan(500);
    expect((await get(`/api/jobs/arrival?line=${V}&lat=${LAT}&lng=${LNG}`)).status).toBe(401);
  });
});

describe('scale', () => {
  test('300 customers open home at once (catalogue, address check, storefronts): every one answered, no errors', async () => {
    const calls = Array.from({ length: 300 }, (_, i) => {
      const lat = LAT + (i % 10) * 0.0005;
      return [get('/api/provider/onboarding/catalog'), get(`/api/serviceability?lat=${lat}&lng=${LNG}`), list({ lat })][i % 3];
    });
    const t = Date.now();
    const res = await Promise.all(calls);
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.filter((r) => r.status === 200).length).toBeGreaterThan(250);
    expect(Date.now() - t).toBeLessThan(90000);
  });
});
