// Booked visits confirmed before the time (jobs/time-check): ask, ask again, re-offer if silent, alert both sides, and a free "can't make it" with notice.
jest.mock('../src/modules/maps/google-maps.service', () => ({
  getDistanceMatrix: jest.fn(async () => { throw new Error('no network in tests'); }),
}));
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let HelpingTask; let Worker; let promise; let tc; let gb;
const DOOR = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
const MIN = 60000;
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Worker = require('../src/modules/worker/worker.model');
  promise = require('../src/modules/jobs/promise');
  tc = require('../src/modules/jobs/time-check');
  gb = require('../src/modules/jobs/give-back');
});
afterAll(stopMongo);

const worker = () => Worker.create({
  name: 'Ravi', phone: `98${String(Math.random()).slice(2, 10)}`, isOnline: true,
  currentLocation: { type: 'Point', coordinates: [78.3915, 17.4583], updatedAt: new Date() },
});

// A helping visit accepted now, booked `aheadMin` from now.
async function booked(aheadMin, status = 'WORKER_ACCEPTED') {
  const w = await worker();
  n += 1;
  const t = await HelpingTask.create({
    reference: `HT-TC-${n}`, userId: new mongoose.Types.ObjectId(), workerId: w._id, serviceType: 'pickup', status,
    scheduledAt: new Date(Date.now() + aheadMin * MIN),
    pickupLocation: DOOR, destination: DOOR, charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash',
    statusHistory: [{ status, at: new Date() }],
  });
  await promise.onStatus('helping', t.toObject(), 'WORKER_ACCEPTED');
  const p = await promise.ArrivalPromise.findOne({ jobId: t._id }).lean();
  return { w, t, p, due: p.promisedBy.getTime(), actor: { kind: 'worker', id: String(w._id) } };
}
const row = (t) => promise.ArrivalPromise.findOne({ jobId: t._id }).lean();

test('silent pro: asked at 60 min, asked again at 50, job re-offered at 40 with no charge; each step once', async () => {
  const { t, p, due, w } = await booked(180);
  expect(p).toMatchObject({ scheduled: true, confirmedAt: null });
  expect((await tc.sweep({ now: due - 90 * MIN })).asked).toBe(0);
  expect((await tc.sweep({ now: due - 55 * MIN })).asked).toBe(1);
  expect((await tc.sweep({ now: due - 55 * MIN })).asked).toBe(0);
  expect((await tc.sweep({ now: due - 48 * MIN })).askedAgain).toBe(1);
  expect((await tc.sweep({ now: due - 39 * MIN })).reoffered).toBe(1);
  const after = await HelpingTask.findById(t._id).lean();
  expect(after).toMatchObject({ status: 'WORKER_SEARCHING', workerId: null });
  const rec = await gb.JobGiveBack.findOne({ jobId: t._id }).lean();
  expect(rec).toMatchObject({ type: 'no_confirm', penaltyPaise: 0, providerId: w._id });
  expect((await row(t)).closed).toBe(true);
  expect(await gb.wasHandedBack(t._id)).toBe(true);
});

test('confirmed pro keeps the job and both sides are alerted 10 min before, once', async () => {
  const { t, due, actor } = await booked(180);
  await tc.sweep({ now: due - 55 * MIN });
  expect(await tc.answer({ kind: 'helping', id: t._id, actor, answer: 'yes' })).toMatchObject({ confirmed: true });
  expect((await row(t)).confirmedAt).not.toBeNull();
  expect((await tc.sweep({ now: due - 39 * MIN })).reoffered).toBe(0);
  expect((await tc.sweep({ now: due - 9 * MIN })).alerted).toBe(1);
  expect((await tc.sweep({ now: due - 8 * MIN })).alerted).toBe(0);
  expect((await HelpingTask.findById(t._id).lean()).workerId).not.toBeNull();
  expect(await promise.viewFor(t._id)).toMatchObject({ scheduled: true, confirmedAt: expect.any(Date) });
});

test('taken inside the confirm window: taking it is the confirmation', async () => {
  const { p } = await booked(45);
  expect(p.scheduled).toBe(true);
  expect(p.confirmedAt).not.toBeNull();
});

test('a pro already on the way is never moved: counts as confirmed', async () => {
  const { t, due } = await booked(180);
  await tc.sweep({ now: due - 55 * MIN });
  await HelpingTask.updateOne({ _id: t._id }, { $set: { status: 'EN_ROUTE' } });
  expect((await tc.sweep({ now: due - 39 * MIN })).reoffered).toBe(0);
  expect((await HelpingTask.findById(t._id).lean()).status).toBe('EN_ROUTE');
  expect((await row(t)).confirmedAt).not.toBeNull();
});

test('never asked (server was down): never moved', async () => {
  const { t, due } = await booked(180);
  expect((await tc.sweep({ now: due - 30 * MIN })).reoffered).toBe(0);
  expect((await HelpingTask.findById(t._id).lean()).workerId).not.toBeNull();
});

test("can't make it with notice: free, not counted, back in the pool; too close says use hand-back", async () => {
  const { t, actor, w } = await booked(180);
  const out = await tc.answer({ kind: 'helping', id: t._id, actor, answer: 'no' });
  expect(out).toMatchObject({ handedBack: true, toShop: false });
  expect((await HelpingTask.findById(t._id).lean()).status).toBe('WORKER_SEARCHING');
  expect(await gb.JobGiveBack.findOne({ jobId: t._id }).lean()).toMatchObject({ type: 'schedule_decline', genuine: true, counted: false, penaltyPaise: 0, providerId: w._id });

  const late = await booked(180);
  await promise.ArrivalPromise.updateOne({ jobId: late.t._id }, { $set: { promisedBy: new Date(Date.now() + 20 * MIN) } });
  await expect(tc.answer({ kind: 'helping', id: late.t._id, actor: late.actor, answer: 'no' })).rejects.toMatchObject({ code: 'TOO_CLOSE', status: 409 });
});

test('only the holder may answer, and only on a job booked for later', async () => {
  const { t } = await booked(180);
  await expect(tc.answer({ kind: 'helping', id: t._id, actor: { kind: 'worker', id: String(new mongoose.Types.ObjectId()) }, answer: 'yes' })).rejects.toMatchObject({ status: 403 });
  const now = await booked(10);
  await expect(tc.answer({ kind: 'helping', id: now.t._id, actor: now.actor, answer: 'yes' })).rejects.toMatchObject({ code: 'NOT_BOOKED_LATER' });
  await expect(tc.answer({ kind: 'helping', id: new mongoose.Types.ObjectId(), actor: now.actor, answer: 'yes' })).rejects.toMatchObject({ status: 404 });
});

test('provider view: ask opens 60 min before; free decline until 40 min before', async () => {
  const { t, due } = await booked(180);
  expect(await tc.providerView(t._id, due - 90 * MIN)).toMatchObject({ askOpen: false, canDeclineFree: true });
  expect(await tc.providerView(t._id, due - 50 * MIN)).toMatchObject({ askOpen: true, canDeclineFree: true });
  expect(await tc.providerView(t._id, due - 30 * MIN)).toMatchObject({ askOpen: true, canDeclineFree: false });
  expect(await tc.providerView(new mongoose.Types.ObjectId())).toBeNull();
});

test('switched off in Economics: nothing is asked or moved; the timer never throws', async () => {
  const cfg = require('../src/modules/pricing/services/config.service');
  const spy = jest.spyOn(cfg, 'scheduleCheckSettings').mockResolvedValue({ ...cfg.SCHEDULE_CHECK_DEFAULTS, on: false });
  const { t, due } = await booked(180);
  expect(await tc.sweep({ now: due - 55 * MIN })).toEqual({ asked: 0, askedAgain: 0, reoffered: 0, alerted: 0 });
  expect(await tc.providerView(t._id)).toBeNull();
  spy.mockRejectedValueOnce(new Error('db down'));
  await expect(tc.sweepTick()).resolves.toBeNull();
  spy.mockRestore();
});

describe('over HTTP', () => {
  const request = require('supertest');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const { adminToken } = require('./helpers');
  let app;
  beforeAll(() => { app = require('../src/app')(); });
  const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });

  test('the pro sees the confirm card on the job and answers it', async () => {
    const { t, w, due } = await booked(50);
    await promise.ArrivalPromise.updateOne({ jobId: t._id }, { $set: { confirmedAt: null, promisedBy: new Date(Date.now() + 50 * MIN) } });
    const view = await request(app).get(`/api/jobs/${t._id}/give-back`).set(tok(w._id, 'worker'));
    expect(view.status).toBe(200);
    expect(view.body.timeCheck).toMatchObject({ askOpen: true, canDeclineFree: true });
    const bad = await request(app).post(`/api/jobs/${t._id}/time-check`).set(tok(w._id, 'worker')).send({ answer: 'maybe' });
    expect(bad.status).toBe(400);
    const res = await request(app).post(`/api/jobs/${t._id}/time-check`).set(tok(w._id, 'worker')).send({ answer: 'yes' });
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(due).toBeGreaterThan(0);
  });

  test('admin reads and sets the times; out-of-order times are refused', async () => {
    const auth = { Authorization: `Bearer ${await adminToken()}`, Origin: process.env.ADMIN_ORIGIN || 'http://localhost:5174' };
    const get = await request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}/economics/schedule-check`).set(auth);
    expect(get.status).toBe(200);
    expect(get.body.scheduleCheck).toMatchObject({ on: true, askBeforeMin: 60, reofferBeforeMin: 40 });
    const wrong = await request(app).put(`/api/${process.env.ADMIN_LOGIN_SLUG}/economics/schedule-check`).set(auth).send({ reofferBeforeMin: 55 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('BAD_ORDER');
    const ok = await request(app).put(`/api/${process.env.ADMIN_LOGIN_SLUG}/economics/schedule-check`).set(auth).send({ askBeforeMin: 90 });
    expect(ok.status).toBe(200);
    expect(ok.body.scheduleCheck.askBeforeMin).toBe(90);
    await request(app).put(`/api/${process.env.ADMIN_LOGIN_SLUG}/economics/schedule-check`).set(auth).send({ askBeforeMin: 60 });
  });

  test('every new message builds with its sample', async () => {
    const { CATALOG } = require('../src/modules/messaging/catalog');
    for (const key of ['provider.time_check', 'provider.time_check_last', 'provider.time_check_moved', 'provider.leave_now', 'customer.pro_confirmed', 'customer.pro_due_soon']) {
      const msg = CATALOG[key].build(CATALOG[key].sample());
      expect(msg.push.title.length).toBeGreaterThan(3);
      expect(msg.push.body.length).toBeGreaterThan(10);
    }
  });
});
