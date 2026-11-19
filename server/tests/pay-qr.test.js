// Paying for a finished job: an inspection or quoted job is payable once the work is done, and the pro gets their own scan-to-pay details.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let RepairBooking; let Worker; let tok;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

const booking = (w, status, extra = {}) => RepairBooking.create({
  reference: `PQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: w._id,
  vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status, paymentMethod: 'cash',
  location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' },
  priceSnapshot: { subtotalPaise: 25900, totalPaise: 25900, isEstimate: true }, statusHistory: [{ status, at: new Date() }], ...extra,
});

test('an estimate job: not payable while the work is under way, payable once it is done', async () => {
  const { PAYABLES } = require('../src/modules/payment/payables');
  expect(() => PAYABLES.repair.payable({ status: 'REPAIR_IN_PROGRESS', priceSnapshot: { isEstimate: true, totalPaise: 100 } })).toThrow();
  expect(PAYABLES.repair.payable({ status: 'QA_PENDING', priceSnapshot: { isEstimate: true, totalPaise: 25900 } }).amountPaise).toBe(25900);
  const w = await Worker.create({ name: 'Ravi Kumar', phone: '9000000201', savedUpiIds: [{ upiId: 'ravi@okaxis', isDefault: true }] });
  const b = await booking(w, 'QA_PENDING');
  const view = await require('../src/modules/jobs/pay-direct').view('repair', b.toObject());
  expect(view).toMatchObject({ amountPaise: 25900, methods: ['upi', 'cash'], to: { name: 'Ravi', upiId: 'ravi@okaxis' } });
});

test('the pro gets their scan-to-pay details; nobody else does; no UPI ID says so', async () => {
  const w = await Worker.create({ name: 'Ravi', phone: '9000000202', savedUpiIds: [{ upiId: 'ravi2@okaxis', isDefault: true }] });
  const b = await booking(w, 'READY_FOR_RETURN');
  const res = await request(app).get(`/api/jobs/${b._id}/pay-qr`).set(tok(w._id, 'worker'));
  expect(res.status).toBe(200);
  expect(res.body.pay).toMatchObject({ upiId: 'ravi2@okaxis', amountPaise: 25900, reference: b.reference });
  expect((await request(app).get(`/api/jobs/${b._id}/pay-qr`).set(tok(new mongoose.Types.ObjectId(), 'worker'))).status).toBe(403);
  expect((await request(app).get(`/api/jobs/${b._id}/pay-qr`).set(tok(b.userId, 'user'))).status).toBe(403);
  const noUpi = await Worker.create({ name: 'Anil', phone: '9000000203' });
  const b2 = await booking(noUpi, 'QA_PENDING');
  expect((await request(app).get(`/api/jobs/${b2._id}/pay-qr`).set(tok(noUpi._id, 'worker'))).body.pay).toMatchObject({ upiId: null });
  await RepairBooking.updateOne({ _id: b2._id }, { $set: { paymentStatus: 'paid' } });
  expect((await request(app).get(`/api/jobs/${b2._id}/pay-qr`).set(tok(noUpi._id, 'worker'))).body.pay).toBeNull();
});

test('saving a token twice keeps it; the same phone signing in to another account moves the token over', async () => {
  const devices = require('../src/modules/notification/devices');
  const a = await Worker.create({ name: 'A', phone: '9000000204' });
  const b = await Worker.create({ name: 'B', phone: '9000000205' });
  await devices.saveToken('worker', a._id, 'tok-1');
  await devices.saveToken('worker', a._id, 'tok-1');
  await devices.saveToken('worker', b._id, 'tok-1');
  expect((await Worker.findById(a._id).lean()).deviceTokens).not.toContain('tok-1');
  expect((await Worker.findById(b._id).lean()).deviceTokens).toContain('tok-1');
});
