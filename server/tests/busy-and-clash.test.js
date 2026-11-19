// "Busy for…" keeps a pro out of new offers; customers hear when one is free; two booked visits too close together are refused.
jest.mock('../src/modules/maps/google-maps.service', () => ({ getDistanceMatrix: jest.fn(async () => { throw new Error('no network in tests'); }) }));
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let Worker; let busy; let workload; let HelpingTask; let promise;
const MIN = 60000;
const DOOR = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
beforeAll(async () => {
  await startMongo();
  Worker = require('../src/modules/worker/worker.model');
  busy = require('../src/modules/jobs/busy');
  workload = require('../src/modules/jobs/workload');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  promise = require('../src/modules/jobs/promise');
});
afterAll(stopMongo);

const worker = () => Worker.create({
  name: 'Ravi', phone: `97${String(Math.random()).slice(2, 10)}`, isOnline: true,
  currentLocation: { type: 'Point', coordinates: [78.3915, 17.4583], updatedAt: new Date() },
});
let n = 0;
const task = (w, aheadMin) => { n += 1; return HelpingTask.create({
  reference: `HT-BC-${n}`, userId: new mongoose.Types.ObjectId(), workerId: w?._id || null, serviceType: 'pickup', status: w ? 'WORKER_ACCEPTED' : 'WORKER_SEARCHING',
  scheduledAt: new Date(Date.now() + aheadMin * MIN), pickupLocation: DOOR, destination: DOOR,
  charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash', statusHistory: [{ status: 'WORKER_SEARCHING', at: new Date() }],
}); };

test('busy for 1 h: left out of the matching gate, back after "take new jobs again"', async () => {
  const w = await worker();
  const dues = require('../src/modules/worker/worker-dues.service');
  expect((await dues.filterWorkingWorkers([w._id])).has(String(w._id))).toBe(true);
  const out = await busy.set({ workerId: w._id, minutes: 60 });
  expect(out.message).toMatch(/No new jobs until/);
  expect((await dues.filterWorkingWorkers([w._id])).has(String(w._id))).toBe(false);
  await busy.set({ workerId: w._id, off: true });
  expect((await dues.filterWorkingWorkers([w._id])).has(String(w._id))).toBe(true);
});

test('busy choices are checked: only 1 h / 2 h, a time ahead, at most 12 h', async () => {
  const w = await worker();
  await expect(busy.set({ workerId: w._id, minutes: 45 })).rejects.toMatchObject({ code: 'BAD_MINUTES' });
  await expect(busy.set({ workerId: w._id, until: new Date(Date.now() + MIN) })).rejects.toMatchObject({ code: 'BAD_TIME' });
  await expect(busy.set({ workerId: w._id, until: new Date(Date.now() + 13 * 3600000) })).rejects.toMatchObject({ code: 'TOO_LONG' });
  expect((await busy.set({ workerId: w._id, until: new Date(Date.now() + 3 * 3600000) })).busyUntil).toBeInstanceOf(Date);
});

test('free in about X min: the soonest nearby busy pro, nothing when nobody is busy', async () => {
  const w = await worker();
  expect(await busy.freeInMin({ workerIds: [w._id], lat: 17.4483, lng: 78.3915 })).toBeNull();
  await busy.set({ workerId: w._id, minutes: 60 });
  const m = await busy.freeInMin({ workerIds: [w._id], lat: 17.4483, lng: 78.3915 });
  expect(m).toBeGreaterThanOrEqual(55);
  expect(m).toBeLessThanOrEqual(60);
  expect(await busy.freeInMin({ workerIds: [w._id], lat: 12.97, lng: 77.59 })).toBeNull();
  expect(busy.viewOf({ busyUntil: new Date(Date.now() - MIN) })).toBeNull();
});

test('a booked job too close to one the pro holds is refused; far enough apart is fine', async () => {
  const w = await worker();
  const held = await task(w, 180);
  await promise.onStatus('helping', held.toObject(), 'WORKER_ACCEPTED');
  const near = await task(null, 220);
  await expect(workload.assertCanTakeAnother(w._id, { kind: 'helping', jobId: near._id })).rejects.toMatchObject({ code: 'TIME_CLASH', status: 409 });
  const far = await task(null, 360);
  await expect(workload.assertCanTakeAnother(w._id, { kind: 'helping', jobId: far._id })).resolves.toBeUndefined();
  const cfg = require('../src/modules/pricing/services/config.service');
  const spy = jest.spyOn(cfg, 'scheduleCheckSettings').mockResolvedValue({ ...cfg.SCHEDULE_CHECK_DEFAULTS, clashGapMin: 0 });
  await expect(workload.assertNoClash(w._id, { kind: 'helping', jobId: near._id })).resolves.toBeUndefined();
  spy.mockRestore();
});

describe('over HTTP', () => {
  const request = require('supertest');
  let app; let tok;
  beforeAll(() => {
    app = require('../src/app')();
    const { signAccessToken } = require('../src/modules/auth/token.service');
    tok = (id) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role: 'worker' })}` });
  });
  test('the pro sets, reads and clears busy; bad input is refused; customers get freeInMin', async () => {
    const w = await worker();
    expect((await request(app).post('/api/jobs/busy').set(tok(w._id)).send({})).status).toBe(400);
    expect((await request(app).post('/api/jobs/busy').set(tok(w._id)).send({ minutes: 60, off: true })).status).toBe(400);
    const set = await request(app).post('/api/jobs/busy').set(tok(w._id)).send({ minutes: 120 });
    expect(set.status).toBe(200);
    expect((await request(app).get('/api/jobs/busy').set(tok(w._id))).body.busyUntil).toBeTruthy();
    await request(app).post('/api/jobs/busy').set(tok(w._id)).send({ off: true });
    expect((await request(app).get('/api/jobs/busy').set(tok(w._id))).body.busyUntil).toBeNull();
    const user = { Authorization: `Bearer ${require('../src/modules/auth/token.service').signAccessToken({ sub: String(new mongoose.Types.ObjectId()), role: 'user' })}` };
    const arr = await request(app).get('/api/jobs/arrival').query({ line: 'nothing_here', lat: 17.44, lng: 78.39 }).set(user);
    expect(arr.status).toBe(200);
    expect(arr.body).toHaveProperty('freeInMin');
  });
});
