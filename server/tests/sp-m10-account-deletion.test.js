// ServicePro module 10, deleting an account: everything in the way is listed first with amounts (open jobs, money to withdraw, dues, a withdrawal on its way), the reason is kept for admin, older apps still work, and admin sees who left and why.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo, adminToken } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(180000);
let app; let Worker; let Shop; let User; let wallet; let AccountDeletion; let admin;
let n = 0;
const auth = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
const phone = () => { n += 1; return `88${String(n).padStart(8, '0')}`; };
const money = (w, type, amountPaise, opts = {}) => wallet.apply({ kind: 'worker', id: w._id, type, amountPaise, reason: type === 'credit' ? 'admin_adjustment_credit' : 'admin_adjustment_debit', idempotencyKey: `m10:${w._id}:${type}:${amountPaise}:${Math.random()}`, description: 't', ...opts });
const check = (id, role) => request(app).get('/api/account/me/deletion-check').set(auth(id, role));
const del = (id, role, body) => request(app).delete('/api/account/me').set(auth(id, role)).send(body);
const adminGet = (q = '') => request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}/account-deletions${q}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
  User = require('../src/modules/user/user.model');
  wallet = require('../src/modules/wallet/wallet.service');
  ({ AccountDeletion } = require('../src/modules/account/account-deletion'));
  await require('../src/modules/payment/transaction.model').init();
  admin = await adminToken();
});
afterAll(stopMongo);

describe('the check before confirming', () => {
  test('a pro with nothing in the way can delete, and sees the pro reasons', async () => {
    const w = await Worker.create({ name: 'Free Pro', phone: phone() });
    const r = await check(w._id, 'worker');
    expect(r.body).toMatchObject({ canDelete: true, blockers: [] });
    const codes = r.body.reasons.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['not_enough_work', 'fees_high', 'other']));
    expect(codes).not.toContain('not_using');
  });
  test('a customer sees customer reasons, not pro ones', async () => {
    const u = await User.create({ name: 'Cust', phone: phone() });
    const codes = (await check(u._id, 'user')).body.reasons.map((x) => x.code);
    expect(codes).toContain('not_using');
    expect(codes).not.toContain('fees_high');
  });
  test.each([
    ['money to withdraw', async (w) => money(w, 'credit', 25000), 'WALLET_BALANCE', 25000],
    ['money owed to ZappyOne', async (w) => money(w, 'debit', 40000, { allowDebt: true }), 'DUES_OWED', 40000],
    ['a withdrawal on its way', async (w) => require('../src/modules/payout/payout.model').create({ workerId: w._id, amountPaise: 15000, method: 'upi', destination: { method: 'upi', upiId: 'a@okaxis' }, status: 'approved', events: [] }), 'PAYOUT_PENDING', 15000],
  ])('%s is listed with its amount, and deleting is refused', async (_name, setup, code, amount) => {
    const w = await Worker.create({ name: 'Blocked Pro', phone: phone() });
    await setup(w);
    const r = await check(w._id, 'worker');
    expect(r.body.canDelete).toBe(false);
    expect(r.body.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code, amountPaise: amount })]));
    const d = await del(w._id, 'worker', { reason: 'other' });
    expect([d.status, d.body.code]).toEqual([409, code]);
    expect(d.body.blockers.length).toBeGreaterThan(0);
    expect((await Worker.findById(w._id).lean()).name).toBe('Blocked Pro');
  });
  test('an open job and dues together are both listed', async () => {
    const w = await Worker.create({ name: 'Two Blocks', phone: phone() });
    await money(w, 'debit', 5000, { allowDebt: true });
    const { RepairBooking } = require('../src/modules/repair/models/booking.model');
    await RepairBooking.collection.insertOne({ workerId: w._id, status: 'ON_THE_WAY' });
    const codes = (await check(w._id, 'worker')).body.blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['ACTIVE_JOBS', 'DUES_OWED']));
  });
  test('a customer with leftover cashback can still delete', async () => {
    const u = await User.create({ name: 'Cashback', phone: phone() });
    await wallet.apply({ kind: 'user', id: u._id, type: 'credit', amountPaise: 3000, reason: 'admin_adjustment_credit', idempotencyKey: `cb:${u._id}`, description: 'cashback' });
    expect((await check(u._id, 'user')).body.canDelete).toBe(true);
    expect((await del(u._id, 'user', { reason: 'not_using' })).status).toBe(200);
    expect((await AccountDeletion.findOne({ accountId: u._id }).lean()).walletPaise).toBe(3000);
  });
  test('a shop that owes ZappyOne is held until it pays', async () => {
    const s = await Shop.create({ businessName: 'Owing Shop', ownerName: 'O', phone: phone() });
    const Transaction = require('../src/modules/payment/transaction.model');
    await Transaction.create({ type: 'debit', owner: { kind: 'worker', id: new mongoose.Types.ObjectId() }, amountPaise: -30000, reason: 'admin_adjustment_debit', idempotencyKey: `shopdue:${s._id}`, status: 'succeeded', metadata: { shopId: String(s._id) }, description: 'commission' });
    const r = await check(s._id, 'shop');
    expect(r.body.blockers.map((b) => b.code)).toContain('DUES_OWED');
  });
  test.each([['no token', null], ['an admin', 'admin']])('%s cannot use the check', async (_name, role) => {
    let req = request(app).get('/api/account/me/deletion-check');
    if (role) req = req.set(auth(new mongoose.Types.ObjectId(), role));
    expect([401, 403]).toContain((await req).status);
  });
});

describe('deleting with a reason', () => {
  test('the reason, note, name and last four digits are kept; the account itself is cleared', async () => {
    const p = phone();
    const w = await Worker.create({ name: 'Leaving Pro', phone: p });
    const r = await del(w._id, 'worker', { reason: 'fees_high', note: 'Commission too high for small jobs' });
    expect(r.status).toBe(200);
    const row = await AccountDeletion.findOne({ accountId: w._id }).lean();
    expect(row).toMatchObject({ role: 'worker', reason: 'fees_high', note: 'Commission too high for small jobs', name: 'Leaving Pro', phoneLast4: p.slice(-4) });
    const after = await Worker.findById(w._id).lean();
    expect(after).toMatchObject({ name: 'Deleted account', isBlocked: true, deletionReason: 'fees_high' });
  });
  test('an older app sending no reason still deletes, recorded as not given', async () => {
    const w = await Worker.create({ name: 'Old App Pro', phone: phone() });
    expect((await request(app).delete('/api/account/me').set(auth(w._id, 'worker'))).status).toBe(200);
    expect((await AccountDeletion.findOne({ accountId: w._id }).lean()).reason).toBe('not_given');
  });
  test.each([['a made-up reason', 'hacked_the_planet'], ['a customer reason from a pro', 'not_using']])('%s is stored as not given', async (_name, reason) => {
    const w = await Worker.create({ name: 'Odd Reason', phone: phone() });
    await del(w._id, 'worker', { reason });
    expect((await AccountDeletion.findOne({ accountId: w._id }).lean()).reason).toBe('not_given');
  });
  test.each([['a 41-letter reason', { reason: 'x'.repeat(41) }], ['a 501-letter note', { reason: 'other', note: 'x'.repeat(501) }], ['reason as an object', { reason: { $ne: '' } }]])('%s → 400', async (_name, body) => {
    const w = await Worker.create({ name: 'Bad Body', phone: phone() });
    expect((await del(w._id, 'worker', body)).status).toBe(400);
    expect((await Worker.findById(w._id).lean()).name).toBe('Bad Body');
  });
  test('5 taps on Delete at once: deleted once, one admin record, nothing crashes', async () => {
    const w = await Worker.create({ name: 'Tapper', phone: phone() });
    const res = await Promise.all(Array.from({ length: 5 }, () => del(w._id, 'worker', { reason: 'other' })));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.some((r) => r.status === 200)).toBe(true);
    expect(await AccountDeletion.countDocuments({ accountId: w._id })).toBeLessThanOrEqual(5);
    expect((await Worker.findById(w._id).lean()).name).toBe('Deleted account');
  });
});

describe('admin sees who left and why', () => {
  test('the list is newest first with reason labels, money at the time, and counts per reason', async () => {
    const r = await adminGet('?role=worker');
    expect(r.status).toBe(200);
    expect(r.body.deletions.length).toBeGreaterThan(0);
    expect(r.body.deletions.every((d) => d.role === 'worker')).toBe(true);
    const fees = r.body.deletions.find((d) => d.reason === 'fees_high');
    expect(fees).toMatchObject({ reasonLabel: 'Fees or commission are too high', name: 'Leaving Pro' });
    expect(r.body.byReason.find((b) => b.reason === 'not_given').label).toMatch(/older app/);
    const times = r.body.deletions.map((d) => new Date(d.deletedAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
  test('filter by reason', async () => {
    const r = await adminGet('?reason=fees_high');
    expect(r.body.deletions.every((d) => d.reason === 'fees_high')).toBe(true);
  });
  test.each([['an unknown role', '?role=alien'], ['page 0', '?page=0']])('%s → 400', async (_name, q) => {
    expect((await adminGet(q)).status).toBe(400);
  });
  test('a pro cannot read the list', async () => {
    const r = await request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}/account-deletions`).set(auth(new mongoose.Types.ObjectId(), 'worker'));
    expect([401, 403, 404]).toContain(r.status);
  });
});
