/**
 * Booking for someone else: the person at the door is validated (a name and
 * an Indian mobile), saved once on a new booking, never on a replay.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let onSite; let PetBooking;
beforeAll(async () => {
  await startMongo();
  onSite = require('../src/modules/jobs/on-site');
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
});
afterAll(stopMongo);

test('name and a 10-digit Indian mobile; bad numbers are refused in plain words', () => {
  expect(onSite.onSiteSchema.validate({ name: 'Amma', phone: '9876543210' }).error).toBeUndefined();
  expect(onSite.onSiteSchema.validate(null).error).toBeUndefined();
  expect(onSite.onSiteSchema.validate({ name: 'Amma', phone: '12345' }).error.message).toBe('Enter their 10-digit mobile number');
});

test('saved on a new booking, not on a replayed one', async () => {
  const r = await PetBooking.collection.insertOne({ userId: new mongoose.Types.ObjectId(), reference: 'P-x', status: 'BOOKED', createdAt: new Date() });
  expect(await onSite.saveOnSite(PetBooking, r.insertedId, { name: ' Amma ', phone: '9876543210' }, true)).toBeNull();
  expect(await onSite.saveOnSite(PetBooking, r.insertedId, { name: ' Amma ', phone: '9876543210' }, false)).toEqual({ name: 'Amma', phone: '9876543210' });
  expect((await PetBooking.findById(r.insertedId).lean()).onSite).toEqual({ name: 'Amma', phone: '9876543210' });
});
