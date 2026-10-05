/**
 * Search understands what people say: "bike puncture" finds the two-wheeler
 * puncture (not car tyres or unrelated typing problems), everyday names find
 * their service, typos are corrected honestly, and "corrected" is only shown
 * when something was actually corrected.
 */
const { startMongo, stopMongo } = require('./helpers');
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const Shop = require('../src/modules/shop/shop.model');
const search = require('../src/modules/search/search.service');
const { _forceRebuild } = require('../src/modules/search/search.corpus');

jest.setTimeout(60000);

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create({ code: 'vehicles', name: 'Vehicles' });
  await ServiceDomain.create({ code: 'electronics', name: 'Electronics' });
  await ServiceLine.create([
    { code: 'two_wheeler', name: '2-Wheeler', domainCode: 'vehicles', status: 'live', repairVertical: 'two_wheeler', customerPath: '/repair/two-wheeler' },
    { code: 'four_wheeler', name: '4-Wheeler', domainCode: 'vehicles', status: 'live', repairVertical: 'four_wheeler', customerPath: '/repair/four-wheeler' },
    { code: 'laptop_repair', name: 'Laptops', domainCode: 'electronics', status: 'live', repairVertical: 'laptop', customerPath: '/repair/laptop' },
  ]);
  const shop = await Shop.create({ phone: '9000000401', businessName: 'All Fix', ownerName: 'Ravi', isActive: true });
  for (const [domainCode, lineCode] of [['vehicles', 'two_wheeler'], ['vehicles', 'four_wheeler'], ['electronics', 'laptop_repair']]) {
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode, lineCode, status: 'approved' });
  }
  const [tw, fw, lt] = await ProblemCategory.create([
    { code: 'tw_tyres_wheels', name: 'Tyres & wheels', vertical: 'two_wheeler', isActive: true },
    { code: 'fw_tyres_wheels', name: 'Tyres & wheels', vertical: 'four_wheeler', isActive: true },
    { code: 'lt_keyboard', name: 'Keyboard', vertical: 'laptop', isActive: true },
  ]);
  await Problem.create([
    { code: 'tw_puncture', name: 'Puncture / flat tyre', vertical: 'two_wheeler', categoryId: tw._id, categoryCode: 'tw_tyres_wheels', isActive: true },
    { code: 'tw_slow_puncture', name: 'Slow puncture', vertical: 'two_wheeler', categoryId: tw._id, categoryCode: 'tw_tyres_wheels', isActive: true },
    { code: 'fw_flat_tyre', name: 'Flat tyre / puncture', vertical: 'four_wheeler', categoryId: fw._id, categoryCode: 'fw_tyres_wheels', isActive: true },
    { code: 'lt_wrong_characters', name: 'Keyboard typing wrong characters', vertical: 'laptop', categoryId: lt._id, categoryCode: 'lt_keyboard', isActive: true },
  ]);
  await _forceRebuild();
});
afterAll(stopMongo);

test('"bike puncture" finds the two-wheeler punctures only', async () => {
  const out = await search.search({ q: 'bike puncture' });
  expect(out.problems.map((p) => p.code)).toEqual(['two_wheeler:tw_puncture', 'two_wheeler:tw_slow_puncture']);
  expect(out.corrected).toBeNull();
  expect(out.problems[0]).toMatchObject({ vertical: 'two_wheeler', problemCode: 'tw_puncture' });
});

test('"puncture" alone shows both vehicles; "car puncture" only the car', async () => {
  const both = await search.search({ q: 'puncture' });
  expect(both.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['two_wheeler:tw_puncture', 'four_wheeler:fw_flat_tyre']));
  expect(both.problems.map((p) => p.code)).not.toContain('laptop_repair:lt_wrong_characters');
  const car = await search.search({ q: 'my car has a flat tyre' });
  expect(car.problems.map((p) => p.code)).toEqual(['four_wheeler:fw_flat_tyre']);
});

test('everyday names find the service; typos are corrected and said so', async () => {
  expect((await search.search({ q: 'scooty' })).services.map((s) => s.code)).toEqual(['two_wheeler']);
  const typo = await search.search({ q: 'bike punctre' });
  expect(typo.problems[0].code).toBe('two_wheeler:tw_puncture');
  expect(typo.corrected).toBe('bike puncture');
});
