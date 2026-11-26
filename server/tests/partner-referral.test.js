// A partner invites a partner: off until Economics sets a reward, partner codes only, both paid once when the new partner finishes the jobs set, shops paid on their books, technicians and customers left out.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(180000);
let app; let Worker; let Shop; let User; let pr; let cfg; let ReferralUse; let Transaction; let referrals;
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
let n = 0;
const phone = () => `98${String(Date.now() % 1e6).padStart(6, '0')}${String(++n).padStart(2, '0')}`;
const worker = (extra = {}) => Worker.create({ phone: phone(), name: `Pro ${n}`, kyc: { status: 'approved' }, ...extra });
const card = (id, role) => request(app).get('/api/referrals/partner').set(tok(id, role));
const apply = (id, role, code) => request(app).post('/api/referrals/apply').set(tok(id, role)).send({ code });
const codeOf = async (id, role = 'worker') => (await card(id, role)).body.card.code;
const finish = async (kind, id, times) => {
  const Model = kind === 'shop' ? Shop : Worker;
  for (let i = 0; i < times; i += 1) {
    await Model.updateOne({ _id: id }, { $inc: { completedJobs: 1 } });
    await pr.onJobDone(kind, id);
  }
};
const statusOf = async (id) => (await ReferralUse.findOne({ 'referee.id': id }).lean())?.status;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
  User = require('../src/modules/user/user.model');
  pr = require('../src/modules/referral/partner-referral');
  referrals = require('../src/modules/referral/referral.service');
  cfg = require('../src/modules/pricing/services/config.service');
  ({ ReferralUse } = require('../src/modules/referral/referral.model'));
  Transaction = require('../src/modules/payment/transaction.model');
});
afterAll(stopMongo);

test('off by default: no card, and a partner cannot join on a code', async () => {
  const a = await worker(); const b = await worker();
  expect((await card(a._id, 'worker')).body.card).toEqual({ on: false });
  const { code } = await referrals.getOrCreateCode({ kind: 'worker', id: a._id });
  const r = await apply(b._id, 'worker', code);
  expect(r.status).toBe(400);
  expect(r.body.code).toBe('REFERRAL_OFF');
});

describe('switched on at ₹200 after 3 jobs', () => {
  beforeAll(() => cfg.updateActiveConfig({ partnerReferralRewardPaise: 20000, partnerReferralJobs: 3 }, null));

  test('the card shows the code, the reward and a share message', async () => {
    const a = await worker();
    const c = (await card(a._id, 'worker')).body.card;
    expect(c).toMatchObject({ on: true, rewardPaise: 20000, jobs: 3, invited: 0, canEnterCode: true });
    expect(c.shareText).toContain(c.code);
    expect(c.shareText).toContain('₹200');
  });

  test('both workers are paid once, only when the new one reaches 3 jobs', async () => {
    const a = await worker(); const b = await worker();
    expect((await apply(b._id, 'worker', await codeOf(a._id))).status).toBe(201);
    await finish('worker', b._id, 2);
    expect(await statusOf(b._id)).toBe('signup');
    await finish('worker', b._id, 3);
    expect(await statusOf(b._id)).toBe('rewarded');
    const paid = await Transaction.find({ reason: Transaction.REASONS.REFERRAL_REWARD, 'owner.id': { $in: [a._id, b._id] } }).lean();
    expect(paid.map((t) => t.amountPaise)).toEqual([20000, 20000]);
    expect((await card(a._id, 'worker')).body.card).toMatchObject({ invited: 1, rewarded: 1, earnedPaise: 20000 });
  });

  test('a shop invites a shop: both credited on their payout books', async () => {
    const s1 = await Shop.create({ businessName: 'Fix One', ownerName: 'O', phone: phone(), isActive: true });
    const s2 = await Shop.create({ businessName: 'Fix Two', ownerName: 'O', phone: phone(), isActive: true });
    expect((await apply(s2._id, 'shop', await codeOf(s1._id, 'shop'))).status).toBe(201);
    await finish('shop', s2._id, 3);
    const { balance } = require('../src/modules/shop/shop-payout');
    expect((await balance(s1._id)).availablePaise).toBe(20000);
    expect((await balance(s2._id)).availablePaise).toBe(20000);
  });

  test('three job saves racing pay once', async () => {
    const a = await worker(); const b = await worker({ completedJobs: 3 });
    await apply(b._id, 'worker', await codeOf(a._id));
    await Promise.all([pr.onJobDone('worker', b._id), pr.onJobDone('worker', b._id), pr.onJobDone('worker', b._id)]);
    expect(await Transaction.countDocuments({ reason: Transaction.REASONS.REFERRAL_REWARD, 'owner.id': a._id })).toBe(1);
  });

  test('a partner using a customer code is refused', async () => {
    const u = await User.create({ phone: phone(), name: 'C' });
    const { code } = await referrals.getOrCreateCode({ kind: 'user', id: u._id });
    const r = await apply((await worker())._id, 'worker', code);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('REFERRAL_NOT_PARTNER');
  });

  test('a partner using their own code is refused', async () => {
    const b = await worker();
    const r = await apply(b._id, 'worker', await codeOf(b._id));
    expect(r.body.code).toBe('REFERRAL_SELF');
  });

  test('a shop technician gets no card and cannot join on a code', async () => {
    const shop = await Shop.create({ businessName: 'Team', ownerName: 'O', phone: phone(), isActive: true });
    const tech = await worker({ shopId: shop._id });
    expect((await card(tech._id, 'worker')).body.card).toEqual({ on: false });
    expect((await apply(tech._id, 'worker', await codeOf((await worker())._id))).body.code).toBe('REFERRAL_NOT_PARTNER');
  });

  test('a customer cannot open the partner card', async () => {
    const u = await User.create({ phone: phone(), name: 'C' });
    expect((await card(u._id, 'user')).status).toBe(403);
  });

  test('an account older than a week cannot enter a code', async () => {
    const old = await worker();
    await Worker.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 30 * 86400000) } });
    expect((await card(old._id, 'worker')).body.card.canEnterCode).toBe(false);
  });

  test('switching off stops new rewards', async () => {
    const a = await worker(); const b = await worker();
    await apply(b._id, 'worker', await codeOf(a._id));
    await cfg.updateActiveConfig({ partnerReferralRewardPaise: 0 }, null);
    await finish('worker', b._id, 5);
    expect(await statusOf(b._id)).toBe('signup');
    await cfg.updateActiveConfig({ partnerReferralRewardPaise: 20000 }, null);
  });
});

test('a finished job settles the referral through the job counter', async () => {
  await cfg.updateActiveConfig({ partnerReferralRewardPaise: 10000, partnerReferralJobs: 1 }, null);
  const a = await worker(); const b = await worker();
  await apply(b._id, 'worker', await codeOf(a._id));
  const { KINDS } = require('../src/modules/jobs/kinds');
  const doc = { _id: new mongoose.Types.ObjectId(), workerId: b._id };
  await KINDS.helping.model().collection.insertOne({ ...doc, status: 'COMPLETED' });
  expect(await require('../src/modules/jobs/job-count').onStatus('helping', doc, 'COMPLETED')).toBe(true);
  expect(await statusOf(b._id)).toBe('rewarded');
});
