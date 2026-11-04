// Partners pay their dues online (Razorpay checkout on the web, a payment link in the apps): never more than owed, cleared once, work opens again.
jest.mock('../src/modules/payment/razorpay.client', () => ({
  createOrder: jest.fn(async ({ orderId }) => ({ id: `order_${orderId.slice(-6)}` })),
  createPaymentLink: jest.fn(async ({ orderId }) => ({ id: `plink_${orderId.slice(-6)}`, short_url: 'https://rzp.io/i/abc' })),
  getPaymentLink: jest.fn(),
  getPayment: jest.fn(),
  getOrderPayments: jest.fn(async () => []),
  capture: jest.fn(),
  createRefund: jest.fn(),
  verifyCheckoutSignature: jest.fn(() => true),
  verifyWebhookSignature: jest.fn(() => true),
}));

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const config = require('../src/config');
const rzp = require('../src/modules/payment/razorpay.client');

jest.setTimeout(60000);
let payments; let dues; let Wallet; let PaymentIntent;
const workerId = new mongoose.Types.ObjectId();
const owner = { kind: 'worker', id: workerId };

beforeAll(async () => {
  await startMongo();
  Object.assign(config.cashfree, { appId: '', secretKey: '' });
  Object.assign(config.razorpay, { keyId: 'rzp_test_x', keySecret: 's' });
  payments = require('../src/modules/payment/payment.service');
  dues = require('../src/modules/worker/worker-dues.service');
  Wallet = require('../src/modules/wallet/wallet.model');
  PaymentIntent = require('../src/modules/payment/payment-intent.model');
  await Wallet.collection.insertOne({ owner: { kind: 'worker', id: workerId }, balancePaise: -230000, currency: 'INR', createdAt: new Date() });
});
afterAll(stopMongo);

test('over the limit, pays the whole amount through a link; cleared once and unblocked', async () => {
  expect((await dues.getDuesStatus(workerId)).isBlocked).toBe(true);
  await expect(payments.createOrderForPurpose({ owner, purpose: 'dues_payment', amountPaise: 240000, link: true })).rejects.toMatchObject({ code: 'TOO_MUCH' });

  const r = await payments.createOrderForPurpose({ owner, purpose: 'dues_payment', link: true });
  expect(r.paymentLink.short_url).toBe('https://rzp.io/i/abc');
  expect(r.paymentIntent.amountPaise).toBe(230000);

  rzp.getPaymentLink.mockResolvedValue({ id: r.paymentIntent.gatewayOrderId, status: 'created', payments: [] });
  expect(await payments.checkLink({ cfOrderId: r.paymentIntent.cfOrderId, owner })).toMatchObject({ ok: false });
  expect((await dues.getDuesStatus(workerId)).isBlocked).toBe(true);

  rzp.getPaymentLink.mockResolvedValue({ id: r.paymentIntent.gatewayOrderId, status: 'paid', payments: [{ payment_id: 'pay_1', amount: 230000, status: 'captured' }] });
  expect(await payments.checkLink({ cfOrderId: r.paymentIntent.cfOrderId, owner })).toMatchObject({ ok: true });
  await payments.checkLink({ cfOrderId: r.paymentIntent.cfOrderId, owner });
  await payments.handleRazorpayWebhook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: r.paymentIntent.gatewayOrderId } } } });

  const s = await dues.getDuesStatus(workerId);
  expect(s.duesPaise).toBe(0);
  expect(s.isBlocked).toBe(false);
});

test('nothing owed, someone else\'s payment, or a customer: refused', async () => {
  await expect(payments.createOrderForPurpose({ owner, purpose: 'dues_payment', link: true })).rejects.toMatchObject({ code: 'NOTHING_OWED' });
  await expect(payments.createOrderForPurpose({ owner: { kind: 'user', id: new mongoose.Types.ObjectId() }, purpose: 'dues_payment' })).rejects.toMatchObject({ code: 'NOT_A_PARTNER' });
  const any = await PaymentIntent.findOne({ purpose: 'dues_payment' }).lean();
  await expect(payments.checkLink({ cfOrderId: any.cfOrderId, owner: { kind: 'worker', id: new mongoose.Types.ObjectId() } })).rejects.toMatchObject({ status: 404 });
});

test('part payment on the web checkout lowers the dues by exactly that', async () => {
  await Wallet.updateOne({ 'owner.kind': 'worker', 'owner.id': workerId }, { $set: { balancePaise: -150000 } });
  const r = await payments.createOrderForPurpose({ owner, purpose: 'dues_payment', amountPaise: 50000 });
  expect(r.razorpayOrder.id).toMatch(/^order_/);
  rzp.getPayment.mockResolvedValue({ id: 'pay_2', order_id: r.razorpayOrder.id, status: 'captured', amount: 50000 });
  await payments.handleCheckoutVerification({ cfOrderId: r.paymentIntent.cfOrderId, cfPaymentId: 'pay_2', razorpaySignature: 'a'.repeat(64) });
  expect((await dues.getDuesStatus(workerId)).duesPaise).toBe(100000);
});

test('a shop pays its dues online the same way, recorded once', async () => {
  const Transaction = require('../src/modules/payment/transaction.model');
  const shopId = new mongoose.Types.ObjectId();
  await Transaction.create({ type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -210000, reason: 'platform_commission', idempotencyKey: `t:${shopId}`, metadata: { shopId: String(shopId), cash: true }, status: 'succeeded' });
  const shopDues = require('../src/modules/shop/shop-dues');
  expect((await shopDues.duesOf(shopId)).isBlocked).toBe(true);
  const r = await payments.createOrderForPurpose({ owner: { kind: 'shop', id: shopId }, purpose: 'dues_payment', link: true });
  rzp.getPaymentLink.mockResolvedValue({ id: r.paymentIntent.gatewayOrderId, status: 'paid', payments: [{ payment_id: 'pay_shop', amount: 210000, status: 'captured' }] });
  await payments.checkLink({ cfOrderId: r.paymentIntent.cfOrderId, owner: { kind: 'shop', id: shopId } });
  await payments.handleRazorpayWebhook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: r.paymentIntent.gatewayOrderId } } } });
  expect(await shopDues.duesOf(shopId)).toMatchObject({ duesPaise: 0, isBlocked: false });
});

test('each partner reads back its own last payment, for "Payment done"', async () => {
  const { lastPaidOf } = require('../src/modules/wallet/dues-overview');
  expect(await lastPaidOf({ kind: 'shop', id: new mongoose.Types.ObjectId() })).toBeNull();
  const shopId = (await require('../src/modules/payment/transaction.model').findOne({ 'metadata.reference': 'online:pay_shop' }).lean()).metadata.shopId;
  expect(await lastPaidOf({ kind: 'shop', id: shopId })).toMatchObject({ amountPaise: 210000, how: 'Pay now (online)' });
  const w = await lastPaidOf({ kind: 'worker', id: workerId });
  expect(w.amountPaise).toBeGreaterThan(0);
  expect(w.at).toBeInstanceOf(Date);
});
