// Errand runners: no commission; a pass per window with enough finished errands, charged once; a runner limit stops new errands.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let ra; let cfg; let HelpingTask; let Wallet; let dues;
beforeAll(async () => {
  await startMongo();
  ra = require('../src/modules/jobs/runner-access');
  cfg = require('../src/modules/pricing/services/config.service');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Wallet = require('../src/modules/wallet/wallet.model');
  dues = require('../src/modules/worker/worker-dues.service');
  // The ledger's unique key is what stops a second charge; production has the index, a fresh test database must build it first.
  await require('../src/modules/payment/transaction.model').init();
});
afterAll(stopMongo);

const ist = (h) => new Date(Date.UTC(2026, 10, 14, h, 30) - 330 * 60000);
const done = (workerId, at, serviceType = 'shopping') => HelpingTask.collection.insertOne({
  workerId, serviceType, status: 'COMPLETED', completedAt: at, reference: `ZH${Math.random().toString(36).slice(2, 8)}`,
});
const owed = async (workerId) => -((await Wallet.findOne({ 'owner.id': workerId }).lean())?.balancePaise || 0);

test('the pass is charged once per window, only from the minimum number of errands', async () => {
  const s = await cfg.runnerAccessSettings();
  const w = new mongoose.Types.ObjectId();
  for (let i = 1; i < s.minJobs; i += 1) { await done(w, ist(9)); expect(await ra.onJobDone(w, ist(9))).toBeNull(); }
  await done(w, ist(10));
  expect((await ra.onJobDone(w, ist(10))).feePaise).toBe(s.feePaise);
  await done(w, ist(11));
  await ra.onJobDone(w, ist(11));
  expect(await owed(w)).toBe(s.feePaise);
  for (let i = 0; i < s.minJobs; i += 1) await done(w, ist(15));
  await ra.onJobDone(w, ist(15));
  expect(await owed(w)).toBe(2 * s.feePaise);
});

test('Family Assist errands do not count, and partner errands carry no commission', async () => {
  const s = await cfg.runnerAccessSettings();
  const w = new mongoose.Types.ObjectId();
  for (let i = 0; i < s.minJobs + 2; i += 1) await done(w, ist(9), 'doctor_escort');
  expect(await ra.onJobDone(w, ist(9))).toBeNull();
  expect(await ra.commissionFree()).toBe(s.on);
});

test('at the runner limit no new errand can be taken', async () => {
  const s = await cfg.runnerAccessSettings();
  const w = new mongoose.Types.ObjectId();
  await require('../src/modules/wallet/wallet.service').apply({ kind: 'worker', id: w, type: 'debit', amountPaise: s.limitPaise, allowDebt: true, reason: 'runner_access_fee', idempotencyKey: `t-${w}` });
  await expect(ra.assertCanTakeErrand(w)).rejects.toMatchObject({ code: 'WALLET_BLOCKED' });
  const ok = await dues.assertCanWork(w);
  expect(ok.isBlocked).toBe(false);
});

test('windows line up with India midnight', () => {
  const w = ra.windowOf(ist(13), 12);
  expect(w.from.toISOString()).toBe(new Date(Date.UTC(2026, 10, 14, 12, 0) - 330 * 60000).toISOString());
});
