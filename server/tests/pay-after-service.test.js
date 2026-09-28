/**
 * Getting paid once the work is done, the way it happens at the door:
 *   - a pet booking waits for payment instead of closing unpaid
 *   - cash is recorded by the provider and bills them the commission (no double pay)
 *   - an online payment after the service closes the booking and pays the provider
 *   - a customer who chose online but can't pay online can hand over cash instead
 *   - commission is booked once, at settlement, never again at capture
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const petPayment = require('../src/modules/pet/services/payment.service');
const Transaction = require('../src/modules/payment/transaction.model');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(60000);

let workerId;
const userId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  await Transaction.init();
  const w = await Worker.create({ phone: '9876500777', name: 'Pet Pro', rating: 4.8, kyc: { status: 'approved' } });
  workerId = w._id;
});
afterAll(stopMongo);

const petBooking = (extra = {}) => PetBooking.create({
  reference: `ZP${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId, workerId, categoryCode: 'pet_grooming',
  status: 'SERVICE_STARTED', serviceMode: 'doorstep', paymentMethod: 'cash',
  pricing: { totalPaise: 90000, commissionPaise: 9000 }, pets: [], ...extra,
});

async function complete(booking) {
  booking.transitionTo('SERVICE_COMPLETED', { by: workerId, byRole: 'worker' });
  await booking.save();
  return petPayment.afterServiceCompleted(booking, { by: workerId });
}

const rowsFor = (id) => Transaction.find({ idempotencyKey: new RegExp(`^pet:.*:${id}$`) }).lean();

test('an unpaid pet booking waits for payment rather than closing', async () => {
  const b = await complete(await petBooking());
  expect(b.status).toBe('PAYMENT_PENDING');
  expect(await rowsFor(b._id)).toHaveLength(0);
});

test('cash: the provider records it, keeps the fee and is billed only the commission', async () => {
  const b = await complete(await petBooking());
  const out = await petPayment.recordCash({ bookingId: b._id, providerId: workerId });
  expect(out.booking.status).toBe('PAYMENT_COMPLETED');
  expect(out.booking.paymentStatus).toBe('paid');

  const rows = await rowsFor(b._id);
  expect(rows.some((r) => r.reason === Transaction.REASONS.WORKER_EARNING)).toBe(false);
  const platform = rows.find((r) => r.idempotencyKey === `pet:commission:${b._id}`);
  expect(platform.amountPaise).toBe(9000);

  // A second tap on a patchy connection moves nothing.
  const again = await petPayment.recordCash({ bookingId: b._id, providerId: workerId });
  expect(again.alreadyPaid).toBe(true);
  expect(await rowsFor(b._id)).toHaveLength(rows.length);
});

test('online after the service: the payment closes the booking and pays the provider their share', async () => {
  const b = await complete(await petBooking({ paymentMethod: 'online' }));
  expect(b.status).toBe('PAYMENT_PENDING');

  b.paymentStatus = 'paid';
  await b.save();
  await petPayment.afterOnlinePayment(b);

  const fresh = await PetBooking.findById(b._id);
  expect(fresh.status).toBe('PAYMENT_COMPLETED');
  const rows = await rowsFor(b._id);
  expect(rows.find((r) => r.reason === Transaction.REASONS.WORKER_EARNING).amountPaise).toBe(81000);
  expect(rows.filter((r) => r.idempotencyKey === `pet:commission:${b._id}`)).toHaveLength(1);
});

test('paid up front: completing settles straight away', async () => {
  const b = await complete(await petBooking({ paymentMethod: 'online', paymentStatus: 'paid' }));
  expect(b.status).toBe('PAYMENT_COMPLETED');
  expect((await rowsFor(b._id)).some((r) => r.reason === Transaction.REASONS.WORKER_EARNING)).toBe(true);
});

test('chose online but paying cash at the door: allowed, and becomes a cash booking', async () => {
  const b = await complete(await petBooking({ paymentMethod: 'online' }));
  const out = await petPayment.recordCash({ bookingId: b._id, providerId: workerId });
  expect(out.booking.paymentMethod).toBe('cash');
  expect(out.booking.status).toBe('PAYMENT_COMPLETED');
});

test('cash is refused while the customer\'s online payment is already in the gateway', async () => {
  const b = await complete(await petBooking({ paymentMethod: 'online' }));
  await PaymentIntent.create({
    owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id,
    amountPaise: 90000, cfOrderId: `cf_${b._id}`, status: 'captured',
  });
  await expect(petPayment.recordCash({ bookingId: b._id, providerId: workerId }))
    .rejects.toMatchObject({ code: 'ONLINE_PAYMENT_IN_PROGRESS' });
});

test('only the provider on the booking can record its cash', async () => {
  const b = await complete(await petBooking());
  await expect(petPayment.recordCash({ bookingId: b._id, providerId: new mongoose.Types.ObjectId() }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
});

describe('repair', () => {
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const lifecycle = require('../src/modules/repair/services/booking/lifecycle');

  test('an unpaid online repair cannot be completed; cash at the door unblocks it', async () => {
    const booking = new RepairBooking({ paymentMethod: 'online', paymentStatus: 'pending', priceSnapshot: { totalPaise: 50000 } });
    expect(lifecycle.assertCashCollected(booking)).toMatchObject({ ok: false, code: 'PAYMENT_PENDING' });
    booking.paymentStatus = 'paid';
    expect(lifecycle.assertCashCollected(booking)).toMatchObject({ ok: true });
  });
});
