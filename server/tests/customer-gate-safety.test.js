const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let HelpingTask; let gb; let gate; let safety; let abuse;
const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Start' };
const actor = { kind: 'worker', id: String(workerId) };
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  gb = require('../src/modules/jobs/give-back');
  gate = require('../src/modules/jobs/customer-gate');
  safety = require('../src/modules/jobs/safety-check');
  abuse = require('../src/modules/order/abuse.service');
  jest.spyOn(abuse, 'assertNotFrozen').mockResolvedValue(undefined);
  await require('../src/modules/user/user.model').collection.insertOne({ _id: userId, phone: '9000009911', name: 'Gate customer' });
});
afterAll(stopMongo);

async function task(status, { serviceType = 'shopping' } = {}) {
  n += 1;
  return HelpingTask.create({
    reference: `HT-CG-${n}`, userId, workerId, serviceType, status, pickupLocation: HERE, destination: HERE,
    statusHistory: [{ status, at: new Date() }],
    charge: { serviceChargePaise: 12000, workerEarningPaise: 9600 }, paymentMethod: 'cash', paymentStatus: 'pending',
  });
}

describe('a customer who did not pay cash', () => {
  test('cannot book again until the job is paid, then the hold lifts by itself', async () => {
    await expect(gate.assertCustomerCanBook(userId)).resolves.toBeUndefined();
    const t = await task('COMPLETED');
    await gb.reportCashRefused({ kind: 'helping', id: t._id, actor });
    await expect(gate.assertCustomerCanBook(userId)).rejects.toMatchObject({ status: 402, code: 'CASH_DUE', details: { reference: t.reference } });

    await HelpingTask.updateOne({ _id: t._id }, { $set: { paymentStatus: 'paid' } });
    await expect(gate.assertCustomerCanBook(userId)).resolves.toBeUndefined();
    const row = await gb.JobGiveBack.findOne({ jobId: t._id, type: 'cash_refused' }).lean();
    expect(row.resolution).toBe('paid');
  });

  test('ops can waive it, and only an open report can be waived', async () => {
    const t = await task('COMPLETED');
    await gb.reportCashRefused({ kind: 'helping', id: t._id, actor });
    expect((await gb.openCashDues(userId)).map((d) => d.jobId)).toContain(String(t._id));
    await gb.waiveCashDue(userId, t._id);
    await expect(gate.assertCustomerCanBook(userId)).resolves.toBeUndefined();
    await expect(gb.waiveCashDue(userId, t._id)).rejects.toMatchObject({ status: 404 });
  });

  test('every kind of booking checks it: a helping task is refused while cash is due', async () => {
    const t = await task('COMPLETED');
    await gb.reportCashRefused({ kind: 'helping', id: t._id, actor });
    const { createTask } = require('../src/modules/helping/services/task.service');
    await expect(createTask({ userId, serviceType: 'shopping', pickupLocation: HERE, destination: HERE })).rejects.toMatchObject({ code: 'CASH_DUE' });
    await gb.waiveCashDue(userId, t._id);
  });

  test('a cancel freeze stops every kind, other freeze-check failures do not', async () => {
    abuse.assertNotFrozen.mockRejectedValueOnce(Object.assign(new Error('paused'), { status: 429, code: 'USER_BOOKING_FROZEN' }));
    await expect(gate.assertCustomerCanBook(userId)).rejects.toMatchObject({ code: 'USER_BOOKING_FROZEN' });
    abuse.assertNotFrozen.mockRejectedValueOnce(new Error('redis down'));
    await expect(gate.assertCustomerCanBook(userId)).resolves.toBeUndefined();
  });
});

describe('safety check on a long in-home job', () => {
  test('starts on arrival at the customer, asks after the wait, escalates when unanswered, and resets on "I\'m safe"', async () => {
    const sos = jest.spyOn(require('../src/modules/worker/sos.service'), 'triggerSOS').mockResolvedValue({ incidentKey: 'k' });
    const t = await task('ARRIVED', { serviceType: 'elder_checkin' });
    await safety.onStatus('helping', t.toObject(), 'ARRIVED');
    expect(await safety.viewFor(t._id)).toBeNull();

    const later = Date.now() + (safety.CHECK_MIN + 1) * 60000;
    await safety.sweep({ now: later });
    expect(await safety.viewFor(t._id)).toMatchObject({ asked: true, escalated: false });
    expect(sos).not.toHaveBeenCalled();

    await safety.sweep({ now: later + (safety.REPLY_MIN + 1) * 60000 });
    expect(await safety.viewFor(t._id)).toMatchObject({ escalated: true });
    expect(sos).toHaveBeenCalledWith(expect.objectContaining({ type: 'safety_check_missed', jobId: t._id }));
    await safety.sweep({ now: later + (safety.REPLY_MIN + 5) * 60000 });
    expect(sos).toHaveBeenCalledTimes(1);

    await safety.confirmSafe(t._id);
    expect(await safety.viewFor(t._id)).toBeNull();
    sos.mockRestore();
  });

  test('ends when the job ends, and never starts away from the customer', async () => {
    const t = await task('ARRIVED', { serviceType: 'elder_checkin' });
    await safety.onStatus('helping', t.toObject(), 'ARRIVED');
    await safety.onStatus('helping', t.toObject(), 'COMPLETED');
    expect((await safety.SafetyCheck.findOne({ jobId: t._id }).lean()).closed).toBe(true);

    const shop = await task('ARRIVED', { serviceType: 'shopping' });
    await safety.onStatus('helping', shop.toObject(), 'ARRIVED');
    expect(await safety.SafetyCheck.exists({ jobId: shop._id })).toBeNull();
  });
});

describe('a worker blocks a customer', () => {
  test('only from their own job, and the customer then drops out of that worker\'s offers', async () => {
    const block = require('../src/modules/jobs/customer-block');
    const Worker = require('../src/modules/worker/worker.model');
    await Worker.collection.insertOne({ _id: workerId, phone: '9800000777', name: 'Ravi', isBlocked: false });
    const t = await task('COMPLETED');
    await expect(block.blockFromJob({ kind: 'helping', doc: t.toObject(), workerId: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ status: 403 });
    expect((await block.blockersOf(userId)).has(String(workerId))).toBe(false);
    await block.blockFromJob({ kind: 'helping', doc: t.toObject(), workerId });
    expect((await block.blockersOf(userId)).has(String(workerId))).toBe(true);
    expect((await block.blockersOf(new mongoose.Types.ObjectId())).size).toBe(0);
  });
});

describe('the pro is late past the promise', () => {
  test('cancelling is free while they are still not there', async () => {
    const { ArrivalPromise } = require('../src/modules/jobs/promise');
    const t = await task('EN_ROUTE');
    expect(await gb.wasHandedBack(t._id)).toBe(false);
    await ArrivalPromise.create({ kind: 'helping', jobId: t._id, userId, providerKind: 'worker', providerId: workerId, promisedBy: new Date(Date.now() - 20 * 60000), missedAt: new Date() });
    expect(await gb.wasHandedBack(t._id)).toBe(true);
    const q = await require('../src/modules/jobs/cancel-fee').quoteHelping(await HelpingTask.findById(t._id).lean());
    expect(q).toMatchObject({ feePaise: 0, free: 'provider_changed' });
    await ArrivalPromise.updateOne({ jobId: t._id }, { $set: { arrivedAt: new Date() } });
    expect(await gb.wasHandedBack(t._id)).toBe(false);
  });
});

describe('the job needs longer', () => {
  test('only once work has started, only the pro on it, stacked times, and at most 3 asks', async () => {
    const mt = require('../src/modules/jobs/more-time');
    const early = await task('EN_ROUTE');
    await expect(mt.ask({ kind: 'helping', id: early._id, actor, minutes: 30, reason: 'more_work' })).rejects.toMatchObject({ code: 'NOT_NOW' });

    const t = await task('IN_PROGRESS');
    await expect(mt.ask({ kind: 'helping', id: t._id, actor: { kind: 'worker', id: String(new mongoose.Types.ObjectId()) }, minutes: 30, reason: 'more_work' })).rejects.toMatchObject({ status: 403 });
    await expect(mt.ask({ kind: 'helping', id: t._id, actor, minutes: 45, reason: 'more_work' })).rejects.toMatchObject({ code: 'BAD_MINUTES' });
    await expect(mt.ask({ kind: 'helping', id: t._id, actor, minutes: 30, reason: 'other' })).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });

    const first = await mt.ask({ kind: 'helping', id: t._id, actor, minutes: 30, reason: 'more_work' });
    const second = await mt.ask({ kind: 'helping', id: t._id, actor, minutes: 15, reason: 'testing' });
    expect(new Date(second.until) - new Date(first.until)).toBe(15 * 60000);
    await mt.ask({ kind: 'helping', id: t._id, actor, minutes: 15, reason: 'waiting_part' });
    await expect(mt.ask({ kind: 'helping', id: t._id, actor, minutes: 15, reason: 'testing' })).rejects.toMatchObject({ code: 'LIMIT' });
    expect(await mt.viewFor(t._id)).toMatchObject({ count: 3, left: 0, reason: 'Waiting for a part' });
  });
});
