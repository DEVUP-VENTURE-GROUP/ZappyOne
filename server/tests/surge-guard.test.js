/**
 * Surge cannot be gamed from either side (jobs/surge-guard):
 * a provider's own searches never make an area busy, providers going offline
 * together cannot make a surge, and the same customer and provider surging
 * again and again has the provider's share held until admin decides.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let guard; let surge; let HelpingTask; let Transaction; let User; let Worker; let fraud;
let n = 0;
const DOOR = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };

beforeAll(async () => {
  await startMongo();
  guard = require('../src/modules/jobs/surge-guard');
  surge = require('../src/modules/jobs/surge');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Transaction = require('../src/modules/payment/transaction.model');
  await Transaction.init();
  User = require('../src/modules/user/user.model');
  Worker = require('../src/modules/worker/worker.model');
  fraud = require('../src/modules/fraud/fraud.service');
});
afterAll(stopMongo);

const surgeJob = (userId, workerId) => {
  n += 1;
  return HelpingTask.create({
    reference: `HT-GD-${n}`, userId, workerId, serviceType: 'pickup', status: 'COMPLETED', paymentStatus: 'paid', paymentMethod: 'online',
    pickupLocation: DOOR, destination: DOOR, charge: { serviceChargePaise: 20000, workerEarningPaise: 16000 },
    surge: { paise: 5000, lines: [{ type: 'surge', label: 'Surge fee', paise: 5000 }], providerPaise: 3000, platformPaise: 2000 },
  });
};

test('demand: a signed-in customer counts; a guest and a provider\'s own account do not', async () => {
  const customer = await User.create({ name: 'Real Customer', phone: '9811111111' });
  const providerAlt = await User.create({ name: 'Worker Alt', phone: '9822222222' });
  await Worker.create({ name: 'Worker', phone: '9822222222' });
  expect(await guard.countsAsDemand(customer._id)).toBe(true);
  expect(await guard.countsAsDemand(providerAlt._id)).toBe(false);
  expect(await guard.countsAsDemand(null)).toBe(false);
});

test('supply: providers dropping off together count only slowly', async () => {
  const zone = `z-${Date.now()}`;
  for (let i = 0; i < 10; i += 1) await guard.steadySupply('shopping_pickup', zone, 10);
  const dropped = await guard.steadySupply('shopping_pickup', zone, 2);
  expect(dropped).toEqual({ supply: 7, damped: true }); // 70% of the hour's median, not 2
  const normal = await guard.steadySupply('shopping_pickup', `${zone}-b`, 4);
  expect(normal).toEqual({ supply: 4, damped: false });
});

test('farming: the third surge job between the same pair holds the share; dismissing pays it, once', async () => {
  const userId = new mongoose.Types.ObjectId();
  const workerId = new mongoose.Types.ObjectId();
  const a = await surgeJob(userId, workerId);
  const b = await surgeJob(userId, workerId);
  await surge.settleSurge('helping', a._id);
  await surge.settleSurge('helping', b._id);
  expect(await Transaction.countDocuments({ idempotencyKey: { $in: [`surge:provider:helping:${a._id}`, `surge:provider:helping:${b._id}`] } })).toBe(2);

  const c = await surgeJob(userId, workerId);
  await surge.settleSurge('helping', c._id);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:provider:helping:${c._id}` })).toBe(0);
  expect((await HelpingTask.findById(c._id).lean()).surge.heldAt).toBeTruthy();
  // ZappyOne's own share is booked as usual; only the provider's waits.
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:platform:helping:${c._id}` })).toBe(1);

  const FraudEvent = require('../src/modules/fraud/fraud.model');
  const ev = await FraudEvent.findOne({ type: 'surge_farming', 'details.bookingId': String(c._id) }).lean();
  expect(ev).toMatchObject({ actorKind: 'worker', status: 'open' });
  expect(ev.details).toMatchObject({ surgeJobs: 3, heldPaise: 3000 });

  // While held, it is not counted as earned.
  expect(surge.providerSurgePaise(await HelpingTask.findById(c._id).lean())).toBe(0);
  expect(surge.heldSurgePaise(await HelpingTask.findById(c._id).lean())).toBe(3000);

  const out = await fraud.resolveEvent(ev._id, { status: 'dismissed', adminId: new mongoose.Types.ObjectId() });
  expect(out.releasedPaise).toBe(3000);
  expect(surge.providerSurgePaise(await HelpingTask.findById(c._id).lean())).toBe(3000);
  await surge.releaseHeld('helping', c._id); // a second release does nothing
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:release:helping:${c._id}`, amountPaise: 3000 })).toBe(1);
});

test('farming confirmed (blocked or escalated): the held share stays with ZappyOne', async () => {
  const userId = new mongoose.Types.ObjectId();
  const workerId = new mongoose.Types.ObjectId();
  for (let i = 0; i < 2; i += 1) await surge.settleSurge('helping', (await surgeJob(userId, workerId))._id);
  const c = await surgeJob(userId, workerId);
  await surge.settleSurge('helping', c._id);
  const FraudEvent = require('../src/modules/fraud/fraud.model');
  const ev = await FraudEvent.findOne({ type: 'surge_farming', 'details.bookingId': String(c._id) }).lean();
  const out = await fraud.resolveEvent(ev._id, { status: 'escalated' });
  expect(out.releasedPaise).toBe(0);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:release:helping:${c._id}` })).toBe(0);
});

test('hopping: a worker who kept switching on around a surge booking has the share held', async () => {
  const workerId = new mongoose.Types.ObjectId();
  for (let i = 0; i < 3; i += 1) await guard.noteOnline(workerId);
  const c = await surgeJob(new mongoose.Types.ObjectId(), workerId);
  await surge.settleSurge('helping', c._id);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:provider:helping:${c._id}` })).toBe(0);
  const FraudEvent = require('../src/modules/fraud/fraud.model');
  const ev = await FraudEvent.findOne({ type: 'surge_farming', 'details.bookingId': String(c._id) }).lean();
  expect(ev.details).toMatchObject({ reasons: ['on_off_switching'], onlineSwitches: 3 });
  // Switching on once or twice is normal: paid as usual.
  const calm = new mongoose.Types.ObjectId();
  await guard.noteOnline(calm);
  const d = await surgeJob(new mongoose.Types.ObjectId(), calm);
  await surge.settleSurge('helping', d._id);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:provider:helping:${d._id}` })).toBe(1);
});
