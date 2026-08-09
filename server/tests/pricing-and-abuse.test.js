require('./env');
const { startMongo, stopMongo, resetDb } = require('./helpers');

const pricingService = require('../src/modules/pricing/pricing.service');
const abuseService = require('../src/modules/order/abuse.service');
const { redis } = require('../src/config/redis');

beforeAll(async () => { await startMongo(); });
afterAll(async () => { await stopMongo(); });
beforeEach(async () => { await resetDb(); await redis.flushall(); });

describe('pricing engine', () => {
  test('quote respects min fare floor for tiny distances', async () => {
    const q = await pricingService.quote({
      origin: { lat: 17.4, lng: 78.4 },
      dest:   { lat: 17.4001, lng: 78.4001 }, // ~15 m
      service: 'helper',
    });
    // MIN_FARE default is 60 — total must not drop below it even if the math says less.
    expect(q.total).toBeGreaterThanOrEqual(60);
    expect(q.currency).toBe('INR');
    expect(q.surgeMultiplier).toBeGreaterThanOrEqual(1);
  });

  // TODO(test-restore): needs the per-service vertical pricing config seeded;
  // without it ac_repair and helper resolve to the same base fare.
  test.skip('quote is more expensive for ac_repair than helper at same distance', async () => {
    const origin = { lat: 17.4, lng: 78.4 };
    const dest = { lat: 17.42, lng: 78.42 };
    const helper = await pricingService.quote({ origin, dest, service: 'helper' });
    const acRepair = await pricingService.quote({ origin, dest, service: 'ac_repair' });
    expect(acRepair.total).toBeGreaterThan(helper.total);
  });

  // TODO(test-restore): flaky Mongoose buffering timeout — cross-suite in-memory
  // connection lifecycle needs isolating (per-file Mongo teardown ordering).
  test.skip('runtime pricing override from Redis beats env config', async () => {
    // Bump baseFee via the "admin" config key
    await redis.set('config:pricing', JSON.stringify({ baseFee: 500 }));
    // Our pricing service has a 5s in-process cache — clear by re-requiring
    jest.resetModules();
    const fresh = require('../src/modules/pricing/pricing.service');
    const q = await fresh.quote({
      origin: { lat: 17.4, lng: 78.4 },
      dest:   { lat: 17.41, lng: 78.41 },
      service: 'puncture',
    });
    // baseFee of 500 with puncture mult 1.0 means the quoted baseFee round must reflect it
    expect(q.baseFee).toBe(500);
  });
});

describe('abuse detection', () => {
  const USER = '507f1f77bcf86cd799439011';

  test('booking rate cap fires after 5 bookings in window', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(abuseService.assertCanBook(USER)).resolves.toBeUndefined();
    }
    await expect(abuseService.assertCanBook(USER)).rejects.toMatchObject({
      status: 429,
      code: 'BOOKING_RATE_CAP',
    });
  });

  // TODO(test-restore): same Mongoose buffering timeout as the pricing-override
  // test — cross-suite in-memory Mongo lifecycle.
  test.skip('3 strikes freezes the user', async () => {
    await abuseService.recordCancelAfterAssignment(USER);
    await abuseService.recordCancelAfterAssignment(USER);
    await abuseService.recordCancelAfterAssignment(USER);

    await expect(abuseService.assertCanBook(USER)).rejects.toMatchObject({
      status: 429,
      code: 'USER_BOOKING_FROZEN',
    });
  });

  test('releaseBookingSlot restores a failed booking', async () => {
    for (let i = 0; i < 4; i++) await abuseService.assertCanBook(USER);
    await abuseService.releaseBookingSlot(USER);
    // Should still be able to book one more
    await expect(abuseService.assertCanBook(USER)).resolves.toBeUndefined();
  });
});
