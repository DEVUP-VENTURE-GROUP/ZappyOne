// A payout that fails part way is queued again, once per booking, and the rerun reads the booking fresh and pays.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let settlement; let jobs; let RepairBooking;
beforeAll(async () => {
  await startMongo();
  settlement = require('../src/modules/payment/settlement');
  jobs = require('../src/jobs');
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  await require('../src/modules/payment/transaction.model').init();
});
afterAll(stopMongo);

test('a failed payout is queued for a retry with its own job id', async () => {
  const add = jest.spyOn(jobs.paymentsQueue, 'add').mockResolvedValue({});
  const bad = { _id: new mongoose.Types.ObjectId(), shopId: null, get workerId() { throw new Error('database blip'); } };
  const out = await settlement.settleSafely({ source: 'repair', booking: bad, reference: 'R1', paymentMethod: 'online', totalPaise: 10000, platformPaise: 1000 });
  expect(out).toMatchObject({ settled: false, retrying: true });
  expect(add).toHaveBeenCalledWith('resettle', expect.objectContaining({ source: 'repair', bookingId: String(bad._id), totalPaise: 10000 }), { jobId: `resettle:repair:${bad._id}` });
  add.mockRestore();
});

test('the retry reads the booking fresh and settles it; a missing booking is reported, not thrown', async () => {
  const workerId = new mongoose.Types.ObjectId();
  const b = await RepairBooking.create({
    reference: 'RS1', userId: new mongoose.Types.ObjectId(), workerId, vertical: 'mobile', brandCode: 'x', modelCode: 'y', serviceMode: 'doorstep', status: 'COMPLETED',
    location: { type: 'Point', coordinates: [78.38, 17.44], address: 'T' }, priceSnapshot: { subtotalPaise: 10000, totalPaise: 10000 }, statusHistory: [{ status: 'COMPLETED', at: new Date() }],
  });
  const r = await settlement.resettle({ source: 'repair', bookingId: String(b._id), reference: 'RS1', paymentMethod: 'online', totalPaise: 10000, platformPaise: 1000 });
  expect(r.settled).not.toBe(false);
  const again = await settlement.resettle({ source: 'repair', bookingId: String(b._id), reference: 'RS1', paymentMethod: 'online', totalPaise: 10000, platformPaise: 1000 });
  const Transaction = require('../src/modules/payment/transaction.model');
  expect(await Transaction.countDocuments({ 'owner.id': workerId, reason: 'worker_earning' })).toBe(1);
  void again;
  expect(await settlement.resettle({ source: 'repair', bookingId: String(new mongoose.Types.ObjectId()) })).toMatchObject({ reason: 'not_found' });
});
