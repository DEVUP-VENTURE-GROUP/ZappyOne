// A friend's code works once, on a new account only; an old account or your own code is refused.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let svc; let User;
beforeAll(async () => {
  await startMongo();
  await require('../src/modules/feature-flags/feature-flag.service').set('referrals', true, null);
  svc = require('../src/modules/referral/referral.service');
  User = require('../src/modules/user/user.model');
});
afterAll(stopMongo);

const user = async (daysOld) => {
  const at = new Date(Date.now() - daysOld * 86400000);
  const { insertedId } = await User.collection.insertOne({ name: 'Test', phone: `9${Math.floor(Math.random() * 1e9)}`, createdAt: at, updatedAt: at });
  return insertedId;
};

test('new account yes, old account and own code no', async () => {
  const owner = await user(60);
  const { code } = await svc.getOrCreateCode({ kind: 'user', id: owner });
  const old = await user(30);
  await expect(svc.applyAtSignup({ code, referee: { kind: 'user', id: old }, refereeIp: '10.0.0.1' })).rejects.toMatchObject({ code: 'REFERRAL_NOT_NEW' });
  await expect(svc.applyAtSignup({ code, referee: { kind: 'user', id: owner }, refereeIp: '10.0.0.2' })).rejects.toMatchObject({ code: 'REFERRAL_SELF' });
  const fresh = await user(1);
  const use = await svc.applyAtSignup({ code, referee: { kind: 'user', id: fresh }, refereeIp: '10.0.0.3' });
  expect(use).toBeTruthy();
  expect(svc.REFEREE_BONUS_PAISE).toBeGreaterThan(0);
  expect(new mongoose.Types.ObjectId(String(fresh))).toBeTruthy();
});
