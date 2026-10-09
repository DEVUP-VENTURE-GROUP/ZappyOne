/**
 * Repeats (jobs/recurring): made from a customer's own booking; each repeat is
 * booked AHEAD_DAYS before with the same provider first, anyone if not; skip,
 * pause, resume, stop; a repeat that cannot be booked is skipped and told.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let rec; let HelpingTask; let taskService;
const HERE = { type: 'Point', coordinates: [78.39, 17.44], address: 'Madhapur' };

beforeAll(async () => {
  await startMongo();
  rec = require('../src/modules/jobs/recurring');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  taskService = require('../src/modules/helping/services/task.service');
});
afterAll(stopMongo);

const source = (userId) => HelpingTask.create({
  reference: `HT-RC-${Math.random().toString(36).slice(2, 7)}`, userId, workerId: new mongoose.Types.ObjectId(), serviceType: 'shopping', status: 'COMPLETED',
  title: 'Weekly groceries', pickupLocation: HERE, destination: HERE, items: [{ name: 'Milk', quantity: 2 }],
  charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash', completedAt: new Date(),
  scheduledAt: new Date(Date.now() - 2 * 86400e3),
});

test('made from their own booking, once; the next one an interval on; not for pet care', async () => {
  const userId = new mongoose.Types.ObjectId();
  const b = await source(userId);
  const r = await rec.create({ kind: 'helping', bookingId: b._id, userId, every: 'week' });
  expect(r.plan.template).toMatchObject({ serviceType: 'shopping', items: [{ name: 'Milk', quantity: 2 }] });
  expect(new Date(r.plan.nextAt).getTime()).toBeGreaterThan(Date.now());
  await expect(rec.create({ kind: 'helping', bookingId: b._id, userId, every: 'month' })).rejects.toMatchObject({ code: 'ALREADY_REPEATS' });
  await expect(rec.create({ kind: 'helping', bookingId: b._id, userId: new mongoose.Types.ObjectId(), every: 'week' })).rejects.toMatchObject({ status: 404 });
  await expect(rec.create({ kind: 'pet', bookingId: b._id, userId, every: 'week' })).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
});

test('booked ahead with the same provider first, anyone when they cannot; then moves on', async () => {
  const userId = new mongoose.Types.ObjectId();
  const b = await source(userId);
  const { plan } = await rec.create({ kind: 'helping', bookingId: b._id, userId, every: 'week' });
  const calls = [];
  const spy = jest.spyOn(taskService, 'createTask').mockImplementation(async (args) => {
    calls.push(args);
    if (calls.length === 1) throw new Error('provider busy');
    return { task: { _id: new mongoose.Types.ObjectId() } };
  });
  await rec.RecurringPlan.updateOne({ _id: plan._id }, { $set: { nextAt: new Date(Date.now() + 86400e3) } });
  expect(await rec.generateDue()).toMatchObject({ made: 1 });
  expect(calls).toHaveLength(2);
  expect(calls[0].idempotencyKey).toMatch(/^recur:/);
  const after = await rec.RecurringPlan.findById(plan._id).lean();
  expect(after.made).toBe(1);
  expect(after.nextAt.getTime() - Date.now()).toBeGreaterThan(7 * 86400e3);
  spy.mockRestore();
});

test('cannot be booked and nearly due: skipped and told; three misses pause it', async () => {
  const userId = new mongoose.Types.ObjectId();
  const b = await source(userId);
  const { plan } = await rec.create({ kind: 'helping', bookingId: b._id, userId, every: 'week' });
  const spy = jest.spyOn(taskService, 'createTask').mockRejectedValue(new Error('nobody'));
  await rec.RecurringPlan.updateOne({ _id: plan._id }, { $set: { nextAt: new Date(Date.now() + 3600e3), failures: 2 } });
  expect(await rec.generateDue()).toMatchObject({ failed: 1 });
  expect((await rec.RecurringPlan.findById(plan._id).lean()).status).toBe('paused');
  spy.mockRestore();
});

test('skip, pause, resume, stop', async () => {
  const userId = new mongoose.Types.ObjectId();
  const b = await source(userId);
  const { plan } = await rec.create({ kind: 'helping', bookingId: b._id, userId, every: '2weeks' });
  const skipped = await rec.act({ id: plan._id, userId, action: 'skip' });
  expect(new Date(skipped.nextAt) - new Date(plan.nextAt)).toBe(14 * 86400e3);
  expect((await rec.act({ id: plan._id, userId, action: 'pause' })).status).toBe('paused');
  expect((await rec.act({ id: plan._id, userId, action: 'resume' })).status).toBe('active');
  await rec.act({ id: plan._id, userId, action: 'stop' });
  expect(await rec.mine(userId)).toHaveLength(0);
});
