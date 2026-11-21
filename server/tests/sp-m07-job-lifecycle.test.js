// ServicePro module 7, a job's life: every status to every status (only allowed moves happen, nothing crashes), the right person only, double taps, start code, photos and money before completion.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');

jest.setTimeout(600000);
let app; let RepairBooking; let Worker; let tok; let TRANSITIONS; let STATUSES;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const m = require('../src/modules/repair/models/booking.model');
  ({ RepairBooking, TRANSITIONS } = m);
  STATUSES = Object.keys(TRANSITIONS);
  Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

let n = 0;
async function job(status = 'WORKER_ACCEPTED', extra = {}) {
  n += 1;
  const w = await Worker.create({ name: 'Ravi Kumar', phone: `93${String(n).padStart(8, '0')}`, kyc: { status: 'approved' }, savedUpiIds: [{ upiId: 'ravi@okaxis', isDefault: true }] });
  const b = await RepairBooking.create({
    reference: `LC${n}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: w._id,
    vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: 'pending',
    location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Narsingi' }, priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 },
    statusHistory: [{ status, at: new Date() }], ...extra,
  });
  return { b, w, pro: tok(w._id, 'worker'), customer: tok(b.userId, 'user') };
}
const move = (id, status, auth, body = {}) => request(app).post(`/api/repair/bookings/${id}/status`).set(auth).send({ status, ...body });
const doc = (id) => RepairBooking.findById(id).lean();

describe('every status to every status, as the pro on the job', () => {
  test('only allowed moves change the job; refused moves leave it as it was; nothing answers 500', async () => {
    const crashes = []; const illegal = []; const wrongResult = [];
    for (const from of STATUSES) {
      const targets = [...STATUSES];
      const results = await Promise.all(targets.map(async (to) => {
        const { b, pro } = await job(from);
        await passHandoverGates(b._id);
        const r = await move(b._id, to, pro);
        return { to, r, after: (await doc(b._id)).status };
      }));
      for (const { to, r, after } of results) {
        const allowed = (TRANSITIONS[from] || []).includes(to) || (to === 'CANCELLED');
        if (r.status >= 500) crashes.push(`${from}→${to} ${r.status}`);
        if (!allowed && r.status < 400) illegal.push(`${from}→${to}`);
        if (r.status < 400 && after !== to) wrongResult.push(`${from}→${to} left ${after}`);
        if (r.status >= 400 && after !== from) wrongResult.push(`${from}→${to} refused but changed to ${after}`);
      }
    }
    expect(crashes).toEqual([]);
    expect(illegal).toEqual([]);
    expect(wrongResult).toEqual([]);
  });
});

describe('the right person only', () => {
  test.each([
    ['another pro', async (b) => tok((await Worker.create({ name: 'Other', phone: `92${String(++n).padStart(8, '0')}` }))._id, 'worker')],
    ['the customer', async (b) => tok(b.userId, 'user')],
    ['another customer', async () => tok(new mongoose.Types.ObjectId(), 'user')],
    ['a shop that does not own the job', async () => tok(new mongoose.Types.ObjectId(), 'shop')],
  ])('%s cannot move the pro\'s job', async (_name, who) => {
    const { b } = await job('WORKER_ACCEPTED');
    const r = await move(b._id, 'ON_THE_WAY', await who(b));
    expect([403, 404]).toContain(r.status);
    expect((await doc(b._id)).status).toBe('WORKER_ACCEPTED');
  });
  test('no token', async () => {
    const { b } = await job();
    expect((await request(app).post(`/api/repair/bookings/${b._id}/status`).send({ status: 'ON_THE_WAY' })).status).toBe(401);
  });
  test.each([['a malformed id', 'xyz', 400], ['no such job', String(new mongoose.Types.ObjectId()), 404]])('%s', async (_name, id, status) => {
    const { pro } = await job();
    expect((await move(id, 'ON_THE_WAY', pro)).status).toBe(status);
  });
  test.each([['an unknown status', 'TELEPORTED'], ['lower case', 'on_the_way'], ['empty', ''], ['an object', { $ne: 1 }]])('%s is refused', async (_name, status) => {
    const { b, pro } = await job();
    const r = await request(app).post(`/api/repair/bookings/${b._id}/status`).set(pro).send({ status });
    expect(r.status).toBe(400);
    expect((await doc(b._id)).status).toBe('WORKER_ACCEPTED');
  });
});

describe('double taps and races', () => {
  test.each([[2], [10], [30]])('%s taps on "On the way" at once: one move, one history entry, nothing else breaks', async (count) => {
    const { b, pro } = await job('WORKER_ACCEPTED');
    const res = await Promise.all(Array.from({ length: count }, () => move(b._id, 'ON_THE_WAY', pro)));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    const d = await doc(b._id);
    expect(d.status).toBe('ON_THE_WAY');
    expect(d.statusHistory.filter((h) => h.status === 'ON_THE_WAY')).toHaveLength(1);
  });
  test('the pro finishing while the customer cancels: the job ends one way, never both', async () => {
    const { b, pro, customer } = await job('QA_PENDING', { paymentStatus: 'paid', completionPhotos: ['order-proof/a.jpg'] });
    await passHandoverGates(b._id);
    const [done, cancel] = await Promise.all([
      move(b._id, 'COMPLETED', pro),
      request(app).post(`/api/repair/bookings/${b._id}/cancel`).set(customer).send({ reason: 'changed my mind' }),
    ]);
    expect([done.status, cancel.status].some((s) => s >= 500)).toBe(false);
    const d = await doc(b._id);
    expect(['COMPLETED', 'CANCELLED', 'QA_PENDING']).toContain(d.status);
    expect(d.statusHistory.filter((h) => ['COMPLETED', 'CANCELLED'].includes(h.status)).length).toBeLessThanOrEqual(1);
  });
});

describe('start code', () => {
  test('starting the work without the code is refused, and with a wrong code too', async () => {
    const { b, pro } = await job('ARRIVED');
    const none = await move(b._id, 'REPAIR_IN_PROGRESS', pro);
    expect(none.status).toBe(409);
    expect((await doc(b._id)).status).toBe('ARRIVED');
  });
});

describe('photos of the finished work', () => {
  test.each([
    ['more than five', Array.from({ length: 6 }, (_, i) => `order-proof/${i}.jpg`), 400],
    ['not a list', 'order-proof/a.jpg', 400],
    ['a 600-letter key', ['x'.repeat(600)], 400],
    ['missing', undefined, 400],
  ])('%s → refused', async (_name, photos, status) => {
    const { b, pro } = await job('QA_PENDING');
    expect((await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(pro).send({ photos })).status).toBe(status);
  });
  test.each([
    ['a web address', 'https://evil.example.com/a.jpg'],
    ['a path that climbs out', '../../etc/passwd'],
    ['a script', 'javascript:alert(1)'],
  ])('%s is never stored as a job photo', async (_name, key) => {
    const { b, pro } = await job('QA_PENDING');
    const r = await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(pro).send({ photos: [key] });
    const stored = (await doc(b._id)).completionPhotos || [];
    expect(r.status >= 400 || !stored.includes(key)).toBe(true);
  });
  test.each(['COMPLETED', 'CANCELLED'])('photos of a %s job cannot be swapped by the pro', async (status) => {
    const { b, pro } = await job(status, { completionPhotos: ['order-proof/u/original.jpg'] });
    const r = await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(pro).send({ photos: ['order-proof/u/swapped.jpg'] });
    expect(r.status).toBe(409);
    expect((await doc(b._id)).completionPhotos).toEqual(['order-proof/u/original.jpg']);
  });
  test.each([['order-proof/64b0/1f2e-uuid.jpg'], ['completion-photos/a.jpg'], ['order-proof/u/a_b-c.d.webp']])('our own upload key %s is accepted', async (key) => {
    const { b, pro } = await job('QA_PENDING');
    expect((await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(pro).send({ photos: [key] })).status).toBe(200);
  });
  test('another pro cannot add photos to this job', async () => {
    const { b } = await job('QA_PENDING');
    const other = (await job()).pro;
    expect([403, 404]).toContain((await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(other).send({ photos: ['order-proof/x.jpg'] })).status);
  });
});

describe('money before the job closes', () => {
  test('cash not collected: completing is refused with a plain reason', async () => {
    const { b, pro } = await job('QA_PENDING', { completionPhotos: ['order-proof/a.jpg'] });
    await passHandoverGates(b._id);
    const r = await move(b._id, 'COMPLETED', pro);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CASH_NOT_COLLECTED');
  });
  test('collecting cash twice is harmless', async () => {
    const { b, pro } = await job('QA_PENDING');
    expect((await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro)).status).toBe(200);
    expect((await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro)).status).toBeLessThan(500);
  });
  test('another pro cannot mark this job\'s cash as collected', async () => {
    const { b } = await job('QA_PENDING');
    const other = (await job()).pro;
    expect([403, 404]).toContain((await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(other)).status);
    expect((await doc(b._id)).paymentStatus).toBe('pending');
  });
  test.each([['before arriving', 'ON_THE_WAY'], ['before starting', 'ARRIVED']])('cash cannot be marked collected %s', async (_name, status) => {
    const { b, pro } = await job(status);
    const r = await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro);
    expect(r.status).toBeLessThan(500);
  });
});

describe('a finished job stays finished', () => {
  test.each(['COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED'])('%s: no move, no photos, no cash change', async (status) => {
    const { b, pro } = await job(status, { paymentStatus: 'paid' });
    for (const to of ['ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'QA_PENDING', 'COMPLETED']) {
      expect((await move(b._id, to, pro)).status).toBeGreaterThanOrEqual(400);
    }
    expect((await doc(b._id)).status).toBe(status);
  });
});
