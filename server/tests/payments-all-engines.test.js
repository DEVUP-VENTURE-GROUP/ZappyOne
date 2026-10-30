/**
 * Online payment for every engine, with a backup for each way it can fail:
 *   no credentials yet   → online refused plainly, cash still works
 *   webhook never comes  → the reconcile sweep asks Cashfree and captures
 *   refund call fails    → flagged for ops, never silently lost
 */
jest.mock('../src/modules/payment/cashfree.client', () => ({
  createOrder: jest.fn(async ({ orderId }) => ({ order_id: orderId, payment_session_id: 'sess_1' })),
  getOrderPayments: jest.fn(),
  createRefund: jest.fn(),
  verifyWebhookSignature: jest.fn(() => true),
}));

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const config = require('../src/config');
const cashfree = require('../src/modules/payment/cashfree.client');
const payments = require('../src/modules/payment/payment.service');
const payables = require('../src/modules/payment/payables');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');

jest.setTimeout(60000);

const userId = new mongoose.Types.ObjectId();
const withCredentials = (on) => { config.cashfree.appId = on ? 'app' : ''; config.cashfree.secretKey = on ? 'secret' : ''; };
const petBooking = (extra = {}) => PetBooking.create({
  reference: `ZP${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId, categoryCode: 'pet_grooming',
  status: 'BOOKED', serviceMode: 'doorstep', paymentMethod: 'online', pricing: { totalPaise: 90000, commissionPaise: 9000 }, pets: [], ...extra,
});

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(() => jest.clearAllMocks());

describe('before the Cashfree credentials arrive', () => {
  beforeAll(() => withCredentials(false));

  test('an online booking is refused with a clear "choose cash" message; cash is fine', () => {
    expect(() => payables.assertOnlineAvailable('online')).toThrow(expect.objectContaining({ code: 'ONLINE_PAYMENTS_DISABLED' }));
    expect(() => payables.assertOnlineAvailable('cash')).not.toThrow();
  });

  test('checkout says the gateway is unavailable instead of failing obscurely', async () => {
    const b = await petBooking();
    await expect(payments.createOrderForPurpose({
      owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id,
    })).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE', status: 503 });
  });
});

describe('with credentials', () => {
  beforeAll(() => withCredentials(true));
  afterAll(() => withCredentials(false));

  test('checkout charges the booking\'s own price and records which engine it pays for', async () => {
    const b = await petBooking();
    const { paymentIntent } = await payments.createOrderForPurpose({
      owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id,
    });
    expect(paymentIntent).toMatchObject({ purpose: 'booking_payment', bookingSource: 'pet', amountPaise: 90000 });
    expect(cashfree.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 90000 }));
  });

  test('someone else\'s booking, or one already paid, cannot be charged', async () => {
    const b = await petBooking();
    await expect(payments.createOrderForPurpose({
      owner: { kind: 'user', id: new mongoose.Types.ObjectId() }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const paid = await petBooking({ paymentStatus: 'paid' });
    await expect(payments.createOrderForPurpose({
      owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: paid._id,
    })).rejects.toMatchObject({ code: 'ALREADY_PAID' });
  });

  test('a missed webhook is recovered by the reconcile sweep, exactly once', async () => {
    const b = await petBooking();
    const { paymentIntent } = await payments.createOrderForPurpose({
      owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id,
    });
    // Cashfree payment ids are unique per order.
    cashfree.getOrderPayments.mockImplementation(async (orderId) => [{ payment_status: 'SUCCESS', cf_payment_id: `pay_${orderId}`, payment_amount: 900 }]);
    const later = Date.now() + 5 * 60 * 1000;
    await payments.reconcilePendingIntents({ now: later });
    await payments.reconcilePendingIntents({ now: later });

    expect((await PaymentIntent.findById(paymentIntent._id)).status).toBe('captured');
    expect((await PetBooking.findById(b._id)).paymentStatus).toBe('paid');
  });

  test('cancelling a paid booking refunds it; a failing gateway flags it for ops', async () => {
    const b = await petBooking();
    await PaymentIntent.create({
      cfOrderId: `zpy_pet_${b._id}`, owner: { kind: 'user', id: userId }, purpose: 'booking_payment',
      bookingSource: 'pet', bookingId: b._id, amountPaise: 90000, status: 'captured', cfPaymentId: `p_${b._id}`,
    });
    cashfree.createRefund.mockResolvedValueOnce({ cf_refund_id: 'rf1' });
    expect(await payments.refundBookingPayment({ source: 'pet', bookingId: b._id, amountPaise: 90000 }))
      .toMatchObject({ refunded: true, amountPaise: 90000 });

    const b2 = await petBooking();
    await PaymentIntent.create({
      cfOrderId: `zpy_pet_${b2._id}`, owner: { kind: 'user', id: userId }, purpose: 'booking_payment',
      bookingSource: 'pet', bookingId: b2._id, amountPaise: 90000, status: 'captured', cfPaymentId: `p_${b2._id}`,
    });
    cashfree.createRefund.mockRejectedValueOnce(new Error('gateway down'));
    expect(await payments.refundBookingPayment({ source: 'pet', bookingId: b2._id })).toMatchObject({ refunded: false, reason: 'manual_required' });
    const flagged = await PaymentIntent.findOne({ bookingId: b2._id });
    expect(flagged).toMatchObject({ reconciliationRequired: true, refund: expect.objectContaining({ status: 'manual_required' }) });
  });
});
