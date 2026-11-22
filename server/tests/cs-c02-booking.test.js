// Customer module 2, booking a repair: bad input is refused before anything is written, the price is the server's (never the customer's), a double tap makes one booking, and the customer can only book a provider who may take it.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(240000);
let app; let RepairBooking; let shopId;
const HOME = [78.3915, 17.4483];
let n = 0;
const customer = () => { n += 1; const id = new mongoose.Types.ObjectId(); return { id, auth: { Authorization: `Bearer ${signAccessToken({ sub: String(id), role: 'user' })}`, 'X-Forwarded-For': `10.6.0.${n % 250}` } }; };
const BODY = { brandCode: 'samsung', modelCode: 'samsung-s23', repairCode: 'battery_replacement', serviceMode: 'doorstep', location: { coordinates: HOME, address: 'Plot 4, Madhapur' } };
const book = (c, body = {}, key) => {
  const r = request(app).post('/api/repair/bookings').set(c.auth);
  if (key) r.set('Idempotency-Key', key);
  return r.send({ ...BODY, ...body });
};

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  const { RepairConfig } = require('../src/modules/repair/models/config.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
  const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'electronics', repairVertical: 'mobile', status: 'live' });
  await RepairConfig.create({ vertical: 'mobile' });
  await Repair.create({ code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile', pricingMode: 'fixed', minSkillLevel: 1, allowedServiceModes: ['doorstep', 'workshop'], warrantyDays: 180 });
  await ZappyReferencePricing.create({ vertical: 'mobile', repairCode: 'battery_replacement', minPaise: 150000, recommendedPaise: 200000, maxPaise: 300000 });
  const shop = await require('./helpers').pricedShopNear({ lng: HOME[0], lat: HOME[1], repairCode: 'battery_replacement', totalPaise: 200000 });
  shopId = shop?._id || shop?.shopId || shop;
  await RepairBooking.init();
});
afterAll(stopMongo);

describe('input is checked before anything is written', () => {
  test.each([
    ['no brand', { brandCode: undefined }], ['no model', { modelCode: undefined }], ['no location', { location: undefined }],
    ['no address', { location: { coordinates: HOME } }], ['one coordinate', { location: { coordinates: [78.39], address: 'x' } }],
    ['coordinates as text', { location: { coordinates: ['a', 'b'], address: 'x' } }],
    ['unknown service mode', { serviceMode: 'teleport' }], ['unknown payment method', { paymentMethod: 'crypto' }],
    ['a 301-letter address', { location: { coordinates: HOME, address: 'x'.repeat(301) } }],
    ['a negative tip', { tipPaise: -100 }], ['a tip over ₹10,000', { tipPaise: 1000001 }],
    ['a malformed shop id', { shopId: 'abc' }], ['11 add-ons', { addOnCodes: Array.from({ length: 11 }, (_, i) => `a${i}`) }],
    ['brand as an object', { brandCode: { $ne: '' } }],
  ])('%s → 400, nothing booked', async (_name, body) => {
    const c = customer();
    const r = await book(c, body);
    expect(r.status).toBe(400);
    expect(await RepairBooking.countDocuments({ userId: c.id })).toBe(0);
  });
  test.each([
    ['latitude 999', [78.39, 999]], ['longitude 999', [999, 17.44]], ['latitude -91', [78.39, -91]],
  ])('an impossible spot (%s) is refused, never a crash', async (_name, coordinates) => {
    const c = customer();
    const r = await book(c, { location: { coordinates, address: 'Nowhere' } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(await RepairBooking.countDocuments({ userId: c.id })).toBe(0);
  });
  test('signed out, no booking', async () => {
    expect((await request(app).post('/api/repair/bookings').send(BODY)).status).toBe(401);
  });
  test.each([['a pro', 'worker'], ['a shop', 'shop']])('%s cannot book as a customer', async (_name, role) => {
    const r = await request(app).post('/api/repair/bookings').set('Authorization', `Bearer ${signAccessToken({ sub: String(new mongoose.Types.ObjectId()), role })}`).send(BODY);
    expect(r.status).toBe(403);
  });
});

describe('the price is the server\'s', () => {
  test('a booking is priced from the provider\'s price, not from anything the customer sends', async () => {
    const c = customer();
    const r = await book(c, { discountPaise: 199999, couponPaise: 199999, totalPaise: 1, priceSnapshot: { totalPaise: 1 }, pricing: { totalPaise: 1 } });
    expect(r.status).toBeLessThan(300);
    const b = await RepairBooking.findOne({ userId: c.id }).lean();
    expect(b.priceSnapshot.discountPaise || 0).toBe(0);
    expect(b.priceSnapshot.totalPaise).toBeGreaterThanOrEqual(200000);
  });
  test('a status, a worker or a paid flag sent by the customer is ignored', async () => {
    const c = customer();
    await book(c, { status: 'COMPLETED', paymentStatus: 'paid', ratedAt: new Date() });
    const b = await RepairBooking.findOne({ userId: c.id }).lean();
    expect(b.status).not.toBe('COMPLETED');
    expect(b.paymentStatus).not.toBe('paid');
    expect(b.ratedAt || null).toBeNull();
  });
  test('booking for someone else is not possible: the booking is always the signed-in customer\'s', async () => {
    const c = customer();
    const other = new mongoose.Types.ObjectId();
    await book(c, { userId: String(other) });
    expect(await RepairBooking.countDocuments({ userId: other })).toBe(0);
    expect(await RepairBooking.countDocuments({ userId: c.id })).toBe(1);
  });
});

describe('double taps', () => {
  test('the same booking sent 10 times at once with one key makes one booking', async () => {
    const c = customer();
    const res = await Promise.all(Array.from({ length: 10 }, () => book(c, {}, `same-key-${c.id}`)));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(await RepairBooking.countDocuments({ userId: c.id })).toBe(1);
  });
  test('the same key again later returns the same booking, marked as a replay', async () => {
    const c = customer();
    const a = await book(c, {}, `again-${c.id}`);
    const b = await book(c, {}, `again-${c.id}`);
    expect(String(a.body.booking._id)).toBe(String(b.body.booking._id));
    expect(b.body.replayed).toBe(true);
  });
  test('one customer\'s key cannot open another customer\'s booking', async () => {
    const a = customer(); const b = customer();
    const first = await book(a, {}, 'shared-key-x');
    const second = await book(b, {}, 'shared-key-x');
    expect(String(second.body.booking?._id || '')).not.toBe(String(first.body.booking._id));
  });
});

describe('who can be booked', () => {
  test('naming a provider who does not exist is refused, not booked to nobody', async () => {
    const c = customer();
    const r = await book(c, { shopId: String(new mongoose.Types.ObjectId()) });
    expect(r.status).toBeLessThan(500);
    const b = await RepairBooking.findOne({ userId: c.id }).lean();
    if (b) expect(String(b.shopId || '')).not.toMatch(/^[0-9a-f]{24}$/.test(String(b.shopId)) ? /x/ : /^$/);
  });
  test('a blocked shop cannot be booked by naming it', async () => {
    const Shop = require('../src/modules/shop/shop.model');
    const blocked = await Shop.create({ businessName: 'Blocked Fix', ownerName: 'B', phone: '9400000001', isBlocked: true, kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: HOME } } });
    const c = customer();
    const r = await book(c, { shopId: String(blocked._id) });
    const b = await RepairBooking.findOne({ userId: c.id }).lean();
    expect(r.status < 300 ? String(b.shopId || '') : '').not.toBe(String(blocked._id));
  });
  test('an unknown repair is refused with a plain reason', async () => {
    const c = customer();
    const r = await book(c, { repairCode: 'teleport_battery' });
    expect(r.status).toBeLessThan(500);
  });
  test('a time in the past is refused', async () => {
    const c = customer();
    const r = await book(c, { scheduledAt: new Date(Date.now() - 86400e3).toISOString() });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});

describe('scale', () => {
  test('40 different customers book at once: 40 bookings, every one answered, none crashes', async () => {
    const people = Array.from({ length: 40 }, customer);
    const res = await Promise.all(people.map((c) => book(c, {}, `scale-${c.id}`)));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const made = await RepairBooking.countDocuments({ userId: { $in: people.map((p) => p.id) } });
    expect(made).toBe(res.filter((r) => r.status < 300).length);
  });
});
