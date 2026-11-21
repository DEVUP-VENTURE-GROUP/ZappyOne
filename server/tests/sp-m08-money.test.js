// ServicePro module 8, money: dues limits and payment claims, and withdrawals that can never pay out more than the pro has, however many times they tap.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { redis } = require('../src/config/redis');

jest.setTimeout(180000);
let app; let Worker; let wallet; let payouts; let dues;
let n = 0;
const oid = () => new mongoose.Types.ObjectId();
const auth = (w, role = 'worker') => ({ Authorization: `Bearer ${signAccessToken({ sub: String(w._id || w), role })}` });
async function pro(balancePaise = 0, extra = {}) {
  n += 1;
  const w = await Worker.create({ name: `Money ${n}`, phone: `91${String(n).padStart(8, '0')}`, kyc: { status: 'approved' }, savedUpiIds: [{ upiId: `pro${n}@okaxis`, isDefault: true }], savedBankAccounts: [{ accountNumber: '123456789012', ifsc: 'HDFC0001234', accountName: 'Pro' }], ...extra });
  if (balancePaise) await wallet.apply({ kind: 'worker', id: w._id, type: balancePaise > 0 ? 'credit' : 'debit', amountPaise: Math.abs(balancePaise), reason: balancePaise > 0 ? 'admin_adjustment_credit' : 'admin_adjustment_debit', idempotencyKey: `seed:${w._id}`, description: 'seed', allowDebt: true });
  await redis.set(`otp_action:${w._id}`, '1');
  return w;
}
const balanceOf = async (w) => (await wallet.getBalance({ kind: 'worker', id: w._id })).balancePaise;
const withdraw = (w, body) => request(app).post('/api/payouts/request').set(auth(w)).send(body);

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Worker = require('../src/modules/worker/worker.model');
  wallet = require('../src/modules/wallet/wallet.service');
  payouts = require('../src/modules/payout/payout.service');
  dues = require('../src/modules/worker/worker-dues.service');
  await Promise.all([require('../src/modules/payment/transaction.model').init(), require('../src/modules/payout/payout.model').init()]);
});
afterAll(stopMongo);

describe('dues: when a pro may keep working', () => {
  test.each([
    ['owes nothing', 0, 'clear', false],
    ['has money to collect', 50000, 'clear', false],
    ['owes a little', -50000, 'in_debt', false],
    ['owes past the warning line', -160000, 'warning', false],
    ['owes exactly the limit', -200000, 'blocked', true],
    ['owes far past the limit', -900000, 'blocked', true],
  ])('%s', async (_name, bal, status, blocked) => {
    const w = await pro(bal);
    const d = await dues.getDuesStatus(w._id);
    expect(d.status).toBe(status);
    expect(d.isBlocked).toBe(blocked);
    if (blocked) await expect(dues.assertCanWork(w._id)).rejects.toMatchObject({ status: 402, code: 'WALLET_BLOCKED' });
    else await expect(dues.assertCanWork(w._id)).resolves.toBeTruthy();
  });
  test('the blocked message names what to pay to work again', async () => {
    const w = await pro(-250000);
    await expect(dues.assertCanWork(w._id)).rejects.toThrow(/You owe ZappyOne ₹2,500\. Pay at least ₹501/);
  });
  test('ZappyOne staff are never stopped mid-shift by cash they hold', async () => {
    const w = await pro(-900000, { employment: { type: 'staff' } });
    await expect(dues.assertCanWork(w._id)).resolves.toBeUndefined();
  });
});

describe('dues: "I paid ZappyOne" claims', () => {
  const claim = (w, body) => request(app).post('/api/wallet/dues/claims').set(auth(w)).send(body);
  test.each([
    ['under ₹1', { amountPaise: 99 }], ['over ₹1 lakh', { amountPaise: 10000001 }], ['not whole paise', { amountPaise: 150.5 }],
    ['no amount', {}], ['unknown method', { amountPaise: 1000, method: 'crypto' }], ['an 81-letter reference', { amountPaise: 1000, reference: 'x'.repeat(81) }],
    ['amount as text', { amountPaise: 'lots' }],
  ])('%s → 400', async (_name, body) => {
    expect((await claim(await pro(-50000), body)).status).toBe(400);
  });
  test('a fourth open claim waits until the first three are checked', async () => {
    const w = await pro(-50000);
    for (let i = 0; i < 3; i += 1) expect((await claim(w, { amountPaise: 1000, reference: `UTR${i}` })).status).toBeLessThan(300);
    expect((await claim(w, { amountPaise: 1000 })).status).toBe(409);
  });
  test('a customer or shop cannot file a pro\'s claim', async () => {
    expect((await request(app).post('/api/wallet/dues/claims').set(auth(oid(), 'user')).send({ amountPaise: 1000 })).status).toBe(403);
  });
  test('confirming a claim credits it once, however often admin taps confirm', async () => {
    const w = await pro(-50000);
    const c = await dues.claimPayment({ workerId: w._id, amountPaise: 20000, method: 'upi', reference: 'UTR1' });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => dues.recordPayment({ workerId: w._id, amountPaise: 20000, claimId: c._id, adminId: oid() })));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(await balanceOf(w)).toBe(-30000);
  });
  test('a rejected claim cannot then be confirmed', async () => {
    const w = await pro(-50000);
    const c = await dues.claimPayment({ workerId: w._id, amountPaise: 20000, method: 'upi', reference: 'UTR2' });
    await dues.rejectClaim({ claimId: c._id, adminId: oid(), note: 'not found' });
    await expect(dues.recordPayment({ workerId: w._id, amountPaise: 20000, claimId: c._id, adminId: oid() })).rejects.toMatchObject({ status: 409 });
    expect(await balanceOf(w)).toBe(-50000);
  });
  test('a claim cannot be confirmed onto another pro', async () => {
    const a = await pro(-50000); const b = await pro(-50000);
    const c = await dues.claimPayment({ workerId: a._id, amountPaise: 20000, method: 'upi', reference: 'UTR3' });
    await expect(dues.recordPayment({ workerId: b._id, amountPaise: 20000, claimId: c._id, adminId: oid() })).rejects.toMatchObject({ status: 404 });
  });
});

describe('withdrawing: input and rules', () => {
  test.each([
    ['under ₹50', { amountPaise: 4999, method: 'upi', upiId: 'x@okaxis' }],
    ['over ₹25,000', { amountPaise: 2500001, method: 'upi', upiId: 'x@okaxis' }],
    ['no method', { amountPaise: 10000 }],
    ['unknown method', { amountPaise: 10000, method: 'cash' }],
    ['UPI without an ID', { amountPaise: 10000, method: 'upi' }],
    ['bank without IFSC', { amountPaise: 10000, method: 'bank', bankAccount: '123456789012' }],
    ['amount as text', { amountPaise: 'all', method: 'upi', upiId: 'x@okaxis' }],
  ])('%s → 400', async (_name, body) => {
    expect((await withdraw(await pro(100000), body)).status).toBe(400);
  });
  test('without a fresh code check, no withdrawal', async () => {
    const w = await pro(100000);
    await redis.del(`otp_action:${w._id}`);
    expect((await withdraw(w, { amountPaise: 10000, method: 'upi', upiId: w.savedUpiIds[0].upiId })).body.code).toBe('OTP_REQUIRED');
  });
  test('only to a UPI ID or bank account the pro saved', async () => {
    const w = await pro(100000);
    const r = await withdraw(w, { amountPaise: 10000, method: 'upi', upiId: 'thief@okaxis' });
    expect(r.body.code).toBe('PAYOUT_UNKNOWN_DESTINATION');
  });
  test('a saved bank account by its masked number works and pays the real number', async () => {
    const w = await pro(100000);
    const r = await withdraw(w, { amountPaise: 10000, method: 'bank', bankAccount: 'XXXXXXXX9012', bankIfsc: 'hdfc0001234' });
    expect(r.status).toBeLessThan(300);
    const p = await require('../src/modules/payout/payout.model').findOne({ workerId: w._id }).lean();
    expect(p.destination.bankAccount).toBe('123456789012');
  });
  test.each([['more than the balance', 100000, 100100], ['anything while owing', -5000, 5000]])('%s is refused', async (_name, bal, amt) => {
    const w = await pro(bal);
    expect((await withdraw(w, { amountPaise: amt, method: 'upi', upiId: w.savedUpiIds[0].upiId })).body.code).toBe('PAYOUT_INSUFFICIENT');
  });
  test('a second request while one is in progress is refused', async () => {
    const w = await pro(100000);
    expect((await withdraw(w, { amountPaise: 10000, method: 'upi', upiId: w.savedUpiIds[0].upiId })).status).toBeLessThan(300);
    expect((await withdraw(w, { amountPaise: 10000, method: 'upi', upiId: w.savedUpiIds[0].upiId })).body.code).toBe('PAYOUT_IN_FLIGHT');
  });
  test('a customer cannot withdraw', async () => {
    expect((await withdraw(oid(), { amountPaise: 10000, method: 'upi', upiId: 'x@okaxis' }).set(auth(oid(), 'user'))).status).toBe(403);
  });
  test('the request notification carries no emoji', async () => {
    const spy = jest.spyOn(require('../src/modules/notification/notification.service'), 'notify');
    const w = await pro(100000);
    await withdraw(w, { amountPaise: 10000, method: 'upi', upiId: w.savedUpiIds[0].upiId });
    const titles = spy.mock.calls.map(([n]) => `${n.title} ${n.body}`);
    spy.mockRestore();
    expect(titles.join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('withdrawing: never more than the balance', () => {
  test.each([[5], [20]])('%s taps on Withdraw at once make one request', async (count) => {
    const w = await pro(100000);
    const res = await Promise.all(Array.from({ length: count }, () => withdraw(w, { amountPaise: 90000, method: 'upi', upiId: w.savedUpiIds[0].upiId })));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const Payout = require('../src/modules/payout/payout.model');
    expect(await Payout.countDocuments({ workerId: w._id })).toBe(1);
  });
  test('approving cannot take the wallet below zero', async () => {
    const w = await pro(100000);
    const Payout = require('../src/modules/payout/payout.model');
    const mk = () => Payout.create({ workerId: w._id, amountPaise: 80000, method: 'upi', destination: { method: 'upi', upiId: w.savedUpiIds[0].upiId }, status: 'requested', events: [] });
    const [a, b] = [await mk(), await mk()];
    await payouts.approvePayout({ payoutId: a._id, adminId: oid(), autoProcess: false });
    await expect(payouts.approvePayout({ payoutId: b._id, adminId: oid(), autoProcess: false })).rejects.toMatchObject({ code: 'WALLET_HARD_LIMIT' });
    expect(await balanceOf(w)).toBe(20000);
    expect((await Payout.findById(b._id).lean()).status).toBe('requested');
  });
  test('approving the same payout twice debits once', async () => {
    const w = await pro(100000);
    const Payout = require('../src/modules/payout/payout.model');
    const p = await Payout.create({ workerId: w._id, amountPaise: 30000, method: 'upi', destination: { method: 'upi', upiId: w.savedUpiIds[0].upiId }, status: 'requested', events: [] });
    await Promise.allSettled([1, 2, 3].map(() => payouts.approvePayout({ payoutId: p._id, adminId: oid(), autoProcess: false })));
    expect(await balanceOf(w)).toBe(70000);
  });
  test('a paid mark needs a real transfer reference', async () => {
    await expect(payouts.markPaidManually({ payoutId: oid(), adminId: oid(), reference: '123' })).rejects.toMatchObject({ code: 'REFERENCE_REQUIRED' });
  });
  test.each([['approve', 'approvePayout'], ['reject', 'rejectPayout']])('%s on a missing payout is a 404', async (_name, fn) => {
    await expect(payouts[fn]({ payoutId: oid(), adminId: oid(), reason: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});
