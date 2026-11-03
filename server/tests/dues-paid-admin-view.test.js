// When a partner pays ZappyOne, admin's Dues view follows at once: Pay now online, a UPI payment the partner reports and admin confirms, and a wrong report admin rejects.
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
  validateVpa: jest.fn(),
}));

const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');
const config = require('../src/config');
const rzp = require('../src/modules/payment/razorpay.client');

jest.setTimeout(120000);
let app; let admin; let payments; let Transaction; let Wallet;
const adminCall = (method, path) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
const overview = async () => (await adminCall('get', '/dues/overview')).body;
const owedByShop = (shopId, paise) => Transaction.create({ type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -paise, reason: 'platform_commission', idempotencyKey: `t:${shopId}:${paise}`, metadata: { shopId: String(shopId), cash: true }, status: 'succeeded' });

beforeAll(async () => {
  await startMongo();
  Object.assign(config.cashfree, { appId: '', secretKey: '' });
  Object.assign(config.razorpay, { keyId: 'rzp_test_x', keySecret: 's' });
  app = require('../src/app')();
  admin = await adminToken();
  payments = require('../src/modules/payment/payment.service');
  Transaction = require('../src/modules/payment/transaction.model');
  Wallet = require('../src/modules/wallet/wallet.model');
});
afterAll(stopMongo);

test('a shop pays with Pay now: off the owing list, the payment shows as online, counted this month', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const shop = await Shop.create({ businessName: 'Kondapur Mobiles', ownerName: 'Ravi', phone: '9000000901' });
  await owedByShop(shop._id, 210000);
  const before = await overview();
  expect(before.partners.find((p) => p.id === String(shop._id))).toMatchObject({ owedPaise: 210000, status: 'paused' });

  const r = await payments.createOrderForPurpose({ owner: { kind: 'shop', id: shop._id }, purpose: 'dues_payment', link: true });
  rzp.getPaymentLink.mockResolvedValue({ id: r.paymentIntent.gatewayOrderId, status: 'paid', payments: [{ payment_id: 'pay_kondapur', amount: 210000, status: 'captured' }] });
  await payments.handleRazorpayWebhook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: r.paymentIntent.gatewayOrderId } } } });
  // Razorpay may send the same event again: it is counted once.
  await payments.handleRazorpayWebhook({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: r.paymentIntent.gatewayOrderId } } } });

  const after = await overview();
  expect(after.partners.some((p) => p.id === String(shop._id))).toBe(false);
  const paid = after.payments.filter((p) => p.partner.id === String(shop._id));
  expect(paid).toHaveLength(1);
  expect(paid[0]).toMatchObject({ amountPaise: 210000, how: 'Pay now (online)', partner: { kind: 'shop', name: 'Kondapur Mobiles' } });
  expect(after.totals.collectedThisMonthPaise - before.totals.collectedThisMonthPaise).toBe(210000);
  expect(after.monthly[5].paise - before.monthly[5].paise).toBe(210000);
});

test('a pro pays ZappyOne by UPI and says so: waiting for admin, then confirmed, cleared and unpaused', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const pro = await Worker.create({ name: 'Imran Khan', phone: '9000000902' });
  await Wallet.updateOne({ 'owner.kind': 'worker', 'owner.id': pro._id }, { $set: { balancePaise: -230000, currency: 'INR' } }, { upsert: true });
  const token = signAccessToken({ sub: String(pro._id), role: 'worker', phone: pro.phone });

  const claim = await request(app).post('/api/wallet/dues/claims').set('Authorization', `Bearer ${token}`).send({ amountPaise: 230000, method: 'upi', reference: 'UTR998877' });
  expect(claim.status).toBe(201);
  const waiting = (await overview()).partners.find((p) => p.id === String(pro._id));
  expect(waiting).toMatchObject({ owedPaise: 230000, status: 'paused', claimsCount: 1, claimsPaise: 230000 });

  const claimId = claim.body.claim?._id || claim.body.claim?.id || claim.body._id;
  const ok = await adminCall('post', `/dues/${pro._id}/payments`).send({ amountPaise: 230000, method: 'upi', reference: 'UTR998877', claimId });
  expect(ok.status).toBe(200);

  const after = await overview();
  expect(after.partners.some((p) => p.id === String(pro._id))).toBe(false);
  expect(after.payments.find((p) => p.partner.id === String(pro._id))).toMatchObject({ amountPaise: 230000, how: 'Their payment, confirmed', reference: 'UTR998877' });
  const status = await require('../src/modules/worker/worker-dues.service').getDuesStatus(pro._id);
  expect(status).toMatchObject({ duesPaise: 0, isBlocked: false });
});

test('a shop reports a payment that never came: admin rejects it, the shop still owes', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const shop = await Shop.create({ businessName: 'Miyapur Repairs', ownerName: 'Sana', phone: '9000000903' });
  await owedByShop(shop._id, 120000);
  const token = signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone });

  const claim = await request(app).post('/api/shops/me/dues/claims').set('Authorization', `Bearer ${token}`).send({ amountRupees: 1200, method: 'upi', reference: 'FAKE1234' });
  expect(claim.status).toBe(201);
  expect((await overview()).partners.find((p) => p.id === String(shop._id))).toMatchObject({ claimsCount: 1, claimsPaise: 120000 });

  const claimId = claim.body.claim?._id || claim.body.claim?.id;
  expect((await adminCall('post', `/dues/claims/${claimId}/reject`).send({ note: 'Not in the bank statement' })).status).toBe(200);

  const after = await overview();
  expect(after.partners.find((p) => p.id === String(shop._id))).toMatchObject({ owedPaise: 120000, claimsCount: 0 });
  expect(after.payments.some((p) => p.partner.id === String(shop._id))).toBe(false);
});
