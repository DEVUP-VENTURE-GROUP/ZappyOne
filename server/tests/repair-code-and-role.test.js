// The pro types the customer's 4-digit PIN and it must be accepted; a customer must never move a job's step themselves.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const buildApp = require('../src/app');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const User = require('../src/modules/user/user.model');

jest.setTimeout(60000);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};
let app;

const bookingAt = (status) => RepairBooking.create({
  reference: `K${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
  userId: ctx.userId,
  workerId: ctx.workerId,
  vertical: 'mobile',
  brandCode: 'samsung', modelCode: 'samsung-galaxy-s23-ultra',
  serviceMode: 'doorstep',
  status,
  location: { type: 'Point', coordinates: [77.905, 17.343], address: 'Test' },
  priceSnapshot: { subtotalPaise: 70000, totalPaise: 70000 },
  statusHistory: [{ status, at: new Date() }],
});

beforeAll(async () => {
  await startMongo();
  app = buildApp();
  await RepairConfig.create({ vertical: 'mobile' });
  const user = await User.create({ name: 'Code Customer', phone: '9000000101', startPin: '4821' });
  ctx.userId = user._id;
  ctx.workerId = new mongoose.Types.ObjectId();
  ctx.user = signAccessToken({ sub: String(user._id), role: 'user' });
  ctx.worker = signAccessToken({ sub: String(ctx.workerId), role: 'worker' });
});

afterAll(async () => { await stopMongo(); });

const verify = (id, code) => request(app).post(`/api/repair/bookings/${id}/handover-code/verify`).set(auth(ctx.worker)).send({ kind: 'start', code });

test('the customer 4-digit PIN starts the job', async () => {
  const b = await bookingAt('ARRIVED');
  const res = await verify(b._id, '4821');
  expect(res.status).toBe(200);
  const after = await RepairBooking.findById(b._id).lean();
  expect(after.otpVerified?.startAt).toBeTruthy();
});

test('a wrong PIN is refused', async () => {
  const b = await bookingAt('ARRIVED');
  expect((await verify(b._id, '1111')).status).toBe(401);
});

test('a customer cannot move their own job to a pro step', async () => {
  const b = await bookingAt('WORKER_ACCEPTED');
  const res = await request(app).post(`/api/repair/bookings/${b._id}/status`).set(auth(ctx.user)).send({ status: 'ON_THE_WAY' });
  expect(res.status).toBe(403);
  expect((await RepairBooking.findById(b._id).lean()).status).toBe('WORKER_ACCEPTED');
});
