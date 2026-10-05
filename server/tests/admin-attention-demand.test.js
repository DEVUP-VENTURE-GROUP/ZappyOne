/**
 * Admin, at a glance:
 *   - Bookings → Needs intervention lists jobs past their time limit, then jobs
 *     still waiting for a provider; jobs with a provider and inside their limit
 *     are not there
 *   - Overview → what customers search for, counted by person, what we could
 *     not serve, and which services are rising
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let ops; let demand; let PetBooking; let SearchEvent;

beforeAll(async () => {
  await startMongo();
  ops = require('../src/modules/jobs/ops.service');
  demand = require('../src/modules/admin-portal/search-demand.service');
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  ({ SearchEvent } = require('../src/modules/telemetry/telemetry.model'));
});
afterAll(stopMongo);

const ago = (min) => new Date(Date.now() - min * 60000);
async function petJob(status, minutes, withWorker = false) {
  const at = ago(minutes);
  await PetBooking.collection.insertOne({
    userId: new mongoose.Types.ObjectId(), workerId: withWorker ? new mongoose.Types.ObjectId() : null, shopId: null,
    reference: `PET-${Math.random().toString(36).slice(2, 7)}`, categoryCode: 'pet_grooming', status,
    statusHistory: [{ status, at }], pets: [], pricing: {}, execution: {}, createdAt: at, updatedAt: at,
  });
}

test('needs intervention: stuck first, then waiting for a provider; healthy jobs left out', async () => {
  await petJob('PROVIDER_SEARCHING', 45); // no provider past its 30-minute limit: stuck
  await petJob('PROVIDER_SEARCHING', 2); // no provider yet, inside the limit: waiting
  await petJob('PROVIDER_ACCEPTED', 5, true); // has a provider, on time: fine
  const out = await ops.attention();
  expect(out.stuck.map((j) => [j.status, j.minutesInStatus])).toEqual([['PROVIDER_SEARCHING', 45]]);
  expect(out.waiting.map((j) => [j.status, j.minutesInStatus])).toEqual([['PROVIDER_SEARCHING', 2]]);
  expect(out.count).toBe(2);
});

test('search demand: people, not keystrokes; unserved searches; rising services', async () => {
  const u1 = new mongoose.Types.ObjectId();
  const u2 = new mongoose.Types.ObjectId();
  await SearchEvent.create([
    { userId: u1, category: 'two_wheeler', query: 'bike puncture', result: 'served' },
    { userId: u1, category: 'two_wheeler', query: 'Bike Puncture', result: 'served' }, // same person again
    { userId: u2, category: 'two_wheeler', query: 'bike puncture', result: 'served' },
    { userId: u2, category: 'unmatched', query: 'ac repair', result: 'no_service', city: 'Hyderabad' },
    ...[1, 2, 3].map(() => ({ sessionId: new mongoose.Types.ObjectId().toString(), category: 'pet_grooming', result: 'served' })),
  ]);
  const out = await demand.summary();
  expect(out.topSearches[0]).toMatchObject({ query: 'bike puncture', people: 2, today: 2 });
  expect(out.unserved).toEqual([{ what: 'ac repair', city: 'Hyderabad', people: 1 }]);
  expect(out.rising.map((r) => r.service)).toContain('pet_grooming');
});
