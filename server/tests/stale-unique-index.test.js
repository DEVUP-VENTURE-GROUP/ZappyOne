// A leftover unique index on a field the schema dropped (razorpayOrderId) made every second payment fail with "This already exists."
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let PaymentIntent; let script;
const owner = { kind: 'user', id: new mongoose.Types.ObjectId() };
const intent = (n) => ({ cfOrderId: `zpy_t_${n}`, gateway: 'razorpay', owner, purpose: 'wallet_topup', amountPaise: 1000 });

beforeAll(async () => {
  await startMongo();
  PaymentIntent = require('../src/modules/payment/payment-intent.model');
  script = require('../scripts/drop-stale-unique-indexes');
  await PaymentIntent.init();
  await PaymentIntent.collection.createIndex({ razorpayOrderId: 1 }, { unique: true });
  await PaymentIntent.collection.createIndex({ oldNote: 1 });
});
afterAll(stopMongo);

test('the stale unique index blocks the second payment; the script drops only it, and payments work again', async () => {
  await PaymentIntent.create(intent(1));
  await expect(PaymentIntent.create(intent(2))).rejects.toMatchObject({ code: 11000 });

  const listed = [];
  expect(await script.run({ apply: false, log: (l) => listed.push(l) })).toEqual([]);
  expect(listed.join('\n')).toMatch(/razorpayOrderId_1 \(unique\): not in the schema, would drop/);

  expect(await script.run({ apply: true, log: () => {} })).toEqual(['paymentintents.razorpayOrderId_1']);
  const names = (await PaymentIntent.collection.indexes()).map((i) => i.name);
  expect(names).not.toContain('razorpayOrderId_1');
  expect(names).toEqual(expect.arrayContaining(['oldNote_1', 'cfOrderId_1', 'gatewayOrderId_1']));

  await PaymentIntent.create(intent(2));
  await PaymentIntent.create(intent(3));
  expect(await PaymentIntent.countDocuments()).toBe(3);
});

test('events partners: one per phone, and any number without a phone (Google sign-in)', async () => {
  const EventPartner = require('../src/modules/events/event-partner.model');
  await EventPartner.init();
  const p = (x) => ({ businessName: 'B', ownerName: 'O', ...x });
  await EventPartner.create(p({ phone: '9000000801' }));
  await expect(EventPartner.create(p({ phone: '9000000801' }))).rejects.toMatchObject({ code: 11000 });
  await EventPartner.create(p({ googleId: 'g1' }));
  await EventPartner.create(p({ googleId: 'g2' }));
  await EventPartner.create(p({ googleId: 'g3', phone: null }));
  await EventPartner.create(p({ googleId: 'g4', phone: null }));
  expect(await EventPartner.countDocuments()).toBe(5);
});
