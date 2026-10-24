// A webhook paying less than the booking asked for is never applied, and never reads as captured.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const PaymentIntent = require('../src/modules/payment/payment-intent.model');
const payments = require('../src/modules/payment/payment.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const webhook = (orderId, rupees) => ({
  type: 'PAYMENT_SUCCESS_WEBHOOK',
  data: { order: { order_id: orderId }, payment: { cf_payment_id: 'p1', payment_amount: rupees } },
});

test('an underpaid webhook is refused, marked failed, and a replay cannot apply it', async () => {
  const bookingId = new mongoose.Types.ObjectId();
  await PaymentIntent.create({
    cfOrderId: 'zpy_mismatch_1', owner: { kind: 'user', id: new mongoose.Types.ObjectId() }, purpose: 'booking_payment',
    bookingSource: 'pet', bookingId, amountPaise: 90000,
  });
  expect(await payments.handleWebhook(webhook('zpy_mismatch_1', 1))).toMatchObject({ ok: false, action: 'amount_mismatch' });
  const intent = await PaymentIntent.findOne({ cfOrderId: 'zpy_mismatch_1' }).lean();
  expect(intent).toMatchObject({ status: 'failed', failureReason: 'amount_mismatch' });
  expect(await payments.handleWebhook(webhook('zpy_mismatch_1', 900))).toMatchObject({ action: 'already_applied_or_unknown' });
});
