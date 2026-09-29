/**
 * Search is built from the live catalog and limited to where the customer is:
 *   - a problem opens its service's flow with that problem already chosen
 *   - a line that isn't live (or has no approved provider) never appears
 *   - no match says so; suggestions are labelled, not passed off as matches
 *   - where we don't serve, nothing bookable is offered
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const Shop = require('../src/modules/shop/shop.model');
const search = require('../src/modules/search/search.service');
const { _forceRebuild } = require('../src/modules/search/search.corpus');

jest.setTimeout(60000);

const MADHAPUR = { lat: 17.4483, lng: 78.3915 };
const FAR_AWAY = { lat: 28.6139, lng: 77.2090 };

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create({ code: 'electronics', name: 'Electronics' });
  await ServiceLine.create([
    { code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics', status: 'live', repairVertical: 'mobile', customerPath: '/repair' },
    // Live but nobody approved for it: must not be searchable.
    { code: 'laptop_repair', name: 'Laptops', domainCode: 'electronics', status: 'live', repairVertical: 'laptop', customerPath: '/repair/laptop' },
    // Not live at all.
    { code: 'tv_repair', name: 'Television Repair', domainCode: 'electronics', status: 'coming_soon', customerPath: '/repair/tv' },
  ]);
  const shop = await Shop.create({ phone: '9000000301', businessName: 'Madhapur Mobiles', ownerName: 'Ravi', isActive: true });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
  await ProviderServiceArea.create({
    shopId: shop._id, cityCode: 'hyderabad', isActive: true, serviceModes: ['doorstep'],
    center: { type: 'Point', coordinates: [MADHAPUR.lng, MADHAPUR.lat] }, radiusKm: 5,
  });
  const [display, body] = await ProblemCategory.create([
    { code: 'display', name: 'Display', vertical: 'mobile', isActive: true },
    { code: 'body', name: 'Body', vertical: 'laptop', isActive: true },
  ]);
  await Problem.create([
    { code: 'screen_cracked', name: 'Cracked screen', vertical: 'mobile', categoryId: display._id, categoryCode: 'display', isActive: true, isPopular: true },
    { code: 'laptop_hinge', name: 'Hinge broken', vertical: 'laptop', categoryId: body._id, categoryCode: 'body', isActive: true },
  ]);
  await _forceRebuild();
});
afterAll(stopMongo);
beforeEach(() => redis.flushall());

test('a problem opens its flow with the problem chosen', async () => {
  const out = await search.search({ q: 'cracked screen' });
  expect(out.problems[0]).toMatchObject({ title: 'Cracked screen', subtitle: 'Mobile Phones', path: '/repair?problem=screen_cracked' });
});

test('typos still find it', async () => {
  const out = await search.search({ q: 'crakced scren' });
  expect(out.problems.map((p) => p.title)).toContain('Cracked screen');
});

test('lines that are not live, or have nobody approved, never appear', async () => {
  const titles = (await search.search({ q: 'laptop hinge television' })).services.concat(
    (await search.search({ q: 'laptop hinge television' })).problems,
  ).map((r) => r.title);
  expect(titles).not.toContain('Laptops');
  expect(titles).not.toContain('Hinge broken');
  expect(titles).not.toContain('Television Repair');
});

test('no match is said plainly, with labelled suggestions', async () => {
  const out = await search.search({ q: 'zzqqxx' });
  expect(out.empty).toBe(true);
  expect(out.services).toHaveLength(0);
  expect(out.suggestions.map((s) => s.title)).toContain('Mobile Phones');
});

test('where we serve, results are limited to what is live there', async () => {
  const out = await search.search({ q: 'screen', ...MADHAPUR });
  expect(out.notHere).toBeFalsy();
  expect(out.problems.map((p) => p.title)).toContain('Cracked screen');
});

test('where we do not serve, nothing bookable is offered', async () => {
  const out = await search.search({ q: 'screen', ...FAR_AWAY });
  expect(out.notHere).toBe(true);
  expect(out.problems).toHaveLength(0);
  expect(await search.trending(FAR_AWAY)).toHaveLength(0);
});

test('suggest returns paths into the live flows', async () => {
  const s = await search.suggest({ q: 'crack' });
  expect(s[0]).toMatchObject({ title: 'Cracked screen', path: '/repair?problem=screen_cracked' });
  void mongoose;
});
