/**
 * A customer's cancellation fee is actually collected and reaches the
 * providers through the Worker Shield Fund:
 *
 *   paid online      kept from the refund → in this week's fund now
 *   wallet balance   taken from it        → in the fund now
 *   neither          rides on the next booking as its own line, is paid with
 *                    it (cash: off the provider's wallet), then joins the fund
 *
 * The provider whose trip was cancelled gets a harm entry, and the Monday run
 * pays them their share. Fees riding on a booking that is cancelled go back to
 * waiting; fees left 60 days are written off.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let HelpingTask; let fee; let Records; let Fund; let WorkerPayout; let Transaction; let Wallet; let shield;
const workerId = new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Start' };
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  fee = require('../src/modules/jobs/cancel-fee');
  Records = require('../src/modules/order/cancellation-shield.model');
  ({ ShieldFundWeek: Fund, ShieldWorkerPayout: WorkerPayout } = require('../src/modules/order/shield-fund.model'));
  Transaction = require('../src/modules/payment/transaction.model');
  Wallet = require('../src/modules/wallet/wallet.model');
  shield = require('../src/modules/order/shield.service');
  // Replays are blocked by unique indexes; wait until they exist, as they do in production.
  await Promise.all([Transaction.init(), Records.init()]);
  const Worker = require('../src/modules/worker/worker.model');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000555', name: 'Kiran', isBlocked: false, kyc: { status: 'approved' } });
});
afterAll(stopMongo);

async function task(userId, status, { paid = false, minsAgo = 20 } = {}) {
  n += 1;
  const at = new Date(Date.now() - minsAgo * 60000);
  return HelpingTask.create({
    reference: `HT-SF-${n}`, userId, workerId, serviceType: 'shopping', status, pickupLocation: HERE, destination: HERE,
    statusHistory: [{ status: 'WORKER_ACCEPTED', at }, { status, at }],
    charge: { serviceChargePaise: 15000, workerEarningPaise: 13500, commissionPaise: 1500 },
    paymentMethod: paid ? 'online' : 'cash', paymentStatus: paid ? 'paid' : 'pending',
  });
}
const cancel = (t) => fee.cancelHelping({ task: t, byRole: 'user', actorId: t.userId, reason: 'No longer needed' });
const fundTotal = async () => (await Fund.findOne({ status: 'open' }).lean())?.totalCollectedPaise || 0;

test('paid online: the fee is kept from the refund and goes into the fund with the provider\'s harm', async () => {
  const user = new mongoose.Types.ObjectId();
  const before = await fundTotal();
  const out = await cancel(await task(user, 'EN_ROUTE', { paid: true }));
  expect(out.feePaise).toBeGreaterThan(0);
  const rec = await Records.findOne({ userId: user }).lean();
  expect(rec.collectionStatus).toBe('collected_refund');
  expect(await fundTotal()).toBe(before + out.feePaise);
  const harm = await WorkerPayout.findOne({ workerId }).lean();
  expect(harm.harmScore).toBeGreaterThan(0);
});

test('wallet balance: taken from the wallet straight away', async () => {
  const user = new mongoose.Types.ObjectId();
  await require('../src/modules/wallet/wallet.service').apply({
    kind: 'user', id: user, type: 'credit', amountPaise: 50000, reason: Transaction.REASONS.WALLET_TOPUP, idempotencyKey: `top-${user}`,
  });
  const out = await cancel(await task(user, 'EN_ROUTE'));
  expect((await Records.findOne({ userId: user }).lean()).collectionStatus).toBe('collected_wallet');
  expect((await Wallet.findOne({ 'owner.id': user }).lean()).balancePaise).toBe(50000 - out.feePaise);
});

describe('cash, no wallet: it rides on the next booking', () => {
  const user = new mongoose.Types.ObjectId();
  let feePaise; let next;

  test('waits, then is attached to the next booking, which asks for it', async () => {
    feePaise = (await cancel(await task(user, 'EN_ROUTE'))).feePaise;
    expect((await fee.pendingFor(user)).totalPaise).toBe(feePaise);

    next = await task(user, 'WORKER_ACCEPTED');
    const carried = await fee.attachCarried('helping', next._id, user);
    expect(carried.paise).toBe(feePaise);
    expect((await fee.pendingFor(user)).totalPaise).toBe(0); // never on two bookings

    const fresh = await HelpingTask.findById(next._id);
    const { amountDue } = require('../src/modules/helping/services/money.service');
    expect(amountDue(fresh).feePaise).toBe(15000 + feePaise);
  });

  test('if that booking is cancelled, the fee goes back to waiting', async () => {
    await HelpingTask.updateOne({ _id: next._id }, { $set: { status: 'CANCELLED' } });
    expect((await fee.pendingFor(user)).totalPaise).toBe(feePaise);
  });

  test('paid in cash with the next job: off the provider\'s wallet, into the fund, once', async () => {
    const job = await task(user, 'COMPLETED');
    await fee.attachCarried('helping', job._id, user);
    const before = await fundTotal();

    const args = { source: 'helping', booking: job.toObject(), reference: job.reference, paymentMethod: 'cash', totalPaise: 15000, platformPaise: 1500 };
    await require('../src/modules/payment/settlement').settleProviderShare(args);
    await require('../src/modules/payment/settlement').settleProviderShare(args); // replayed

    // Exactly two charges to the provider, once each though settled twice: commission and the fee they collected.
    const rows = await Transaction.find({ 'owner.id': workerId, idempotencyKey: { $regex: String(job._id) } }).lean();
    expect(rows.map((r) => [r.idempotencyKey.split(':')[0] + ':' + r.idempotencyKey.split(':')[1], r.amountPaise]).sort())
      .toEqual([['cancelfee:carried', -feePaise], ['helping:cash_commission', -1500]]);
    expect(await fundTotal()).toBe(before + feePaise);
    expect((await Records.findOne({ userId: user, collectionStatus: 'collected_next_order' }).lean()).carriedOnJobId.toString()).toBe(String(job._id));
  });
});

test('a provider backing out makes the cancel free, and nothing is recorded against the customer', async () => {
  const user = new mongoose.Types.ObjectId();
  const t = await task(user, 'WORKER_ACCEPTED');
  await require('../src/modules/jobs/give-back').giveBack({ kind: 'helping', id: t._id, actor: { kind: 'worker', id: String(workerId) }, reason: 'vehicle_breakdown' });
  const out = await cancel(await HelpingTask.findById(t._id));
  expect(out.feePaise).toBe(0);
  expect(await Records.countDocuments({ userId: user })).toBe(0);
});

test('fees older than 60 days are written off, not carried', async () => {
  const user = new mongoose.Types.ObjectId();
  await Records.collection.insertOne({
    kind: 'helping', jobId: new mongoose.Types.ObjectId(), userId: user, workerId, cancelledAtStage: 'on_the_way',
    feePaise: 3000, harmScore: 3, collectionStatus: 'pending_next_order', createdAt: new Date(Date.now() - 61 * 86400000),
  });
  expect((await fee.pendingFor(user)).totalPaise).toBe(0);
  expect((await Records.findOne({ userId: user }).lean()).collectionStatus).toBe('written_off');
});

test('the Monday run pays providers their share of the fund', async () => {
  await Fund.updateMany({ status: 'open' }, { $set: { weekEnd: new Date(Date.now() - 1000) } });
  const results = await shield.runWeeklyPayout({ triggeredBy: 'test' });
  const paid = results.find((r) => r.status === 'paid_out');
  expect(paid.payouts.find((p) => String(p.workerId) === String(workerId)).amountPaise).toBeGreaterThan(0);
  expect(await Transaction.countDocuments({ 'owner.id': workerId, reason: Transaction.REASONS.SHIELD_PAYOUT })).toBe(1);
});
