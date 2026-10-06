/**
 * Boost and tip, through the settings set in Economics:
 *   - a boost is only possible before anyone accepts, only in the amounts
 *     offered, never past the maximum; it is added to what the customer pays
 *     and is all the provider's when the job settles (cash: already in hand)
 *   - a tip is only possible once the job is done, once; from the wallet it
 *     moves money to the worker, "in cash" is recorded only
 *   - both show on the worker's earnings
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let HelpingTask; let bt; let Transaction; let Wallet;
const workerId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Start' };
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  bt = require('../src/modules/jobs/boost-tip');
  Transaction = require('../src/modules/payment/transaction.model');
  Wallet = require('../src/modules/wallet/wallet.model');
  await Transaction.init();
  const Worker = require('../src/modules/worker/worker.model');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000444', name: 'Sana', isBlocked: false, kyc: { status: 'approved' } });
  // As admin would set them in Economics → Boost & tips.
  await require('../src/modules/pricing/services/config.service').updateActiveConfig(
    { boostEnabled: true, boostOptions: [10, 20, 50], boostMaxPaise: 6000, tipOptions: [20, 50], tipMaxPaise: 30000 }, adminId,
  );
});
afterAll(stopMongo);

async function task(userId, status, extra = {}) {
  n += 1;
  return HelpingTask.create({
    reference: `HT-BT-${n}`, userId, serviceType: 'shopping', status, pickupLocation: HERE, destination: HERE,
    charge: { serviceChargePaise: 12000, workerEarningPaise: 10800, commissionPaise: 1200 },
    paymentMethod: 'online', paymentStatus: 'pending',
    ...(['COMPLETED', 'SETTLED'].includes(status) ? { completedAt: new Date() } : {}), ...extra,
  });
}

describe('boost', () => {
  const user = new mongoose.Types.ObjectId();

  test('only the offered amounts, only up to the maximum, and it is paid with the booking', async () => {
    const t = await task(user, 'WORKER_SEARCHING');
    await expect(bt.addBoost({ kind: 'helping', id: t._id, userId: user, amountPaise: 3000 })).rejects.toMatchObject({ code: 'BAD_AMOUNT' });
    expect((await bt.addBoost({ kind: 'helping', id: t._id, userId: user, amountPaise: 5000 })).boostPaise).toBe(5000);
    await expect(bt.addBoost({ kind: 'helping', id: t._id, userId: user, amountPaise: 2000 })).rejects.toMatchObject({ code: 'BOOST_MAX' });
    expect((await bt.addBoost({ kind: 'helping', id: t._id, userId: user, amountPaise: 1000 })).boostPaise).toBe(6000);

    const fresh = await HelpingTask.findById(t._id);
    expect(require('../src/modules/helping/services/money.service').amountDue(fresh).feePaise).toBe(12000 + 6000);
    expect((await bt.boostView('helping', fresh.toObject())).available).toBe(false); // at the max
  });

  test('not once someone has accepted, and not on someone else\'s booking', async () => {
    const taken = await task(user, 'WORKER_ACCEPTED', { workerId });
    await expect(bt.addBoost({ kind: 'helping', id: taken._id, userId: user, amountPaise: 1000 })).rejects.toMatchObject({ code: 'ALREADY_TAKEN' });
    const mine = await task(user, 'WORKER_SEARCHING');
    await expect(bt.addBoost({ kind: 'helping', id: mine._id, userId: new mongoose.Types.ObjectId(), amountPaise: 1000 })).rejects.toMatchObject({ status: 404 });
  });

  test('when the job settles online, the whole boost goes to the worker, once', async () => {
    const t = await task(user, 'COMPLETED', { workerId, boost: { paise: 2000, history: [] }, paymentStatus: 'paid' });
    const args = { source: 'helping', booking: t.toObject(), reference: t.reference, paymentMethod: 'online', totalPaise: 12000, platformPaise: 1200 };
    const settle = require('../src/modules/payment/settlement').settleProviderShare;
    await settle(args);
    await settle(args);
    const rows = await Transaction.find({ 'owner.id': workerId, idempotencyKey: { $regex: String(t._id) } }).lean();
    expect(rows.map((r) => r.amountPaise).sort((a, b) => a - b)).toEqual([2000, 10800]);
  });

  test('settings off: no boosting', async () => {
    await require('../src/modules/pricing/services/config.service').updateActiveConfig({ boostEnabled: false }, adminId);
    const t = await task(user, 'WORKER_SEARCHING');
    await expect(bt.addBoost({ kind: 'helping', id: t._id, userId: user, amountPaise: 1000 })).rejects.toMatchObject({ code: 'BOOST_OFF' });
    await require('../src/modules/pricing/services/config.service').updateActiveConfig({ boostEnabled: true }, adminId);
  });
});

describe('tip', () => {
  test('from the wallet: moves to the worker, once; not before the job is done', async () => {
    const user = new mongoose.Types.ObjectId();
    await require('../src/modules/wallet/wallet.service').apply({
      kind: 'user', id: user, type: 'credit', amountPaise: 10000, reason: Transaction.REASONS.WALLET_TOPUP, idempotencyKey: `tip-top-${user}`,
    });
    const early = await task(user, 'EN_ROUTE', { workerId });
    await expect(bt.addTip({ kind: 'helping', id: early._id, userId: user, amountPaise: 5000 })).rejects.toMatchObject({ code: 'NOT_DONE' });

    const done = await task(user, 'SETTLED', { workerId });
    await bt.addTip({ kind: 'helping', id: done._id, userId: user, amountPaise: 5000, message: 'Thanks!' });
    await expect(bt.addTip({ kind: 'helping', id: done._id, userId: user, amountPaise: 5000 })).rejects.toMatchObject({ code: 'ALREADY_TIPPED' });
    expect((await Wallet.findOne({ 'owner.id': user }).lean()).balancePaise).toBe(5000);
    const credit = await Transaction.findOne({ idempotencyKey: `tip:worker:helping:${done._id}` }).lean();
    expect(credit.amountPaise).toBe(5000);
  });

  test('not enough in the wallet: refused and nothing recorded; cash is recorded only', async () => {
    const user = new mongoose.Types.ObjectId();
    const done = await task(user, 'SETTLED', { workerId });
    await expect(bt.addTip({ kind: 'helping', id: done._id, userId: user, amountPaise: 5000 })).rejects.toMatchObject({ code: 'LOW_BALANCE' });
    expect((await HelpingTask.findById(done._id).lean()).tip).toBeUndefined();

    await bt.addTip({ kind: 'helping', id: done._id, userId: user, amountPaise: 5000, method: 'cash' });
    expect((await HelpingTask.findById(done._id).lean()).tip).toMatchObject({ paise: 5000, method: 'cash' });
    expect(await Transaction.countDocuments({ idempotencyKey: `tip:worker:helping:${done._id}` })).toBe(0);
  });

  test('boost and tip show on the worker\'s earnings', async () => {
    const { finishedJobs } = require('../src/modules/jobs/earnings');
    const rows = await finishedJobs({ workerId }, new Date(0));
    const boosted = rows.find((r) => r.boostPaise === 2000);
    expect(boosted.paise).toBe(10800 + 2000);
    expect(rows.some((r) => r.tipPaise === 5000)).toBe(true);
  });
});
