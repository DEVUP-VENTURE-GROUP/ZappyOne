// The pro's last finished job without a customer rating comes back to Home until it is rated; old or rated jobs never do.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let RepairBooking; let cr; let app;
beforeAll(async () => {
  await startMongo();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  cr = require('../src/modules/jobs/customer-rating');
  app = require('../src/app')();
});
afterAll(stopMongo);

const done = (workerId, daysAgo, extra = {}) => RepairBooking.create({
  reference: `RC${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId,
  vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status: 'COMPLETED', paymentMethod: 'cash', paymentStatus: 'paid',
  completedAt: new Date(Date.now() - daysAgo * 86400e3), location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' },
  priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 }, statusHistory: [{ status: 'COMPLETED', at: new Date() }], ...extra,
});

test('the latest unrated job comes back; rating it clears it; an old one never asks', async () => {
  const w = new mongoose.Types.ObjectId();
  await done(w, 10);
  expect(await cr.pendingFor({ role: 'worker', providerId: w })).toBeNull();
  const b = await done(w, 0);
  expect(await cr.pendingFor({ role: 'worker', providerId: w })).toMatchObject({ kind: 'repair', id: String(b._id) });
  await cr.rate({ kind: 'repair', id: b._id, role: 'worker', providerId: String(w), stars: 5 });
  expect(await cr.pendingFor({ role: 'worker', providerId: w })).toBeNull();
});

test('a shop owner is asked only about jobs they did themselves', async () => {
  const shopId = new mongoose.Types.ObjectId();
  await done(new mongoose.Types.ObjectId(), 0, { shopId });
  expect(await cr.pendingFor({ role: 'shop', providerId: shopId })).toBeNull();
  const own = await done(null, 0, { shopId });
  expect(await cr.pendingFor({ role: 'shop', providerId: shopId })).toMatchObject({ id: String(own._id) });
});

test('over HTTP for the signed-in pro', async () => {
  const w = new mongoose.Types.ObjectId();
  const b = await done(w, 1);
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const res = await request(app).get('/api/jobs/rate-customer/pending').set({ Authorization: `Bearer ${signAccessToken({ sub: String(w), role: 'worker' })}` });
  expect(res.status).toBe(200);
  expect(res.body.pending).toMatchObject({ id: String(b._id), reference: b.reference });
});
