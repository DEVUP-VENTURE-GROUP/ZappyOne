/**
 * Passing on offers: one pass costs nothing; workerRejectLimit passes in a row
 * set the worker offline (no money); taking a job resets the run.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let Worker; let streak;
const workerId = new mongoose.Types.ObjectId();
const state = () => Worker.findById(workerId).select('isOnline isAvailable penalties').lean();

beforeAll(async () => {
  await startMongo();
  Worker = require('../src/modules/worker/worker.model');
  streak = require('../src/modules/jobs/offer-streak');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000777', name: 'Kiran', isOnline: true, isAvailable: true, isBlocked: false, kyc: { status: 'approved' } });
});
afterAll(stopMongo);

test('passes below the limit only count', async () => {
  for (let i = 0; i < 4; i += 1) expect(await streak.passed(workerId)).toBe(false);
  const w = await state();
  expect(w.isOnline).toBe(true);
  expect(w.penalties.rejectStreak).toBe(4);
  expect(w.penalties.totalRejects).toBe(4);
});

test('taking a job resets the run', async () => {
  await streak.took(workerId);
  expect((await state()).penalties.rejectStreak).toBe(0);
});

test('the fifth pass in a row sets the worker offline, without a charge', async () => {
  for (let i = 0; i < 4; i += 1) await streak.passed(workerId);
  expect(await streak.passed(workerId)).toBe(true);
  const w = await state();
  expect(w.isOnline).toBe(false);
  expect(w.isAvailable).toBe(false);
  expect(w.penalties.rejectStreak).toBe(0);
  expect(w.penalties.totalRejects).toBe(9);
});
