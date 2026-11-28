// Insights → Money counts every way ZappyOne earns, per India day: commission and platform fee from bookings, plus surge, our share of cancellation fees, partner penalties, errand passes and subscriptions from the ledger, never money that only passes through.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const ago = (d) => new Date(NOW - d * 86_400_000);
const istDay = (t) => new Date(t.getTime() + 330 * 60_000).toISOString().slice(0, 10);
let analytics; let out;

beforeAll(async () => {
  await startMongo();
  analytics = require('../src/modules/admin-portal/analytics.service');
  const Transaction = require('../src/modules/payment/transaction.model');
  const Fee = require('../src/modules/order/cancellation-shield.model');
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const R = Transaction.REASONS;
  const worker = new mongoose.Types.ObjectId();
  const row = (reason, amountPaise, at, extra = {}) => ({
    type: amountPaise > 0 ? 'credit' : 'debit', owner: { kind: 'platform', id: null }, amountPaise, reason, status: 'succeeded',
    idempotencyKey: `t:${Math.random()}`, createdAt: at, updatedAt: at, ...extra,
  });
  await RepairBooking.collection.insertOne({
    userId: new mongoose.Types.ObjectId(), vertical: 'mobile', status: 'COMPLETED', reference: 'R-1', brandCode: 'x', modelCode: 'y',
    priceSnapshot: { totalPaise: 100000, commissionPaise: 10000, platformFeePaise: 2000 }, createdAt: ago(1), updatedAt: ago(1),
  });
  await Transaction.collection.insertMany([
    row(R.SURGE_REVENUE, 3000, ago(1)),
    row(R.SURGE_REVENUE, -3000, ago(1)),
    row(R.SUBSCRIPTION_REVENUE, 49900, ago(2)),
    row(R.PROVIDER_PENALTY, -5000, ago(2)),
    row(R.ADMIN_ADJUSTMENT_DEBIT, -2500, ago(2), { owner: { kind: 'worker', id: worker }, idempotencyKey: 'giveback:abc' }),
    row(R.ADMIN_ADJUSTMENT_DEBIT, -9999, ago(2), { owner: { kind: 'worker', id: worker } }),
    row(R.RUNNER_ACCESS_FEE, -2000, ago(3), { owner: { kind: 'worker', id: worker } }),
    row(R.RUNNER_ACCESS_REFUND, 500, ago(3), { owner: { kind: 'worker', id: worker } }),
    row(R.TIP, 7000, ago(1)),
    row(R.SURGE_REVENUE, 4000, ago(2), { status: 'failed' }),
    row(R.SURGE_REVENUE, 1111, ago(30)),
  ]);
  await Fee.collection.insertMany([
    { userId: new mongoose.Types.ObjectId(), feePaise: 10000, harmScore: 1, collectionStatus: 'collected_wallet', collectedAt: ago(1), createdAt: ago(1) },
    { userId: new mongoose.Types.ObjectId(), feePaise: 10000, harmScore: 1, collectionStatus: 'pending_next_order', collectedAt: null, createdAt: ago(1) },
  ]);
  out = await analytics.money({ days: 7, now: NOW });
});
afterAll(stopMongo);

test('every stream is counted once, and only what ZappyOne keeps', () => {
  expect(out.current).toMatchObject({
    commissionPaise: 10000, platformFeePaise: 2000, surgePaise: 3000, subscriptionPaise: 49900,
    penaltyPaise: 7500, errandPassPaise: 1500, cancellationPaise: 1500,
  });
  expect(out.current.takePaise).toBe(10000 + 2000 + 3000 + 49900 + 7500 + 1500 + 1500);
  expect(out.cancelKeepPct).toBe(15);
});

test('each day carries its own breakdown, and the days add up to the period', () => {
  expect(out.daily).toHaveLength(7);
  const yesterday = out.daily.find((d) => d.date === istDay(ago(1)));
  expect(yesterday).toMatchObject({ commissionPaise: 10000, surgePaise: 3000, cancellationPaise: 1500, jobs: 1 });
  expect(out.daily.reduce((s, d) => s + d.takePaise, 0)).toBe(out.current.takePaise);
});

test('a surge older than the period sits in the previous one', () => {
  expect(out.previous.surgePaise).toBe(0);
  expect(out.delta).toHaveProperty('surgePaise');
});
