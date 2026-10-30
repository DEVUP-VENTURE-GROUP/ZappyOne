/**
 * A provider backs out of an accepted job, and no-shows on both sides:
 * the job goes back to the pool (never cancelled on the customer), the first
 * give-back in a day is a warning, the next is charged to the wallet, the limit
 * takes a worker offline, and the customer may cancel free afterwards. Helping
 * cancellations are priced by stage and refused once work has started.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let HelpingTask; let Worker; let gb; let fee; let Transaction;
const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Start' };
const actor = { kind: 'worker', id: String(workerId) };
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Worker = require('../src/modules/worker/worker.model');
  Transaction = require('../src/modules/payment/transaction.model');
  gb = require('../src/modules/jobs/give-back');
  fee = require('../src/modules/jobs/cancel-fee');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000888', name: 'Asha', isOnline: true, isBlocked: false, kyc: { status: 'approved' } });
});
afterAll(stopMongo);

/** A task held by the worker, in `status`, accepted `minsAgo` minutes ago. */
async function task(status, { minsAgo = 10, serviceType = 'shopping', paid = false } = {}) {
  n += 1;
  const at = new Date(Date.now() - minsAgo * 60000);
  return HelpingTask.create({
    reference: `HT-GB-${n}`, userId, workerId, serviceType, status, pickupLocation: HERE, destination: HERE,
    statusHistory: [{ status: 'WORKER_ACCEPTED', at }, ...(status !== 'WORKER_ACCEPTED' ? [{ status, at }] : [])],
    charge: { serviceChargePaise: 12000, workerEarningPaise: 9600 },
    paymentMethod: paid ? 'online' : 'cash', paymentStatus: paid ? 'paid' : 'pending',
  });
}

describe('provider hands an accepted job back', () => {
  test('the job returns to the pool, the customer is not charged, and the first one is a warning', async () => {
    const t = await task('EN_ROUTE');
    const out = await gb.giveBack({ kind: 'helping', id: t._id, actor, reason: 'too_far' });
    expect(out.handedBack).toBe(true);
    expect(out.penaltyPaise).toBe(0);

    const after = await HelpingTask.findById(t._id).lean();
    expect(after.status).toBe('WORKER_SEARCHING');
    expect(after.workerId).toBeNull();
    expect(after.releasedBy.map(String)).toContain(String(workerId));

    // Not the customer's doing: cancelling now is free.
    const q = await fee.quoteHelping(after);
    expect(q.allowed).toBe(true);
    expect(q.feePaise).toBe(0);
    expect(q.free).toBe('provider_changed');
  });

  test('the next one is charged, doubled once on the way, and debited from the wallet', async () => {
    const t = await task('EN_ROUTE');
    const out = await gb.giveBack({ kind: 'helping', id: t._id, actor, reason: 'changed_mind' });
    expect(out.penaltyPaise).toBe(4000); // ₹20 × 2, late
    const debit = await Transaction.findOne({ 'owner.id': workerId, type: 'debit' }).lean();
    expect(debit.amountPaise).toBe(-4000);
  });

  test('a genuine reason is free and does not count', async () => {
    const t = await task('WORKER_ACCEPTED');
    const out = await gb.giveBack({ kind: 'helping', id: t._id, actor, reason: 'vehicle_breakdown' });
    expect(out.penaltyPaise).toBe(0);
    const row = await gb.JobGiveBack.findOne({ jobId: t._id }).lean();
    expect(row.counted).toBe(false);
  });

  test('the third counted one takes the worker offline and going online is refused', async () => {
    const t = await task('WORKER_ACCEPTED');
    const out = await gb.giveBack({ kind: 'helping', id: t._id, actor, reason: 'other', note: 'cannot do it today' });
    expect(out.paused).toBe(true);
    const w = await Worker.findById(workerId).lean();
    expect(w.isOnline).toBe(false);
    expect(new Date(w.penalties.pausedUntil).getTime()).toBeGreaterThan(Date.now());
    await expect(require('../src/modules/worker/worker.service').goOnline({ workerId, lat: 17.385, lng: 78.4867 }))
      .rejects.toMatchObject({ code: 'WORKER_PAUSED' });
  });

  test('once work has started it cannot be handed back', async () => {
    const t = await task('TASK_STARTED');
    await expect(gb.giveBack({ kind: 'helping', id: t._id, actor, reason: 'too_far' })).rejects.toMatchObject({ code: 'TOO_LATE' });
  });

  test('only the provider holding it can hand it back', async () => {
    const t = await task('EN_ROUTE');
    const other = { kind: 'worker', id: String(new mongoose.Types.ObjectId()) };
    await expect(gb.giveBack({ kind: 'helping', id: t._id, actor: other, reason: 'too_far' })).rejects.toMatchObject({ status: 403 });
  });
});

describe('customer cancelling a helping task', () => {
  test('free in the minutes after acceptance, a fee later, support once started', async () => {
    const fresh = await task('WORKER_ACCEPTED', { minsAgo: 0.5 });
    expect((await fee.quoteHelping(fresh.toObject())).free).toBe('just_accepted');

    const onWay = await task('EN_ROUTE', { paid: true });
    const q = await fee.quoteHelping(onWay.toObject());
    expect(q.feePaise).toBeGreaterThan(0);
    expect(q.refundPaise).toBe(12000 - q.feePaise);

    const started = await task('IN_PROGRESS');
    expect((await fee.quoteHelping(started.toObject())).allowed).toBe(false);
  });
});

describe('no-shows', () => {
  test('"customer not here" opens only after the wait, then closes it as their cancellation', async () => {
    const soon = await task('ARRIVED', { serviceType: 'return', minsAgo: 2 });
    await HelpingTask.updateOne({ _id: soon._id }, { $set: { workerId } });
    await expect(gb.reportCustomerAbsent({ kind: 'helping', id: soon._id, actor })).rejects.toMatchObject({ code: 'TOO_SOON' });

    const waited = await task('ARRIVED', { serviceType: 'return', minsAgo: 15 });
    const out = await gb.reportCustomerAbsent({ kind: 'helping', id: waited._id, actor });
    expect(out.closed).toBe(true);
    expect(out.feePaise).toBeGreaterThan(0);
    expect((await HelpingTask.findById(waited._id).lean()).status).toBe('CANCELLED');
  });

  test('shopping has no door to wait at first', async () => {
    const t = await task('ARRIVED', { serviceType: 'shopping', minsAgo: 30 });
    await expect(gb.reportCustomerAbsent({ kind: 'helping', id: t._id, actor })).rejects.toMatchObject({ code: 'NOT_NOW' });
  });

  test('"provider not coming" opens after the grace, re-pools the job and charges the no-show', async () => {
    const late = await task('WORKER_ACCEPTED', { minsAgo: 45 });
    const out = await gb.reportProviderAbsent({ kind: 'helping', id: late._id, userId });
    expect(out.reassigned).toBe(true);
    const row = await gb.JobGiveBack.findOne({ jobId: late._id }).lean();
    expect(row.type).toBe('provider_no_show');
    expect(row.penaltyPaise).toBe(5000);
    expect((await HelpingTask.findById(late._id).lean()).status).toBe('WORKER_SEARCHING');

    const early = await task('WORKER_ACCEPTED', { minsAgo: 5 });
    await expect(gb.reportProviderAbsent({ kind: 'helping', id: early._id, userId })).rejects.toMatchObject({ code: 'TOO_SOON' });
  });
});

describe('ops sees it', () => {
  test('the worker backing out is listed with their count, and why shows in the funnel', async () => {
    const { attention } = require('../src/modules/jobs/ops.service');
    const out = await attention();
    const me = out.backingOut.find((p) => p.id === String(workerId));
    expect(me.handedBack).toBeGreaterThanOrEqual(3);
    expect(me.pausedUntil).not.toBeNull();

    const { funnel } = require('../src/modules/admin-portal/analytics.service');
    const f = await funnel({ days: 7, now: Date.now() + 500000 });
    expect(f.cancellations.providerHandBacks.length).toBeGreaterThan(0);
    expect(f.cancellations.who.provider).toBeGreaterThanOrEqual(1); // the customer-absent close
  });
});
