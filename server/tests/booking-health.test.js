// Booking health: per service, made, finished, cancelled by whom, never got a provider, still waiting, and minutes to acceptance.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const { bookingHealth } = require('../src/modules/admin-portal/booking-health.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const task = (status, extra = {}) => {
  const createdAt = new Date(Date.now() - 3600000);
  return {
    reference: `ZH${Math.random().toString(36).slice(2, 10)}`, userId: new mongoose.Types.ObjectId(), serviceType: 'grocery_run',
    pickupLocation: { type: 'Point', coordinates: [78.48, 17.38] }, status, createdAt, statusHistory: [{ status: 'CONFIRMED', at: createdAt }], ...extra,
  };
};

test('counts outcomes and acceptance time per service', async () => {
  const t0 = new Date(Date.now() - 3600000);
  await HelpingTask.collection.insertMany([
    task('COMPLETED', { statusHistory: [{ status: 'CONFIRMED', at: t0 }, { status: 'WORKER_ACCEPTED', at: new Date(t0.getTime() + 4 * 60000) }] }),
    task('CANCELLED', { statusHistory: [{ status: 'CANCELLED', at: t0, byRole: 'user' }] }),
    task('CANCELLED', { statusHistory: [{ status: 'CANCELLED', at: t0, byRole: 'system' }] }),
    task('WORKER_SEARCHING'),
  ]);
  const out = await bookingHealth({ days: 7 });
  const helping = out.kinds.find((k) => k.kind === 'helping');
  expect(helping).toMatchObject({ made: 4, done: 1, cancelledByCustomer: 1, cancelledOther: 1, waiting: 1, acceptMedianMin: 4 });
  expect(helping.services[0]).toMatchObject({ service: 'grocery_run', lostPct: 25 });
});
