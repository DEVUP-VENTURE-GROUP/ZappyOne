/**
 * Arrival, end to end (jobs/arrival, jobs/promise, worker go-online):
 *   - going online needs a real location fix (within 500 m)
 *   - the estimate is the provider's live position to the door
 *   - a promise starts when a visit is accepted, is kept on arrival, is
 *     missed (customer told, once) when late, and closes on a hand-back
 */
jest.mock('../src/modules/maps/google-maps.service', () => ({
  getDistanceMatrix: jest.fn(async () => { throw new Error('no network in tests'); }),
}));
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let HelpingTask; let Worker; let promise; let arrival;
const DOOR = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' }; // [lng, lat]
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Worker = require('../src/modules/worker/worker.model');
  promise = require('../src/modules/jobs/promise');
  arrival = require('../src/modules/jobs/arrival');
});
afterAll(stopMongo);

const worker = (km = 2) => Worker.create({
  name: 'Ravi', phone: `98${String(Math.random()).slice(2, 10)}`, isOnline: true,
  // ~km north of the door
  currentLocation: { type: 'Point', coordinates: [78.3915, 17.4483 + km / 111], updatedAt: new Date() },
});
const task = (workerId, status = 'WORKER_ACCEPTED') => {
  n += 1;
  return HelpingTask.create({
    reference: `HT-AR-${n}`, userId: new mongoose.Types.ObjectId(), workerId, serviceType: 'pickup', status,
    pickupLocation: DOOR, destination: DOOR, charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash',
  });
};

test('going online with a laptop-grade location is refused; a phone fix is fine', async () => {
  const w = await worker();
  await expect(require('../src/modules/worker/worker.service').goOnline({ workerId: w._id, lat: 17.44, lng: 78.39, accuracy: 2500 }))
    .rejects.toMatchObject({ code: 'LOCATION_TOO_ROUGH', status: 422 });
});

test('estimate: live position to the door, road speed when Google is unavailable; 10-min mark only when inside it', async () => {
  const near = await worker(1); const far = await worker(8);
  const est = await arrival.forProviders([{ kind: 'worker', id: near._id }, { kind: 'worker', id: far._id }], { lat: 17.4483, lng: 78.3915 });
  const a = est.get(`worker:${near._id}`); const b = est.get(`worker:${far._id}`);
  expect(a).toMatchObject({ source: 'estimate', withinPromise: true });
  expect(b.withinPromise).toBe(false);
  expect(b.minutes).toBeGreaterThan(a.minutes);
});

test('promise: set on accept, kept on arrival', async () => {
  const w = await worker(1);
  const t = await task(w._id);
  await promise.onStatus('helping', t.toObject(), 'WORKER_ACCEPTED');
  const p = await promise.ArrivalPromise.findOne({ jobId: t._id }).lean();
  expect(p.promisedMinutes).toBeGreaterThan(0);
  expect(p.promisedBy.getTime()).toBeGreaterThan(Date.now());
  await promise.onStatus('helping', t.toObject(), 'ARRIVED');
  expect(await promise.viewFor(t._id)).toMatchObject({ onTime: true, late: false });
});

test('promise: missed → customer told once; arriving later is recorded late', async () => {
  const w = await worker(1);
  const t = await task(w._id, 'EN_ROUTE');
  await promise.onStatus('helping', t.toObject(), 'WORKER_ACCEPTED');
  await promise.ArrivalPromise.updateOne({ jobId: t._id }, { $set: { promisedBy: new Date(Date.now() - 20 * 60000) } });
  expect((await promise.sweep()).told).toBe(1);
  expect((await promise.sweep()).told).toBe(0);
  expect((await promise.viewFor(t._id)).late).toBe(true);
  await promise.onStatus('helping', t.toObject(), 'ARRIVED');
  const p = await promise.ArrivalPromise.findOne({ jobId: t._id }).lean();
  expect(p).toMatchObject({ onTime: false });
  expect(p.lateMinutes).toBeGreaterThanOrEqual(19);
  expect((await promise.onTimeRates([w._id])).size).toBe(0); // fewer than 3 visits: neutral
});

test('handed back: the promise closes without counting against anyone', async () => {
  const w = await worker(1);
  const t = await task(w._id);
  await promise.onStatus('helping', t.toObject(), 'WORKER_ACCEPTED');
  await promise.onStatus('helping', t.toObject(), 'WORKER_SEARCHING');
  const p = await promise.ArrivalPromise.findOne({ jobId: t._id }).lean();
  expect(p).toMatchObject({ closed: true, onTime: null, missedAt: null });
});
