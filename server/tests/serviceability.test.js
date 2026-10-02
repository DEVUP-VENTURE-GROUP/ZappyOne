/**
 * Zepto-style serviceability: before anything is bookable, the customer's
 * point is checked against active zones and against real provider coverage.
 *   not_here   — outside every active zone, or nobody covers the point
 *   closed_now — covered, but every covering provider is offline or closed
 *   available  — covered by someone who can take work now
 */

const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
const Shop = require('../src/modules/shop/shop.model');
const Zone = require('../src/modules/zone/zone.model');
const zoneService = require('../src/modules/zone/zone.service');
const { serviceabilityAt } = require('../src/modules/onboarding/coverage.service');

jest.setTimeout(60000);

// Madhapur, and a point ~12 km away in Kukatpally.
const MADHAPUR = { lat: 17.4483, lng: 78.3915 };
const KUKATPALLY = { lat: 17.4849, lng: 78.4138 + 0.08 };
// Outside Telangana, the launch region.
const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const box = (lat, lng, d = 0.02) => ({
  type: 'Polygon',
  coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
});

let shop;
beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create({ code: 'repair', name: 'Repairs' });
  await ServiceLine.create({
    code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'repair', status: 'live',
    repairVertical: 'mobile', customerPath: '/repair',
  });
  shop = await Shop.create({ phone: '9000000101', businessName: 'Ravi Mobiles', ownerName: 'Ravi', isActive: true });
  await ProviderEnrolment.create({
    providerKind: 'shop', shopId: shop._id, domainCode: 'repair', lineCode: 'mobile_repair', status: 'approved',
  });
  await ProviderServiceArea.create({
    shopId: shop._id, cityCode: 'hyderabad', isActive: true, serviceModes: ['doorstep'],
    center: { type: 'Point', coordinates: [MADHAPUR.lng, MADHAPUR.lat] }, radiusKm: 5,
  });
});
afterAll(stopMongo);
beforeEach(async () => {
  await redis.flushall();
  await redis.del('zones:all');
});

test('a covered point is available, with the live service listed', async () => {
  const r = await serviceabilityAt(MADHAPUR);
  expect(r.status).toBe('available');
  expect(r.lines).toEqual([{ code: 'mobile_repair', openNow: true }]);
});

test('in Telangana, a point no provider reaches is coming_soon — services still show', async () => {
  const r = await serviceabilityAt(KUKATPALLY);
  expect(r.status).toBe('coming_soon');
  expect(r.region).toEqual({ code: 'telangana', name: 'Telangana' });
  expect(r.lines).toEqual([]);
});

test('outside the launch region, a point no provider reaches is not_here', async () => {
  const r = await serviceabilityAt(BENGALURU);
  expect(r.status).toBe('not_here');
  expect(r.region).toBeNull();
});

test('covered but closed: closed_now with the real next opening, in IST', async () => {
  const allDay = (day) => ({ day, opensAt: '08:00', closesAt: '08:01' });
  await Shop.updateOne({ _id: shop._id }, { $set: { hours: [0, 1, 2, 3, 4, 5, 6].map(allDay) } });
  // 02:00 IST is 20:30 UTC the previous day — a UTC clock would get the day wrong.
  jest.useFakeTimers({ now: new Date('2026-09-28T20:30:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  try {
    const r = await serviceabilityAt(MADHAPUR);
    expect(r.status).toBe('closed_now');
    expect(r.nextOpening).toMatchObject({ opensAt: '08:00', daysAhead: 0 });
  } finally {
    jest.useRealTimers();
    await Shop.updateOne({ _id: shop._id }, { $set: { hours: [] } });
  }
});

test('a blocked provider covers nothing', async () => {
  await Shop.updateOne({ _id: shop._id }, { $set: { isBlocked: true } });
  try {
    expect((await serviceabilityAt(MADHAPUR)).status).toBe('coming_soon');
  } finally {
    await Shop.updateOne({ _id: shop._id }, { $set: { isBlocked: false } });
  }
});

describe('once an admin draws an active zone', () => {
  beforeAll(async () => {
    await Zone.create({ name: 'Madhapur', city: 'Hyderabad', status: 'active', polygon: box(MADHAPUR.lat, MADHAPUR.lng) });
  });

  test('outside every zone but in Telangana is coming_soon, and lists the areas we do serve', async () => {
    const r = await serviceabilityAt(KUKATPALLY);
    expect(r).toMatchObject({ status: 'coming_soon', areas: [{ name: 'Madhapur', city: 'Hyderabad' }] });
  });

  test('outside every zone and outside the launch region is not_here', async () => {
    expect((await serviceabilityAt(BENGALURU)).status).toBe('not_here');
  });

  test('inside the zone and covered is available', async () => {
    expect((await serviceabilityAt(MADHAPUR)).status).toBe('available');
  });

  test('bookings outside active zones are refused, for any location shape', async () => {
    await expect(zoneService.assertBookableLocation({ type: 'Point', coordinates: [KUKATPALLY.lng, KUKATPALLY.lat] }))
      .rejects.toMatchObject({ code: 'OUTSIDE_SERVICE_AREA' });
    await expect(zoneService.assertBookableLocation(KUKATPALLY)).rejects.toMatchObject({ code: 'OUTSIDE_SERVICE_AREA' });
    await expect(zoneService.assertBookableLocation(MADHAPUR)).resolves.toBeUndefined();
  });
});
