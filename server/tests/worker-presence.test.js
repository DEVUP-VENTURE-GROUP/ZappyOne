/**
 * Presence: a worker is "online" only while really there.
 *   - the heartbeat keeps a still phone online; silence past the window sets
 *     them offline (and only them)
 *   - customers are never shown, and repairs never offered to, a silent worker
 *   - a job nobody takes reaches offline providers nearby after the wave time,
 *     once, and the customer hears it is taking longer after the slow time
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let Worker; let presence; let waves; let HelpingTask;
const adminId = new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Madhapur' };

beforeAll(async () => {
  await startMongo();
  Worker = require('../src/modules/worker/worker.model');
  presence = require('../src/modules/worker/presence');
  waves = require('../src/modules/jobs/waves');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  await require('../src/modules/pricing/services/config.service').updateActiveConfig({ presenceOfflineMinutes: 5, staleNudgeMinutes: 5, staleRedispatchMinutes: 10 }, adminId);
});
afterAll(stopMongo);

const ago = (min) => new Date(Date.now() - min * 60000);
async function worker(phone, { online = true, seenMinAgo = 0 } = {}) {
  const _id = new mongoose.Types.ObjectId();
  await Worker.collection.insertOne({
    _id, phone, name: phone, isBlocked: false, kyc: { status: 'approved' }, isOnline: online,
    lastSeenAt: ago(seenMinAgo), currentLocation: { type: 'Point', coordinates: HERE.coordinates },
  });
  return _id;
}

test('the heartbeat keeps a still phone online; silence past the window sets only that worker offline', async () => {
  const still = await worker('9700000001', { seenMinAgo: 4 });
  const silent = await worker('9700000002', { seenMinAgo: 9 });
  expect((await presence.heartbeat({ workerId: still })).isOnline).toBe(true);

  await presence.sweep();
  expect((await Worker.findById(still).lean()).isOnline).toBe(true);
  expect((await Worker.findById(silent).lean()).isOnline).toBe(false);
  // The app learns it from its next heartbeat.
  expect((await presence.heartbeat({ workerId: silent })).isOnline).toBe(false);
});

test('only live workers count as available', async () => {
  const live = await worker('9700000003', { seenMinAgo: 1 });
  const stale = await worker('9700000004', { seenMinAgo: 8 }); // flag still says online
  const off = await worker('9700000005', { online: false });
  const ids = await presence.liveIds([live, stale, off]);
  expect([...ids]).toEqual([String(live)]);
});

test('taking a job from an offline alert puts the worker on duty', async () => {
  const w = await worker('9700000006', { online: false, seenMinAgo: 60 });
  await presence.markLive(w);
  expect((await presence.liveIds([w])).has(String(w))).toBe(true);
});

test('a job nobody takes: offline wave after 5 minutes, slow notice after 10, each once', async () => {
  const userId = new mongoose.Types.ObjectId();
  const t = await HelpingTask.create({
    reference: 'HT-WV-1', userId, serviceType: 'shopping', status: 'WORKER_SEARCHING', pickupLocation: HERE, destination: HERE,
    statusHistory: [{ status: 'WORKER_SEARCHING', at: ago(6) }], charge: { serviceChargePaise: 10000, workerEarningPaise: 9000 },
  });
  let out = await waves.sweep();
  expect(out.offlineWaves).toBe(1);
  expect(out.slowNotices).toBe(0);
  expect((await HelpingTask.findById(t._id).lean()).matching.offlineWaveAt).toBeTruthy();

  await HelpingTask.updateOne({ _id: t._id }, { $set: { statusHistory: [{ status: 'WORKER_SEARCHING', at: ago(11) }] } });
  out = await waves.sweep();
  expect(out.offlineWaves).toBe(0); // not twice
  expect(out.slowNotices).toBe(1);
  out = await waves.sweep();
  expect(out.slowNotices).toBe(0);
});
