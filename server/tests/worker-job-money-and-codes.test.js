/**
 * After an inspection booking, on the worker's side:
 *   - the start code is asked before diagnosis at the customer's location
 *     (doorstep, roadside, inspection-only), once, covering the repair too
 *   - a repair's platform fee and GST stay with ZappyOne, not the provider
 *   - one job's breakdown (jobs/earnings forJob) adds up and matches Earnings
 */
process.env.NODE_ENV = 'test';
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const handover = require('../src/modules/repair/services/handover.service');
const { splitFor } = require('../src/modules/repair/services/settlement.service');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');

beforeAll(startMongo);
afterAll(stopMongo);

test('the start code guards diagnosis wherever work happens at the customer', () => {
  for (const mode of ['doorstep', 'roadside', 'diagnosis_only']) {
    expect(handover.gateFor('DIAGNOSING', mode)).toBe('start');
    expect(handover.gateFor('REPAIR_IN_PROGRESS', mode)).toBe('start');
  }
  // At the shop, or after a pickup, nobody is at the customer's door.
  expect(handover.gateFor('DIAGNOSING', 'workshop')).toBeNull();
  expect(handover.gateFor('DIAGNOSING', 'pickup_repair')).toBeNull();
});

test('one code: given before diagnosis, the repair start does not ask again', async () => {
  const booking = { _id: new mongoose.Types.ObjectId(), serviceMode: 'doorstep', otpVerified: {} };
  await expect(handover.assertGatePassed(booking, 'DIAGNOSING')).rejects.toMatchObject({ code: 'OTP_REQUIRED', otpKind: 'start' });
  booking.otpVerified.startAt = new Date();
  await expect(handover.assertGatePassed(booking, 'DIAGNOSING')).resolves.toBeUndefined();
  await expect(handover.assertGatePassed(booking, 'REPAIR_IN_PROGRESS')).resolves.toBeUndefined();
});

test('platform fee and GST are ZappyOne\'s; the provider gets the work less commission', () => {
  const booking = { _id: 'x', priceSnapshot: { subtotalPaise: 100000, platformFeePaise: 1000, taxPaise: 18180, totalPaise: 119180, commissionPaise: 10000 } };
  expect(splitFor(booking)).toEqual({ totalPaise: 119180, platformPaise: 29180, providerPaise: 90000 });
});

test('a job\'s breakdown adds up and matches the Earnings page', async () => {
  const workerId = new mongoose.Types.ObjectId();
  const doc = await RepairBooking.collection.insertOne({
    reference: 'RP-TEST-1', status: 'COMPLETED', completedAt: new Date(), workerId, userId: new mongoose.Types.ObjectId(),
    paymentMethod: 'cash', vertical: 'mobile',
    priceSnapshot: { subtotalPaise: 100000, platformFeePaise: 1000, taxPaise: 0, totalPaise: 101000, commissionPaise: 10000 },
    surge: { paise: 5000, providerPaise: 3000, platformPaise: 2000, lines: [{ type: 'rain', label: 'Rain fee', paise: 5000 }] },
    tip: { paise: 2000, method: 'with_payment' },
  });
  const { forJob, finishedJobs } = require('../src/modules/jobs/earnings');
  const e = await forJob('repair', doc.insertedId);

  expect(e.customerPaidPaise).toBe(101000 + 5000 + 2000);
  expect(e.bill.map((l) => l.label)).toEqual(['Service', 'Platform fee', 'Rain fee', 'Tip']);
  expect(e.youEarnPaise).toBe(90000 + 3000 + 2000);
  expect(e.zappyKeepsPaise).toBe(10000 + 1000 + 2000);
  expect(e.customerPaidPaise).toBe(e.youEarnPaise + e.zappyKeepsPaise);
  expect(e.cash).toBe(true);

  const [row] = await finishedJobs({ workerId }, new Date(0));
  expect(row.paise + row.tipPaise).toBe(e.youEarnPaise);
});
