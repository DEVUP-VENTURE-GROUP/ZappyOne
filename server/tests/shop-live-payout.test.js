/**
 * Shops: "Live" on the owner's dashboard is the rule dispatch uses; a shop
 * withdraws what ZappyOne owes it; a tip chosen at checkout is on the bill.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let Shop; let shopService; let payout; let Transaction;
const PIN = { type: 'Point', coordinates: [78.39, 17.44] };

beforeAll(async () => {
  await startMongo();
  Shop = require('../src/modules/shop/shop.model');
  shopService = require('../src/modules/shop/shop.service');
  payout = require('../src/modules/shop/shop-payout');
  Transaction = require('../src/modules/payment/transaction.model');
  await Transaction.init();
});
afterAll(stopMongo);

const shop = (extra = {}) => Shop.create({
  businessName: 'Live Test', ownerName: 'Owner', phone: `9${String(Math.random()).slice(2, 11)}`,
  kyc: { status: 'approved' }, address: { text: 'x', location: PIN }, services: ['water_tank_care'], ...extra,
});

test('not live without a pin, an approved service or approved ID; closed by its hours; no hours = open', async () => {
  expect(shopService.isLive((await shop()).toObject())).toBe(true);
  expect(shopService.isLive((await shop({ address: { text: 'x' } })).toObject())).toBe(false);
  expect(shopService.isLive((await shop({ services: [] })).toObject())).toBe(false);
  expect(shopService.isLive((await shop({ kyc: { status: 'pending_review' } })).toObject())).toBe(false);
  const closedAllWeek = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, isClosed: true }));
  expect(shopService.isLive((await shop({ hours: closedAllWeek })).toObject())).toBe(false);
});

test('a shop that is not live cannot take a job', async () => {
  const s = await shop({ address: { text: 'no pin' } });
  await expect(require('../src/modules/onboarding/eligibility').assertApproved({ role: 'shop', id: s._id }, 'water_tank_care'))
    .rejects.toMatchObject({ code: 'SHOP_NOT_LIVE' });
});

test('withdraw: earned online minus owed from cash minus asked; one at a time; ops pays or rejects', async () => {
  const s = await shop({
    savedUpiIds: [{ upiId: 'shop@upi', label: 'Shop UPI', isDefault: true }],
  });
  const id = String(s._id);
  await Transaction.create([
    { type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: 90000, reason: 'worker_earning', idempotencyKey: `t1-${id}`, metadata: { shopId: id }, status: 'succeeded' },
    { type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -15000, reason: 'platform_commission', idempotencyKey: `t2-${id}`, metadata: { shopId: id }, status: 'succeeded' },
  ]);
  expect(await payout.balance(id)).toMatchObject({ earnedPaise: 90000, owedPaise: 15000, availablePaise: 75000 });
  const upi = (await Shop.findById(id).lean()).savedUpiIds[0]._id;
  await expect(payout.request({ shopId: id, amountPaise: 80000, type: 'upi', accountId: upi })).rejects.toMatchObject({ code: 'TOO_MUCH' });
  const r = await payout.request({ shopId: id, amountPaise: 50000, type: 'upi', accountId: upi });
  expect(r.payout.destination.upiId).toBe('shop@upi');
  await expect(payout.request({ shopId: id, amountPaise: 10000, type: 'upi', accountId: upi })).rejects.toMatchObject({ code: 'OPEN_REQUEST' });
  expect((await payout.balance(id)).availablePaise).toBe(25000);
  await expect(payout.decide({ id: r.payout._id, decision: 'paid' })).rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
  await payout.decide({ id: r.payout._id, decision: 'paid', reference: 'UTR123' });
  expect((await payout.mine(id)).history[0]).toMatchObject({ status: 'paid', reference: 'UTR123' });
});

test('a tip chosen at checkout is on the bill (within the max), once', async () => {
  const { HelpingTask } = require('../src/modules/helping/models/task.model');
  const HERE = { type: 'Point', coordinates: [78.39, 17.44], address: 'x' };
  const t = await HelpingTask.create({
    reference: 'HT-TIPCO-1', userId: new mongoose.Types.ObjectId(), serviceType: 'pickup', status: 'CONFIRMED',
    pickupLocation: HERE, destination: HERE, charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'online',
  });
  const bt = require('../src/modules/jobs/boost-tip');
  expect(await bt.tipAtBooking('helping', t, 5000)).toMatchObject({ paise: 5000, method: 'with_payment' });
  expect(await bt.tipAtBooking('helping', t, 9000)).toBeNull();
  const due = require('../src/modules/helping/services/money.service').amountDue(await HelpingTask.findById(t._id));
  expect(due.feePaise).toBe(9000 + 5000);
});

test('two payout requests at the same instant make exactly one', async () => {
  const s = await shop({ savedUpiIds: [{ upiId: 'race@upi', label: 'Race UPI', isDefault: true }] });
  const id = String(s._id);
  await Transaction.create({ type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: 90000, reason: 'worker_earning', idempotencyKey: `race-${id}`, metadata: { shopId: id }, status: 'succeeded' });
  await payout.ShopPayout.syncIndexes();
  const upi = (await Shop.findById(id).lean()).savedUpiIds[0]._id;
  const tries = await Promise.allSettled([1, 2, 3].map(() => payout.request({ shopId: id, amountPaise: 20000, type: 'upi', accountId: upi })));
  expect(tries.filter((t) => t.status === 'fulfilled')).toHaveLength(1);
  expect(tries.filter((t) => t.status === 'rejected').every((t) => t.reason.code === 'OPEN_REQUEST')).toBe(true);
  expect(await payout.ShopPayout.countDocuments({ shopId: id })).toBe(1);
});
