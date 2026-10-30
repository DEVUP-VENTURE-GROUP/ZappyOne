// "Never cancels" is earned: 10+ jobs and no cancellation or no-show on record; shops never get it.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Worker = require('../src/modules/worker/worker.model');
const { providerCard } = require('../src/modules/worker/provider-card');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const worker = (over) => Worker.collection.insertOne({ name: 'Ravi Kumar', phone: `9${Math.floor(Math.random() * 1e9)}`, completedJobs: 12, penalties: { totalCancels: 0, totalNoShows: 0 }, ...over });

test('earned only with enough jobs and a clean record', async () => {
  const clean = await worker({});
  expect((await providerCard({ workerId: clean.insertedId })).neverCancels).toBe(true);
  const fresh = await worker({ completedJobs: 4 });
  expect((await providerCard({ workerId: fresh.insertedId })).neverCancels).toBe(false);
  const cancelled = await worker({ penalties: { totalCancels: 1, totalNoShows: 0 } });
  expect((await providerCard({ workerId: cancelled.insertedId })).neverCancels).toBe(false);
  const noShow = await worker({ penalties: { totalCancels: 0, totalNoShows: 1 } });
  expect((await providerCard({ workerId: noShow.insertedId })).neverCancels).toBe(false);
  expect((await providerCard({ workerId: new mongoose.Types.ObjectId() }))).toBeNull();
});
