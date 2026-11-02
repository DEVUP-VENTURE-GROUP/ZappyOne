// Event advance and balance through Razorpay: the customer's own booking only, signature-checked, applied once, a late payment on a cancelled booking flagged for refund, and refunds back through Razorpay.
jest.mock('../src/modules/payment/razorpay.client', () => {
  const real = jest.requireActual('../src/modules/payment/razorpay.client');
  return { ...real, createOrder: jest.fn(), getPayment: jest.fn(), capture: jest.fn(), createRefund: jest.fn(async ({ refundId }) => ({ id: `rfnd_${refundId}` })) };
});

const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const config = require('../src/config');
const rzp = require('../src/modules/payment/razorpay.client');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const EventBooking = require('../src/modules/events/event-booking.model');
const EventPartner = require('../src/modules/events/event-partner.model');
const eventService = require('../src/modules/events/event.service');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(90000);
let app;
const userId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const partnerId = new mongoose.Types.ObjectId();
const auth = (id) => `Bearer ${signAccessToken({ sub: String(id), role: 'user' })}`;
const sign = (orderId, paymentId) => crypto.createHmac('sha256', 'rzp_secret').update(`${orderId}|${paymentId}`).digest('hex');

async function booking(extra = {}) {
  const b = await EventBooking.collection.insertOne({
    userId, partnerId, themeId: new mongoose.Types.ObjectId(), status: 'pending_payment', eventDate: new Date(Date.now() + 10 * 86400000), eventTimeSlot: 'evening',
    address: { line1: '12 Madhapur Main Rd', city: 'Hyderabad' },
    pricing: { totalPaise: 100000, advancePaise: 20000, remainingPaise: 80000, platformCommissionPct: 12 },
    advancePayment: { status: 'pending' }, remainingPayment: { status: 'pending' }, statusHistory: [],
    createdAt: new Date(), updatedAt: new Date(), ...extra,
  });
  return String(b.insertedId);
}

async function payStage(id, stage, amount) {
  rzp.createOrder.mockResolvedValueOnce({ id: `order_${stage}_${id}` });
  const o = await request(app).post(`/api/events/bookings/${id}/pay/${stage}`).set('Authorization', auth(userId));
  expect(o.status).toBe(200);
  expect(o.body).toMatchObject({ gateway: 'razorpay', razorpayOrderId: `order_${stage}_${id}`, razorpayKeyId: 'rzp_test_key', amountPaise: amount });
  const pay = `pay_${stage}_${id}`;
  rzp.getPayment.mockResolvedValue({ id: pay, order_id: `order_${stage}_${id}`, status: 'captured', amount, method: 'upi' });
  return { o: o.body, pay };
}

beforeAll(async () => {
  await startMongo();
  Object.assign(config.cashfree, { appId: '', secretKey: '' });
  Object.assign(config.razorpay, { keyId: 'rzp_test_key', keySecret: 'rzp_secret', webhookSecret: 'hook_secret' });
  app = require('../src/app')();
  await EventPartner.collection.insertOne({ _id: partnerId, businessName: 'Decor Co', phone: '9000000601' });
});
afterAll(async () => { Object.assign(config.razorpay, { keyId: '', keySecret: '', webhookSecret: '' }); await stopMongo(); });

test('advance then balance through Razorpay: confirmed once, nobody else can verify, a bad signature changes nothing', async () => {
  const id = await booking();
  const { o, pay } = await payStage(id, 'advance', 20000);

  const stranger = await request(app).post(`/api/events/bookings/${id}/pay/advance/verify`).set('Authorization', auth(otherId))
    .send({ cfOrderId: o.cfOrderId, cfPaymentId: pay, razorpaySignature: sign(o.razorpayOrderId, pay) });
  expect(stranger.status).toBe(404);
  const forged = await request(app).post(`/api/events/bookings/${id}/pay/advance/verify`).set('Authorization', auth(userId))
    .send({ cfOrderId: o.cfOrderId, cfPaymentId: pay, razorpaySignature: 'forged' });
  expect(forged.status).toBe(400);
  expect((await EventBooking.findById(id).lean()).status).toBe('pending_payment');

  for (let i = 0; i < 2; i += 1) {
    const ok = await request(app).post(`/api/events/bookings/${id}/pay/advance/verify`).set('Authorization', auth(userId))
      .send({ cfOrderId: o.cfOrderId, cfPaymentId: pay, razorpaySignature: sign(o.razorpayOrderId, pay) });
    expect(ok.status).toBe(200);
  }
  let b = await EventBooking.findById(id).lean();
  expect(b).toMatchObject({ status: 'confirmed', advancePayment: { status: 'paid', cfPaymentId: pay } });
  expect(b.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);

  const again = await request(app).post(`/api/events/bookings/${id}/pay/advance`).set('Authorization', auth(userId));
  expect(again.status).toBe(409);

  const rest = await payStage(id, 'remaining', 80000);
  const done = await request(app).post(`/api/events/bookings/${id}/pay/remaining/verify`).set('Authorization', auth(userId))
    .send({ cfOrderId: rest.o.cfOrderId, cfPaymentId: rest.pay, razorpaySignature: sign(rest.o.razorpayOrderId, rest.pay) });
  expect(done.status).toBe(200);
  b = await EventBooking.findById(id).lean();
  expect(b.remainingPayment).toMatchObject({ status: 'paid', cfPaymentId: rest.pay });
});

test('the balance cannot be opened before the advance is paid', async () => {
  const id = await booking();
  const r = await request(app).post(`/api/events/bookings/${id}/pay/remaining`).set('Authorization', auth(userId));
  expect(r.status).toBe(409);
});

test('an advance that lands after the customer cancelled is not confirmed; it is flagged for ops to refund', async () => {
  const id = await booking();
  const { o, pay } = await payStage(id, 'advance', 20000);
  await EventBooking.updateOne({ _id: id }, { $set: { status: 'cancelled' } });
  const r = await request(app).post(`/api/events/bookings/${id}/pay/advance/verify`).set('Authorization', auth(userId))
    .send({ cfOrderId: o.cfOrderId, cfPaymentId: pay, razorpaySignature: sign(o.razorpayOrderId, pay) });
  expect(r.status).toBe(409);
  expect(r.body.error).toMatch(/will refund/);
  expect((await EventBooking.findById(id).lean()).status).toBe('cancelled');
  expect(await PaymentIntent.findOne({ cfOrderId: o.cfOrderId }).lean()).toMatchObject({ reconciliationRequired: true });
});

test('cancelling a Razorpay-paid booking refunds through Razorpay', async () => {
  const id = await booking();
  const { o, pay } = await payStage(id, 'advance', 20000);
  await request(app).post(`/api/events/bookings/${id}/pay/advance/verify`).set('Authorization', auth(userId))
    .send({ cfOrderId: o.cfOrderId, cfPaymentId: pay, razorpaySignature: sign(o.razorpayOrderId, pay) });
  const r = await eventService.cancelBooking(id, userId, 'Plans changed');
  expect(r.refundPaise).toBe(20000);
  expect(rzp.createRefund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: pay, amountPaise: 20000 }));
});
