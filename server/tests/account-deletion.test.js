/**
 * Deleting an account from the app (Google Play account deletion), every type:
 *   - a customer's personal data is cleared, the phone is released for a fresh sign-up, saved cards go
 *   - refused while a job of any kind is open
 *   - a worker with money in the wallet is asked to withdraw first; with none, they leave matching
 *   - a shop disappears from customers
 *   - DELETE /api/account/me needs a signed-in account, and ends its sessions
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);

let app; let del; let User; let Worker; let Shop; let SavedCard; let RepairBooking; let redis; let sign;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ deleteAccount: del } = require('../src/modules/account/account-deletion'));
  User = require('../src/modules/user/user.model');
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
  SavedCard = require('../src/modules/payment/saved-card.model');
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  ({ redis } = require('../src/config/redis'));
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
});
afterAll(stopMongo);

let n = 0;
const phone = () => { n += 1; return `+9191100${String(n).padStart(5, '0')}`; };

test('a customer is cleared, their phone is free again, saved cards go', async () => {
  const p = phone();
  const u = await User.create({ phone: p, name: 'Asha', email: `asha${n}@example.com`, avatarKey: 'u/a.jpg',
    savedAddresses: [{ label: 'Home', address: '1 Road', location: { type: 'Point', coordinates: [78.4, 17.4] } }],
    recentLocations: [{ address: '1 Road', location: { type: 'Point', coordinates: [78.4, 17.4] } }], deviceTokens: ['t1'] });
  await SavedCard.collection.insertOne({ userId: u._id, last4: '4242' });

  await del({ role: 'user', id: u._id });

  const after = await User.findById(u._id).lean();
  expect(after.phone).toBe(`deleted-${u._id}`);
  expect(after.name).toBe('Deleted account');
  expect(after.email).toBeUndefined();
  expect(after.avatarKey).toBeNull();
  expect(after.savedAddresses).toHaveLength(0);
  expect(after.recentLocations).toHaveLength(0);
  expect(after.deviceTokens).toHaveLength(0);
  expect(after.isDeleted).toBe(true);
  expect(await SavedCard.countDocuments({ userId: u._id })).toBe(0);
  // Signing up again with the same number starts a fresh account.
  await expect(User.create({ phone: p })).resolves.toBeTruthy();
});

test('refused while any job is still open, allowed once it is done', async () => {
  const u = await User.create({ phone: phone(), name: 'Ravi' });
  const { insertedId } = await RepairBooking.collection.insertOne({ userId: u._id, status: 'ON_THE_WAY' });
  await expect(del({ role: 'user', id: u._id })).rejects.toMatchObject({ status: 409, code: 'ACTIVE_JOBS' });
  expect((await User.findById(u._id).lean()).isDeleted).toBe(false);

  await RepairBooking.collection.updateOne({ _id: insertedId }, { $set: { status: 'COMPLETED' } });
  await expect(del({ role: 'user', id: u._id })).resolves.toEqual({ ok: true });
});

test('a worker withdraws first; with nothing owed they leave matching', async () => {
  const w = await Worker.create({ name: 'Kiran', phone: phone(), skills: ['mobile'], isOnline: true, wallet: { balance: 5000 } });
  await expect(del({ role: 'worker', id: w._id })).rejects.toMatchObject({ status: 409, code: 'WALLET_BALANCE' });

  await Worker.updateOne({ _id: w._id }, { $set: { 'wallet.balance': 0 } });
  await del({ role: 'worker', id: w._id });
  const after = await Worker.findById(w._id).lean();
  expect(after).toMatchObject({ isBlocked: true, isOnline: false, name: 'Deleted account' });
  expect(after.phone).toBe(`deleted-${w._id}`);
  expect(after.deletedAt).toBeTruthy();
});

test('a shop is hidden from customers', async () => {
  const s = await Shop.create({ businessName: 'Fix It', ownerName: 'Owner', phone: phone(), isActive: true });
  await del({ role: 'shop', id: s._id });
  const after = await Shop.findById(s._id).lean();
  expect(after).toMatchObject({ isActive: false, isBlocked: true, businessName: 'Deleted account' });
});

test('DELETE /api/account/me needs sign-in and ends every session', async () => {
  await request(app).delete('/api/account/me').expect(401);

  const u = await User.create({ phone: phone(), name: 'Meera' });
  await redis.set(`rt:${u._id}:fam1`, 'x');
  const token = sign({ sub: String(u._id), role: 'user' });
  const res = await request(app).delete('/api/account/me').set('Authorization', `Bearer ${token}`).expect(200);
  expect(res.body).toEqual({ ok: true });
  expect(await redis.get(`rt:${u._id}:fam1`)).toBeNull();
  expect((await User.findById(u._id).lean()).isDeleted).toBe(true);
});

test('an unknown account cannot be deleted', async () => {
  await expect(del({ role: 'user', id: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ status: 404 });
});
