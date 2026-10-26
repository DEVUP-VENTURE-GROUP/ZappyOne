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

test('missed orders lists each lost order with when, why and the hour it was made', async () => {
  const { missedOrders } = require('../src/modules/admin-portal/booking-health.service');
  const t0 = new Date(Date.now() - 1800000);
  await HelpingTask.collection.insertMany([
    task('FAILED', { reference: 'ZHNOBODY1', pickupLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Madhapur' }, createdAt: t0, statusHistory: [{ status: 'CONFIRMED', at: t0 }, { status: 'FAILED', at: new Date(t0.getTime() + 15 * 60000), note: 'No worker accepted' }] }),
  ]);
  const out = await missedOrders({ days: 7 });
  const row = out.orders.find((o) => o.reference === 'ZHNOBODY1');
  expect(row).toMatchObject({ kind: 'helping', service: 'grocery_run', by: 'nobody accepted', waitedMin: 15, reason: 'No worker accepted', area: 'Madhapur' });
  expect(out.orders.some((o) => o.by === 'user')).toBe(false);
  expect(out.orders.filter((o) => o.kind === 'helping')).toHaveLength(2);
  expect(out.hours).toHaveLength(24);
  expect(out.hours.reduce((s, h) => s + h.missed, 0)).toBe(out.total);
  expect(out.hours.reduce((s, h) => s + h.made, 0)).toBe(5);
});
