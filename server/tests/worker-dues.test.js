/**
 * Worker dues: commission on cash jobs always lands in the wallet, however
 * deep; the limit set in Economics stops new work (not the debit); a payment
 * recorded by admin, or a worker's claim confirmed, clears it and lets them
 * work again. Debt parked outside the balance by the old floor is folded in.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let dues; let settlement; let Transaction; let cancellation;
const workerId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
let n = 0;

beforeAll(async () => {
  await startMongo();
  dues = require('../src/modules/worker/worker-dues.service');
  settlement = require('../src/modules/payment/settlement');
  Transaction = require('../src/modules/payment/transaction.model');
  cancellation = require('../src/modules/order/cancellation.service');
  const Worker = require('../src/modules/worker/worker.model');
  await Worker.collection.insertOne({ _id: workerId, phone: '9800000999', name: 'Ravi', isOnline: false, isBlocked: false, kyc: { status: 'approved' } });
  // ₹300 warning, ₹500 limit: set like admin would in Economics.
  await cancellation.updateConfig({ workerDuesWarnPaise: 30000, workerDuesLimitPaise: 50000, duesPayInstructions: 'UPI zappyone@upi' }, adminId);
});
afterAll(stopMongo);

/** A finished cash job: the worker holds ₹total, owes `commission`. */
function cashJob(commissionPaise) {
  n += 1;
  return settlement.settleProviderShare({
    source: 'helping', booking: { _id: new mongoose.Types.ObjectId(), workerId }, reference: `T-${n}`,
    paymentMethod: 'cash', totalPaise: commissionPaise * 5, platformPaise: commissionPaise,
  });
}

test('commission on cash jobs builds dues; the warning and the limit come from settings', async () => {
  await cashJob(20000);
  let d = await dues.getDuesStatus(workerId);
  expect(d.duesPaise).toBe(20000);
  expect(d.status).toBe('in_debt');
  expect(d.leftPaise).toBe(30000);
  expect(d.payInstructions).toBe('UPI zappyone@upi');

  await cashJob(15000);
  expect((await dues.getDuesStatus(workerId)).status).toBe('warning');

  // Past the limit, the debt still lands in full; nothing is parked out of sight.
  await cashJob(30000);
  d = await dues.getDuesStatus(workerId);
  expect(d.duesPaise).toBe(65000);
  expect(d.status).toBe('blocked');
});

test('at the limit: no new work, no alerts, cannot go online', async () => {
  await expect(dues.assertCanWork(workerId)).rejects.toMatchObject({ code: 'WALLET_BLOCKED', status: 402 });
  const other = new mongoose.Types.ObjectId();
  const ok = await dues.filterWorkingWorkers([workerId, other]);
  expect(ok.has(String(workerId))).toBe(false);
  expect(ok.has(String(other))).toBe(true);
  await expect(require('../src/modules/worker/worker.service').goOnline({ workerId, lat: 17.385, lng: 78.4867 }))
    .rejects.toMatchObject({ code: 'WALLET_BLOCKED' });
});

test('a worker cannot withdraw into debt', async () => {
  await expect(require('../src/modules/wallet/wallet.service').apply({
    kind: 'worker', id: workerId, type: 'debit', amountPaise: 100,
    reason: Transaction.REASONS.WITHDRAWAL, idempotencyKey: 'test-withdraw-1',
  })).rejects.toMatchObject({ code: 'WALLET_HARD_LIMIT' });
});

test('a claimed payment, once confirmed, clears the block; a rejected one changes nothing', async () => {
  const bad = await dues.claimPayment({ workerId, amountPaise: 99900, method: 'upi', reference: 'WRONG' });
  await dues.rejectClaim({ claimId: bad._id, adminId, note: 'No such payment' });
  expect((await dues.getDuesStatus(workerId)).duesPaise).toBe(65000);

  const claim = await dues.claimPayment({ workerId, amountPaise: 40000, method: 'upi', reference: 'UTR123' });
  const out = await dues.recordPayment({ workerId, amountPaise: 40000, method: 'upi', reference: 'UTR123', claimId: claim._id, adminId });
  expect(out.before.isBlocked).toBe(true);
  expect(out.after.duesPaise).toBe(25000);
  expect(out.after.isBlocked).toBe(false);
  await expect(dues.recordPayment({ workerId, amountPaise: 40000, claimId: claim._id, adminId })).rejects.toMatchObject({ status: 409 });
  await expect(dues.assertCanWork(workerId)).resolves.toBeTruthy();
});

test('commission parked outside the balance by the old floor is folded in once', async () => {
  await Transaction.create({
    type: 'debit', owner: { kind: 'worker', id: workerId }, amountPaise: -5000,
    reason: Transaction.REASONS.PLATFORM_COMMISSION, idempotencyKey: 'helping:cash_commission_unpaid:old1',
    description: 'old parked', status: 'pending',
  });
  expect((await dues.getDuesStatus(workerId)).duesPaise).toBe(30000);
  expect((await dues.getDuesStatus(workerId)).duesPaise).toBe(30000); // not twice
});

test('admin sees who owes, deepest first, with the totals', async () => {
  const list = await dues.listOwing();
  const me = list.rows.find((r) => r.workerId === String(workerId));
  expect(me.duesPaise).toBe(30000);
  expect(list.limitPaise).toBe(50000);
  expect(list.totalPaise).toBeGreaterThanOrEqual(30000);
});
