// Support finishes a started job for the customer: payment and the decision are recorded, and the job completes through its normal steps.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(60000);
let RepairBooking; let sc; let app;
beforeAll(async () => {
  await startMongo();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  sc = require('../src/modules/jobs/support-complete');
  app = require('../src/app')();
});
afterAll(stopMongo);

const booking = (status, extra = {}) => RepairBooking.create({
  reference: `SC${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: new mongoose.Types.ObjectId(),
  vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status, paymentMethod: 'cash',
  location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' },
  priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 }, statusHistory: [{ status, at: new Date() }], ...extra,
});

test('the shortest legal route to completed', () => {
  const { TRANSITIONS } = require('../src/modules/repair/models/booking.model');
  expect(sc.routeTo('ARRIVED', TRANSITIONS)).toEqual(['REPAIR_IN_PROGRESS', 'QA_PENDING', 'COMPLETED']);
  expect(sc.routeTo('QA_PENDING', TRANSITIONS)).toEqual(['COMPLETED']);
  expect(sc.routeTo('READY_FOR_RETURN', TRANSITIONS)).toEqual(['OUT_FOR_RETURN', 'COMPLETED']);
});

test('a started job is finished: paid in cash, completed, decision on the timeline and in team notes', async () => {
  const b = await booking('ARRIVED');
  const out = await sc.complete({ kind: 'repair', id: b._id, paidHow: 'cash', decision: 'Customer confirmed the wash was done', adminId: new mongoose.Types.ObjectId() });
  expect(out).toMatchObject({ completed: true, steps: ['REPAIR_IN_PROGRESS', 'QA_PENDING', 'COMPLETED'] });
  const after = await RepairBooking.findById(b._id).lean();
  expect(after).toMatchObject({ status: 'COMPLETED', paymentStatus: 'paid' });
  expect(after.statusHistory.at(-1)).toMatchObject({ actorRole: 'admin', reason: expect.stringContaining('Customer confirmed') });
  const notes = await require('../src/modules/jobs/intervention.service').listNotes('repair', b._id);
  expect(notes[0].text).toMatch(/Paid: Cash to the pro/);
  expect(await sc.complete({ kind: 'repair', id: b._id, paidHow: 'cash', decision: 'second click on the button' })).toMatchObject({ already: true });
});

test('not started, already-paid claims that are false, and other kinds are refused', async () => {
  await expect(sc.complete({ kind: 'repair', id: (await booking('WORKER_ACCEPTED'))._id, paidHow: 'cash', decision: 'customer called support' })).rejects.toMatchObject({ code: 'NOT_STARTED' });
  await expect(sc.complete({ kind: 'repair', id: (await booking('QA_PENDING'))._id, paidHow: 'already', decision: 'customer called support' })).rejects.toMatchObject({ code: 'NOT_PAID' });
  await expect(sc.complete({ kind: 'repair', id: (await booking('QA_PENDING'))._id, paidHow: 'card', decision: 'customer called support' })).rejects.toMatchObject({ code: 'BAD_PAYMENT' });
  await expect(sc.complete({ kind: 'pet', id: new mongoose.Types.ObjectId(), paidHow: 'cash', decision: 'customer called support' })).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  await expect(sc.complete({ kind: 'repair', id: new mongoose.Types.ObjectId(), paidHow: 'cash', decision: 'customer called support' })).rejects.toMatchObject({ status: 404 });
});

test('over HTTP: the panel offers it on a started job, a short decision is refused, and it completes', async () => {
  const auth = { Authorization: `Bearer ${await adminToken()}`, Origin: process.env.ADMIN_ORIGIN || 'http://localhost:5174' };
  const base = `/api/${process.env.ADMIN_LOGIN_SLUG}/bookings/repair`;
  const b = await booking('QA_PENDING');
  expect((await request(app).get(`${base}/${b._id}`).set(auth)).body.actions.complete).toBe(true);
  expect((await request(app).post(`${base}/${b._id}/complete`).set(auth).send({ paidHow: 'upi', decision: 'ok' })).status).toBe(400);
  const res = await request(app).post(`${base}/${b._id}/complete`).set(auth).send({ paidHow: 'upi', decision: 'Pro left without closing; customer paid by UPI' });
  expect(res.status).toBe(200);
  expect((await RepairBooking.findById(b._id).lean()).status).toBe('COMPLETED');
  expect((await request(app).get(`${base}/${b._id}`).set(auth)).body.actions.complete).toBe(false);
});
