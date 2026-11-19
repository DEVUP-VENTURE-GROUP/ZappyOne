// iPhone Live Activity for a tracked job: the app registers its token, status changes update it, the end of the job ends it.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let la; let apns; let RepairBooking; let app;
const TOKEN = 'ab'.repeat(40);
beforeAll(async () => {
  await startMongo();
  la = require('../src/modules/notification/live-activity');
  apns = require('../src/modules/notification/apns');
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  app = require('../src/app')();
});
afterAll(stopMongo);

const booking = (status) => RepairBooking.create({
  reference: `LA${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: new mongoose.Types.ObjectId(),
  vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status, paymentMethod: 'cash',
  location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Test' }, priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 }, statusHistory: [{ status, at: new Date() }],
});

test('every kind maps its statuses onto the widget stages', () => {
  expect(la.stageOf('repair', 'ON_THE_WAY')).toBe('on_the_way');
  expect(la.stageOf('pet', 'PROVIDER_ARRIVED')).toBe('arrived');
  expect(la.stageOf('helping', 'COMPLETED')).toBe('done');
  expect(la.stateFor('repair', { status: 'QA_PENDING' })).toMatchObject({ stage: 'payment', step: 5, steps: 7, headline: 'Job done. Time to pay' });
});

test('registered activity is updated on a status change and ended when the job is done', async () => {
  const spy = jest.spyOn(apns, 'sendLiveActivity').mockResolvedValue({ ok: true });
  const b = await booking('WORKER_ACCEPTED');
  await la.register({ userId: b.userId, kind: 'repair', jobId: b._id, token: TOKEN });
  await la.register({ userId: b.userId, kind: 'repair', jobId: b._id, token: TOKEN });
  expect(await la.onStatus('repair', { ...b.toObject(), status: 'ON_THE_WAY' })).toEqual({ sent: 1 });
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'update', contentState: expect.objectContaining({ stage: 'on_the_way' }) }));
  await la.onStatus('repair', { ...b.toObject(), status: 'COMPLETED' });
  expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'end' }));
  expect(await la.onStatus('repair', { ...b.toObject(), status: 'COMPLETED' })).toEqual({ sent: 0 });
  spy.mockRestore();
});

test('a dead token is closed; bad tokens are refused; without Apple keys nothing is sent', async () => {
  const b = await booking('ON_THE_WAY');
  await la.register({ userId: b.userId, kind: 'repair', jobId: b._id, token: TOKEN });
  const spy = jest.spyOn(apns, 'sendLiveActivity').mockResolvedValue({ ok: false, stale: true });
  await la.onStatus('repair', b.toObject());
  expect((await la.LiveActivity.findOne({ jobId: b._id }).lean()).endedAt).not.toBeNull();
  spy.mockRestore();
  await expect(la.register({ userId: b.userId, kind: 'repair', jobId: b._id, token: 'nope' })).rejects.toMatchObject({ code: 'BAD_TOKEN' });
  expect(await apns.sendLiveActivity({ token: TOKEN, contentState: {} })).toMatchObject({ ok: false });
});

test('over HTTP: only the booking customer registers a token', async () => {
  const b = await booking('WORKER_ACCEPTED');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const as = (id) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role: 'user' })}` });
  expect((await request(app).post(`/api/jobs/${b._id}/live-activity`).set(as(new mongoose.Types.ObjectId())).send({ token: TOKEN })).status).toBe(404);
  expect((await request(app).post(`/api/jobs/${b._id}/live-activity`).set(as(b.userId)).send({ token: 'xyz' })).status).toBe(400);
  expect((await request(app).post(`/api/jobs/${b._id}/live-activity`).set(as(b.userId)).send({ token: TOKEN })).status).toBe(200);
});
