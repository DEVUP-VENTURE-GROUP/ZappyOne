/**
 * Cancellation rules (2026-10): free until someone accepts, for every kind;
 * pet care's default policy when admin set none; event partners pay for
 * cancelling and are paused at the strike limit; shop penalties become dues.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let Transaction;
beforeAll(async () => {
  await startMongo();
  Transaction = require('../src/modules/payment/transaction.model');
  await Transaction.init();
});
afterAll(stopMongo);

test('still finding someone: free, even for a customer who cancels often', async () => {
  const { feeFor } = require('../src/modules/jobs/cancel-fee');
  const shield = require('../src/modules/order/shield.service');
  const spy = jest.spyOn(shield, 'countRecentUserCancels').mockResolvedValue(5);
  const f = await feeFor({ kind: 'helping', doc: { _id: new mongoose.Types.ObjectId() }, userId: new mongoose.Types.ObjectId(), stage: 'searching' });
  expect(f).toMatchObject({ feePaise: 0, free: 'not_accepted' });
  const onWay = await feeFor({ kind: 'helping', doc: { _id: new mongoose.Types.ObjectId() }, userId: new mongoose.Types.ObjectId(), stage: 'on_the_way' });
  expect(onWay.feePaise).toBeGreaterThan(0);
  spy.mockRestore();
});

test('pet care: free before accepted; with no policy set, the default by hours before', async () => {
  const { quoteCancellation } = require('../src/modules/pet/services/booking.service');
  const at = (h) => new Date(Date.now() + h * 3600e3);
  const b = (status, h) => ({ _id: new mongoose.Types.ObjectId(), status, scheduledAt: at(h), pricing: { totalPaise: 100000 } });
  expect(await quoteCancellation({ booking: b('BOOKED', 1) })).toMatchObject({ refundPaise: 100000, tier: 'not_accepted' });
  expect(await quoteCancellation({ booking: b('PROVIDER_ACCEPTED', 48) })).toMatchObject({ refundPaise: 100000 });
  expect(await quoteCancellation({ booking: b('PROVIDER_ACCEPTED', 10) })).toMatchObject({ refundPaise: 75000, providerCompensationPaise: 17500 });
  expect(await quoteCancellation({ booking: b('PROVIDER_ACCEPTED', 1) })).toMatchObject({ refundPaise: 50000, providerCompensationPaise: 35000 });
});

test('event partner: penalty by days before, shown first; paused at the strike limit; reinstated', async () => {
  const EventPartner = require('../src/modules/events/event-partner.model');
  const EventBooking = require('../src/modules/events/event-booking.model');
  const pc = require('../src/modules/events/partner-cancel');
  const partner = await EventPartner.create({ businessName: 'Dream Decor', ownerName: 'D', phone: '9000003001' });
  const make = (days) => EventBooking.create({
    userId: new mongoose.Types.ObjectId(), themeId: new mongoose.Types.ObjectId(), partnerId: partner._id,
    eventDate: new Date(Date.now() + days * 86400e3), eventTimeSlot: '10:00 AM', address: { line1: 'x' },
    pricing: { themePricePaise: 200000, totalPaise: 220000, advancePaise: 44000, remainingPaise: 176000 }, status: 'confirmed',
  });
  const far = await make(10);
  expect(await pc.quote(far.toObject())).toMatchObject({ penaltyPaise: 0, strikes: 0, willPause: false });
  const near = await make(2);
  expect((await pc.quote(near.toObject())).penaltyPaise).toBe(40000); // 20% of ₹2,000

  // Three partner cancellations in the window: paused.
  for (const bk of [far, near, await make(0.5)]) {
    await EventBooking.updateOne({ _id: bk._id }, { $set: { status: 'cancelled', cancelledBy: 'partner' } });
    await pc.apply(bk.toObject());
  }
  const p = await EventPartner.findById(partner._id).lean();
  expect(p.suspendedAt).toBeTruthy();
  expect(await pc.penaltiesOf(partner._id)).toBe(40000 + 60000);
  expect((await pc.pausedPartnerIds()).map(String)).toContain(String(partner._id));
  await pc.reinstate(partner._id);
  expect((await EventPartner.findById(partner._id).lean()).suspendedAt).toBeNull();
});

test('shop hand-back penalty: owed by the shop and taken from its withdraw balance', async () => {
  const shopId = new mongoose.Types.ObjectId();
  await Transaction.create({ type: 'credit', owner: { kind: 'platform', id: null }, amountPaise: 50000, reason: 'worker_earning', idempotencyKey: `sp1-${shopId}`, metadata: { shopId: String(shopId) }, status: 'succeeded' });
  await Transaction.create({ type: 'debit', owner: { kind: 'platform', id: null }, amountPaise: -2000, reason: Transaction.REASONS.PROVIDER_PENALTY, idempotencyKey: `sp2-${shopId}`, metadata: { shopId: String(shopId) }, status: 'succeeded' });
  expect((await require('../src/modules/shop/shop-payout').balance(shopId)).availablePaise).toBe(48000);
});
