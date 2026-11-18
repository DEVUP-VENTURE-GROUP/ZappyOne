// A job left "arrived" at the customer's door for 12 hours is closed through its own path; recent, paid or later jobs are not.
require('./env');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let RepairBooking; let abandoned;
beforeAll(async () => {
  await startMongo();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  abandoned = require('../src/modules/jobs/abandoned');
});
afterAll(stopMongo);
afterEach(() => jest.restoreAllMocks());

const HOUR = 3600 * 1000;
const repair = (status, hoursAgo, extra = {}) => {
  const at = new Date(Date.now() - hoursAgo * HOUR);
  return RepairBooking.collection.insertOne({
    reference: `A${Math.random().toString(36).slice(2, 9).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: new mongoose.Types.ObjectId(),
    vertical: 'mobile', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status,
    location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' },
    priceSnapshot: { subtotalPaise: 0, totalPaise: 0 }, statusHistory: [{ status, at }], createdAt: at, updatedAt: at, paymentStatus: 'unpaid', ...extra,
  }).then((r) => r.insertedId);
};

test('a repair at the door for 3 days fails with the reason; one there for an hour is left alone', async () => {
  const old = await repair('ARRIVED', 72);
  const fresh = await repair('ARRIVED', 1);
  const out = await abandoned.sweep();
  expect(out.closed.length).toBe(1);
  const a = await RepairBooking.findById(old).lean();
  expect(a.status).toBe('FAILED');
  expect(a.statusHistory.at(-1)).toMatchObject({ status: 'FAILED' });
  expect((await RepairBooking.findById(fresh).lean()).status).toBe('ARRIVED');
});

test('a paid repair is left for a person (it may need a refund); a workshop repair is never touched', async () => {
  const paid = await repair('ARRIVED', 48, { paymentStatus: 'paid' });
  const shop = await repair('REPAIR_IN_PROGRESS', 96);
  await abandoned.sweep();
  expect((await RepairBooking.findById(paid).lean()).status).toBe('ARRIVED');
  expect((await RepairBooking.findById(shop).lean()).status).toBe('REPAIR_IN_PROGRESS');
});

test('the 12-hour line uses when the job reached the door, not when it was made', async () => {
  const id = await repair('ARRIVED', 30, { statusHistory: [{ status: 'CONFIRMED', at: new Date(Date.now() - 30 * HOUR) }, { status: 'ARRIVED', at: new Date(Date.now() - 2 * HOUR) }] });
  await abandoned.sweep();
  expect((await RepairBooking.findById(id).lean()).status).toBe('ARRIVED');
});

test('pet care and helping close through their own cancel, once past the line; one failure does not stop the rest', async () => {
  const petClose = jest.spyOn(abandoned.RULES.pet, 'close').mockRejectedValueOnce(new Error('gateway down'));
  const helpClose = jest.spyOn(abandoned.RULES.helping, 'close').mockResolvedValue({});
  const { PetBooking } = require('../src/modules/pet/models/booking.model');
  const { HelpingTask } = require('../src/modules/helping/models/task.model');
  const at = new Date(Date.now() - 20 * HOUR);
  await PetBooking.collection.insertOne({ reference: 'PETOLD', status: 'PROVIDER_ARRIVED', statusHistory: [{ status: 'PROVIDER_ARRIVED', at }], updatedAt: at, createdAt: at });
  await HelpingTask.collection.insertMany([
    { reference: 'HOLD', status: 'ARRIVED', statusHistory: [{ status: 'ARRIVED', at }], updatedAt: at, createdAt: at },
    { reference: 'HNEW', status: 'ARRIVED', statusHistory: [{ status: 'ARRIVED', at: new Date() }], updatedAt: new Date(), createdAt: new Date() },
  ]);
  const out = await abandoned.sweep();
  expect(petClose).toHaveBeenCalledTimes(1);
  expect(helpClose).toHaveBeenCalledTimes(1);
  expect(helpClose.mock.calls[0][0].reference).toBe('HOLD');
  expect(out.closed).toEqual(expect.arrayContaining(['helping:HOLD']));
  expect(out.closed).not.toEqual(expect.arrayContaining(['pet:PETOLD']));
});
