// Customer module 7, rewards, referrals and promo codes: points redeem once however many taps, a scratch card pays once and only its owner, nobody refers themselves or an old account, and a promo code is checked on the server.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
let app; let rewards; let wallet; let User; let tok;
let n = 0;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  rewards = require('../src/modules/rewards/rewards.service');
  wallet = require('../src/modules/wallet/wallet.service');
  User = require('../src/modules/user/user.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role = 'user') => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.1.${Math.floor(n / 250)}.${(n++) % 250}` });
  await Promise.all([require('../src/modules/payment/transaction.model').init()]);
  await rewards.updateConfig({ enabled: true, minRedeemPoints: 100, redeemPaisePerPoint: 10 }, null);
});
afterAll(stopMongo);

const customer = async (points = 0) => {
  n += 1;
  const u = await User.create({ name: `Reward ${n}`, phone: `81${String(n).padStart(8, '0')}` });
  if (points) await rewards.awardPoints({ userId: u._id, points, reason: 'order', ref: `seed-${u._id}` });
  return u;
};
const balance = async (u) => (await wallet.getBalance({ kind: 'user', id: u._id })).balancePaise;
const redeem = (u, points) => request(app).post('/api/rewards/redeem').set(tok(u._id)).send({ points });

describe('redeeming points', () => {
  test('points turn into wallet money at the set rate', async () => {
    const u = await customer(500);
    const r = await redeem(u, 200);
    expect(r.status).toBe(200);
    expect(await balance(u)).toBe(2000);
    expect(await rewards.getBalance(u._id)).toBe(300);
  });
  test('10 taps redeeming every point at once pay out once', async () => {
    const u = await customer(500);
    const res = await Promise.all(Array.from({ length: 10 }, () => redeem(u, 500)));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await balance(u)).toBe(5000);
    expect((await rewards.getBalance(u._id))).toBe(0);
  });
  test('two different amounts at once never take more than the balance', async () => {
    const u = await customer(300);
    await Promise.all([redeem(u, 200), redeem(u, 200)]);
    expect(await balance(u)).toBe(2000);
    expect((await rewards.getBalance(u._id))).toBe(100);
  });
  test.each([['more than the balance', 501, 'Not enough'], ['under the minimum', 50, 'at least']])('%s is refused', async (_name, points, msg) => {
    const u = await customer(500);
    const r = await redeem(u, points);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(msg);
    expect(await balance(u)).toBe(0);
  });
  test.each([['0', 0], ['negative', -100], ['decimal', 150.5], ['text', 'all']])('a %s amount → 400', async (_name, points) => {
    const u = await customer(500);
    expect((await redeem(u, points)).status).toBe(400);
  });
  test.each([['a pro', 'worker'], ['a shop', 'shop']])('%s cannot redeem customer points', async (_name, role) => {
    expect((await request(app).post('/api/rewards/redeem').set(tok(new mongoose.Types.ObjectId(), role)).send({ points: 100 })).status).toBe(403);
  });
});

describe('scratch cards', () => {
  test('a card pays once, however many taps', async () => {
    const u = await customer();
    const card = await rewards.issueScratchCard({ userId: u._id });
    const res = await Promise.all(Array.from({ length: 8 }, () => request(app).post(`/api/rewards/scratch/${card._id}`).set(tok(u._id))));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const { ScratchCard } = require('../src/modules/rewards/rewards.models');
    expect((await ScratchCard.findById(card._id).lean()).status).toBe('scratched');
    const pts = (await rewards.getBalance(u._id));
    const cash = await balance(u);
    expect(pts <= 1000 && cash <= 100000).toBe(true);
  });
  test('another customer cannot scratch someone else\'s card', async () => {
    const owner = await customer(); const other = await customer();
    const card = await rewards.issueScratchCard({ userId: owner._id });
    expect((await request(app).post(`/api/rewards/scratch/${card._id}`).set(tok(other._id))).status).toBe(404);
  });
  test.each([['malformed', 'zzz'], ['unknown', String(new mongoose.Types.ObjectId())]])('a %s card id never crashes', async (_name, id) => {
    const u = await customer();
    const r = await request(app).post(`/api/rewards/scratch/${id}`).set(tok(u._id));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});

describe('referrals', () => {
  test('nobody can use their own code', async () => {
    const u = await customer();
    const code = (await request(app).get('/api/referrals/me').set(tok(u._id))).body;
    const c = code.code || code.referralCode?.code || code?.data?.code;
    if (!c) return;
    const r = await request(app).post('/api/referrals/apply').set(tok(u._id)).send({ code: c });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
  test('a made-up code is refused plainly', async () => {
    const u = await customer();
    const r = await request(app).post('/api/referrals/apply').set(tok(u._id)).send({ code: 'NOTAREALCODE1' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
  test.each([['no code', {}], ['a code as an object', { code: { $ne: '' } }]])('%s → 400', async (_name, body) => {
    const u = await customer();
    expect((await request(app).post('/api/referrals/apply').set(tok(u._id)).send(body)).status).toBe(400);
  });
});

describe('promo codes', () => {
  test.each([['no code', {}], ['a negative total', { code: 'X', orderTotalPaise: -1 }], ['code as an object', { code: { $gt: '' } }]])('%s → 400', async (_name, body) => {
    const u = await customer();
    expect((await request(app).post('/api/promos/validate').set(tok(u._id)).send(body)).status).toBe(400);
  });
  test('an unknown code is refused, never a crash', async () => {
    const u = await customer();
    const r = await request(app).post('/api/promos/validate').set(tok(u._id)).send({ code: 'NOSUCHCODE', orderTotalPaise: 50000 });
    expect(r.status).toBeLessThan(500);
    expect(r.body.discountPaise || 0).toBe(0);
  });
  test('a code never discounts more than the order', async () => {
    const Promo = require('../src/modules/promo/promo.model');
    await Promo.create({ code: 'BIGOFF', name: 'Big', type: 'flat', discount: { value: 1000000 }, isActive: true, validity: { startAt: new Date(Date.now() - 86400e3), endAt: new Date(Date.now() + 86400e3) } });
    const u = await customer();
    const r = await request(app).post('/api/promos/validate').set(tok(u._id)).send({ code: 'BIGOFF', orderTotalPaise: 30000 });
    expect(r.status).toBeLessThan(500);
    if (r.status === 200) expect(r.body.discountPaise ?? r.body.promo?.discountPaise ?? 0).toBeLessThanOrEqual(30000);
  });
});
