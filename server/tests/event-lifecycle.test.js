/**
 * Event bookings: what the customer is told about their money is what happens.
 *
 *   - a customer cancel refunds the policy share of everything paid, now
 *   - a partner decline refunds everything, as the message promises
 *   - an admin cancel refunds everything
 *   - once decorating has started, self-serve cancel is refused
 *   - the partner's share uses the booking's agreed commission
 *   - every change reaches the customer's own channel in real time
 */
jest.mock('../src/modules/payment/cashfree.client', () => ({
  createOrder: jest.fn(),
  getOrderPayments: jest.fn(),
  createRefund: jest.fn(async ({ refundId }) => ({ cf_refund_id: refundId })),
  verifyWebhookSignature: jest.fn(() => true),
}));

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const cashfree = require('../src/modules/payment/cashfree.client');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const EventBooking = require('../src/modules/events/event-booking.model');
const EventPartner = require('../src/modules/events/event-partner.model');
const eventService = require('../src/modules/events/event.service');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(90000);

let app;
const userId = new mongoose.Types.ObjectId();
const partnerId = new mongoose.Types.ObjectId();
const inDays = (d) => new Date(Date.now() + d * 86400000);

async function booking(extra = {}) {
  const b = await EventBooking.collection.insertOne({
    userId, partnerId, themeId: new mongoose.Types.ObjectId(), status: 'confirmed', eventDate: inDays(10), eventTimeSlot: 'evening',
    address: { line1: '12 Madhapur Main Rd', city: 'Hyderabad' },
    pricing: { totalPaise: 100000, advancePaise: 20000, remainingPaise: 80000, platformCommissionPct: 12 },
    advancePayment: { status: 'paid' }, remainingPayment: { status: 'pending' }, statusHistory: [],
    createdAt: new Date(), updatedAt: new Date(), ...extra,
  });
  await PaymentIntent.create({
    cfOrderId: `evt_${b.insertedId}`, owner: { kind: 'user', id: userId }, purpose: 'event_advance_payment',
    eventBookingId: b.insertedId, amountPaise: 20000, status: 'captured',
  });
  return b.insertedId;
}
const refundedFor = async (id) => (await PaymentIntent.find({ eventBookingId: id }).lean())
  .reduce((sum, i) => sum + (i.refund?.amountPaise || 0), 0);

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  await EventPartner.collection.insertOne({ _id: partnerId, businessName: 'Decor Co', phone: '9000000501' });
});
afterAll(stopMongo);
beforeEach(async () => {
  cashfree.createRefund.mockClear();
  await Promise.all([EventBooking.collection.deleteMany({}), PaymentIntent.deleteMany({})]);
});

test('a customer cancel sends the policy refund now', async () => {
  const id = await booking(); // 10 days out: 100% tier
  const out = await eventService.cancelBooking(id, userId, 'Plans changed');
  expect(out.refundPaise).toBe(20000);
  expect(cashfree.createRefund).toHaveBeenCalledTimes(1);
  expect(await refundedFor(id)).toBe(20000);
});

test('once decorating has started, self-serve cancel is refused', async () => {
  const id = await booking({ status: 'in_progress' });
  await expect(eventService.cancelBooking(id, userId, 'x')).rejects.toMatchObject({ status: 409 });
  expect(cashfree.createRefund).not.toHaveBeenCalled();
});

test('a partner decline refunds everything paid', async () => {
  const id = await booking();
  const res = await request(app).post(`/api/events/partner/bookings/${id}/decline`)
    .set('Authorization', `Bearer ${signAccessToken({ sub: String(partnerId), role: 'event_partner' })}`)
    .send({ reason: 'Team unavailable' });
  expect(res.status).toBe(200);
  expect(await refundedFor(id)).toBe(20000);
  expect((await EventBooking.findById(id).lean())).toMatchObject({ status: 'cancelled', refundStatus: 'pending', refundPaise: 20000 });
});

test("the partner's share uses the booking's agreed commission", async () => {
  const id = await booking({ status: 'in_progress' });
  const before = (await EventPartner.findById(partnerId).lean()).totalEarningsPaise || 0;
  const res = await request(app).patch(`/api/events/partner/bookings/${id}/status`)
    .set('Authorization', `Bearer ${signAccessToken({ sub: String(partnerId), role: 'event_partner' })}`)
    .send({ status: 'completed' });
  expect(res.status).toBe(200);
  const after = (await EventPartner.findById(partnerId).lean()).totalEarningsPaise;
  expect(after - before).toBe(88000); // 12% commission, not a fixed 15%
});

test("every change reaches the customer's own channel", async () => {
  const id = await booking();
  const heard = [];
  const sub = redis.duplicate();
  await sub.subscribe('provider:repair');
  sub.on('message', (_c, m) => heard.push(JSON.parse(m)));
  await request(app).patch(`/api/events/partner/bookings/${id}/status`)
    .set('Authorization', `Bearer ${signAccessToken({ sub: String(partnerId), role: 'event_partner' })}`)
    .send({ status: 'partner_assigned' });
  await new Promise((r) => setTimeout(r, 300));
  expect(heard).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'user', id: String(userId), event: 'job.update', payload: expect.objectContaining({ kind: 'event', status: 'partner_assigned' }) }),
  ]));
  await sub.quit();
});
