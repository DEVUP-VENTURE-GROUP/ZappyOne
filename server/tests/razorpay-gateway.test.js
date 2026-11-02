/**
 * Razorpay as the fallback gateway: chosen only when Cashfree has no keys; checkout is
 * signature-checked and confirmed with Razorpay before anything is applied, exactly once;
 * webhooks capture missed payments; refunds go back through Razorpay.
 */
jest.mock('../src/modules/payment/razorpay.client', () => {
  const real = jest.requireActual('../src/modules/payment/razorpay.client');
  return { ...real, createOrder: jest.fn(), getOrderPayments: jest.fn(), getPayment: jest.fn(), capture: jest.fn(), createRefund: jest.fn() };
});

const crypto = require('crypto');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const config = require('../src/config');
const rzp = require('../src/modules/payment/razorpay.client');
const gateway = require('../src/modules/payment/gateway');
const payments = require('../src/modules/payment/payment.service');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');

jest.setTimeout(60000);
const real = jest.requireActual('../src/modules/payment/razorpay.client');
const userId = new mongoose.Types.ObjectId();
const sign = (orderId, paymentId) => crypto.createHmac('sha256', 'rzp_secret').update(`${orderId}|${paymentId}`).digest('hex');
const petBooking = () => PetBooking.create({
  reference: `ZP${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId, categoryCode: 'pet_grooming',
  status: 'BOOKED', serviceMode: 'doorstep', paymentMethod: 'online', pricing: { totalPaise: 90000, commissionPaise: 9000 }, pets: [],
});
async function checkout() {
  const b = await petBooking();
  rzp.createOrder.mockResolvedValueOnce({ id: `order_${b._id}` });
  const { paymentIntent } = await payments.createOrderForPurpose({ owner: { kind: 'user', id: userId }, purpose: 'booking_payment', bookingSource: 'pet', bookingId: b._id });
  return { b, intent: paymentIntent, rzOrder: `order_${b._id}` };
}

beforeAll(async () => {
  await startMongo();
  Object.assign(config.cashfree, { appId: '', secretKey: '' });
  Object.assign(config.razorpay, { keyId: 'rzp_test_key', keySecret: 'rzp_secret', webhookSecret: 'hook_secret' });
});
afterAll(async () => { Object.assign(config.razorpay, { keyId: '', keySecret: '', webhookSecret: '' }); await stopMongo(); });
beforeEach(() => jest.clearAllMocks());

test('Cashfree wins whenever it has keys; Razorpay is used only without them; neither means cash only', () => {
  expect(gateway.active()).toBe('razorpay');
  Object.assign(config.cashfree, { appId: 'a', secretKey: 's' });
  expect(gateway.active()).toBe('cashfree');
  Object.assign(config.cashfree, { appId: '', secretKey: '' });
  Object.assign(config.razorpay, { keyId: '' });
  expect(gateway.active()).toBeNull();
  Object.assign(config.razorpay, { keyId: 'rzp_test_key' });
});

test('checkout opens a Razorpay order for the booking price; only a correctly signed, captured payment is applied, once', async () => {
  const { b, intent, rzOrder } = await checkout();
  expect(rzp.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 90000, orderId: intent.cfOrderId }));
  expect(intent).toMatchObject({ gateway: 'razorpay', gatewayOrderId: rzOrder, amountPaise: 90000 });

  await expect(payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_1', razorpaySignature: '0'.repeat(64) }))
    .rejects.toMatchObject({ code: 'BAD_SIGNATURE' });
  await expect(payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_1' })).rejects.toMatchObject({ code: 'BAD_SIGNATURE' });

  rzp.getPayment.mockResolvedValue({ id: 'pay_1', order_id: rzOrder, status: 'captured', amount: 90000, method: 'upi' });
  const out = await payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_1', razorpaySignature: sign(rzOrder, 'pay_1') });
  expect(out.ok).not.toBe(false);
  expect(await PaymentIntent.findById(intent._id).lean()).toMatchObject({ status: 'captured', cfPaymentId: 'pay_1' });
  expect((await PetBooking.findById(b._id).lean()).paymentStatus).toBe('paid');

  const again = await payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_1', razorpaySignature: sign(rzOrder, 'pay_1') });
  expect(again.action).toBe('already_applied_or_unknown');
});

test('a payment for another order, or for less than the price, is never applied', async () => {
  const { b, intent, rzOrder } = await checkout();
  rzp.getPayment.mockResolvedValueOnce({ id: 'pay_x', order_id: 'order_someone_else', status: 'captured', amount: 90000 });
  expect(await payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_x', razorpaySignature: sign(rzOrder, 'pay_x') }))
    .toMatchObject({ ok: false, status: 'not_confirmed' });
  rzp.getPayment.mockResolvedValueOnce({ id: 'pay_low', order_id: rzOrder, status: 'captured', amount: 100 });
  expect(await payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_low', razorpaySignature: sign(rzOrder, 'pay_low') }))
    .toMatchObject({ ok: false, action: 'amount_mismatch' });
  expect((await PetBooking.findById(b._id).lean()).paymentStatus).not.toBe('paid');
});

test('an authorised payment is captured; the webhook captures one the app never reported', async () => {
  const { intent, rzOrder } = await checkout();
  rzp.getPayment.mockResolvedValueOnce({ id: 'pay_2', order_id: rzOrder, status: 'authorized', amount: 90000 });
  rzp.capture.mockResolvedValueOnce({ id: 'pay_2', order_id: rzOrder, status: 'captured', amount: 90000 });
  await payments.handleRazorpayWebhook({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_2', order_id: rzOrder } } } });
  expect(rzp.capture).toHaveBeenCalledWith('pay_2', 90000);
  expect((await PaymentIntent.findById(intent._id).lean()).status).toBe('captured');
  expect(await payments.handleRazorpayWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_unknown' } } } }))
    .toMatchObject({ ok: false, reason: 'unknown_order' });
});

test('a refund goes back through Razorpay and the booking reads refunded once Razorpay pays it out', async () => {
  const { b, intent, rzOrder } = await checkout();
  rzp.getPayment.mockResolvedValueOnce({ id: 'pay_3', order_id: rzOrder, status: 'captured', amount: 90000 });
  await payments.handleCheckoutVerification({ cfOrderId: intent.cfOrderId, cfPaymentId: 'pay_3', razorpaySignature: sign(rzOrder, 'pay_3') });
  rzp.createRefund.mockResolvedValueOnce({ id: 'rfnd_1' });
  expect(await payments.refundBookingPayment({ source: 'pet', bookingId: b._id, amountPaise: 90000 })).toMatchObject({ refunded: true, amountPaise: 90000 });
  expect(rzp.createRefund).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_3', amountPaise: 90000 }));
  await payments.handleRazorpayWebhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_3', amount: 90000 } } } });
  expect((await PaymentIntent.findById(intent._id).lean()).status).toBe('refunded');
  expect((await PetBooking.findById(b._id).lean()).paymentStatus).toBe('refunded');
});

test('webhook and checkout signatures are checked with the right secrets', () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  expect(real.verifyWebhookSignature(body, crypto.createHmac('sha256', 'hook_secret').update(body).digest('hex'))).toBe(true);
  expect(real.verifyWebhookSignature(body, '0'.repeat(64))).toBe(false);
  expect(real.verifyCheckoutSignature('order_1', 'pay_1', sign('order_1', 'pay_1'))).toBe(true);
  expect(real.verifyCheckoutSignature('order_1', 'pay_1', sign('order_1', 'pay_2'))).toBe(false);
});
