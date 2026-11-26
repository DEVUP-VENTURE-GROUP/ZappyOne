// A referred customer's first finished job of any kind (repair, pet, helping) pays both sides once; before this only old-style orders did.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let referrals; let jobCount; let KINDS; let User; let Transaction; let ReferralUse;
let n = 0;
const phone = () => `97${String(Date.now() % 1e6).padStart(6, '0')}${String(++n).padStart(2, '0')}`;

beforeAll(async () => {
  await startMongo();
  referrals = require('../src/modules/referral/referral.service');
  jobCount = require('../src/modules/jobs/job-count');
  ({ KINDS } = require('../src/modules/jobs/kinds'));
  User = require('../src/modules/user/user.model');
  Transaction = require('../src/modules/payment/transaction.model');
  ({ ReferralUse } = require('../src/modules/referral/referral.model'));
});
afterAll(stopMongo);

async function referred() {
  const a = await User.create({ phone: phone(), name: 'Asha' });
  const b = await User.create({ phone: phone(), name: 'Ravi' });
  const { code } = await referrals.getOrCreateCode({ kind: 'user', id: a._id });
  await referrals.applyAtSignup({ code, referee: { kind: 'user', id: b._id }, refereeDeviceId: `dev-${n}` });
  return { a, b };
}
async function finish(kind, userId, status) {
  const doc = { _id: new mongoose.Types.ObjectId(), userId, workerId: new mongoose.Types.ObjectId() };
  await KINDS[kind].model().collection.insertOne({ ...doc, status, reference: `REF-${++n}` });
  return jobCount.onStatus(kind, doc, status);
}
const paidTo = (id) => Transaction.find({ reason: Transaction.REASONS.REFERRAL_REWARD, 'owner.id': id }).lean();

test.each([['repair', 'COMPLETED'], ['pet', 'SERVICE_COMPLETED'], ['helping', 'COMPLETED']])('a first %s job pays both, once', async (kind, status) => {
  const { a, b } = await referred();
  expect(await finish(kind, b._id, status)).toBe(true);
  expect((await ReferralUse.findOne({ 'referee.id': b._id }).lean()).status).toBe('rewarded');
  expect((await paidTo(a._id)).map((t) => t.amountPaise)).toEqual([referrals.REFERRER_REWARD_PAISE]);
  expect((await paidTo(b._id)).map((t) => t.amountPaise)).toEqual([referrals.REFEREE_BONUS_PAISE]);
  await finish(kind, b._id, status);
  expect(await paidTo(a._id)).toHaveLength(1);
});

test('two jobs finishing together pay once', async () => {
  const { a, b } = await referred();
  await Promise.all([finish('repair', b._id, 'COMPLETED'), finish('helping', b._id, 'COMPLETED')]);
  expect(await paidTo(a._id)).toHaveLength(1);
  expect(await paidTo(b._id)).toHaveLength(1);
});

test('a customer nobody referred: nothing paid', async () => {
  const c = await User.create({ phone: phone(), name: 'Solo' });
  await finish('repair', c._id, 'COMPLETED');
  expect(await paidTo(c._id)).toHaveLength(0);
});
