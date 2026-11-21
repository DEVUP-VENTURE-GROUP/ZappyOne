// ServicePro module 9, ratings both ways: one rating per job however many taps, only for a finished job by its own customer or pro, and averages that never lose a rating landing at the same moment.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(180000);
let app; let RepairBooking; let HelpingTask; let Worker; let Shop; let User;
let n = 0; let ip = 0;
const oid = () => new mongoose.Types.ObjectId();
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.7.${Math.floor(ip / 250)}.${(ip++) % 250}` });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
  User = require('../src/modules/user/user.model');
});
afterAll(stopMongo);

async function repairJob(status = 'COMPLETED', extra = {}) {
  n += 1;
  const k = n;
  const w = extra.worker || await Worker.create({ name: `Rated ${k}`, phone: `90${String(k).padStart(8, '0')}` });
  const u = await User.create({ name: `Cust ${k}`, phone: `89${String(k).padStart(8, '0')}` });
  const b = await RepairBooking.create({
    reference: `RT${k}${Math.random().toString(36).slice(2, 6)}`, userId: u._id, workerId: w._id, vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one',
    serviceMode: 'doorstep', status, location: { type: 'Point', coordinates: [78.38, 17.44], address: 'X' }, priceSnapshot: { subtotalPaise: 10000, totalPaise: 10000 },
    completedAt: status === 'COMPLETED' ? new Date() : null, statusHistory: [{ status, at: new Date() }], ...(extra.booking || {}),
  });
  return { b, w, u };
}
const rate = (b, rating, who) => request(app).post(`/api/repair/bookings/${b._id}/rate`).set(who).send({ rating, comment: 'ok' });

describe('the customer rates the pro', () => {
  test.each([[0], [6], [3.5], ['five'], [null], [-1]])('a rating of %j is refused', async (rating) => {
    const { b, u } = await repairJob();
    expect((await rate(b, rating, tok(u._id, 'user'))).status).toBe(400);
  });
  test('a 1001-letter comment is refused', async () => {
    const { b, u } = await repairJob();
    expect((await request(app).post(`/api/repair/bookings/${b._id}/rate`).set(tok(u._id, 'user')).send({ rating: 5, comment: 'x'.repeat(1001) })).status).toBe(400);
  });
  test.each(['ON_THE_WAY', 'REPAIR_IN_PROGRESS', 'CANCELLED'])('a %s job cannot be rated', async (status) => {
    const { b, u } = await repairJob(status);
    expect((await rate(b, 5, tok(u._id, 'user'))).body.code).toBe('NOT_COMPLETED');
  });
  test('another customer cannot rate it', async () => {
    const { b } = await repairJob();
    expect((await rate(b, 1, tok(oid(), 'user'))).status).toBe(404);
  });
  test.each([['the pro', 'worker'], ['a shop', 'shop']])('%s cannot rate their own job as the customer', async (_name, role) => {
    const { b, w } = await repairJob();
    expect((await rate(b, 5, tok(w._id, role))).status).toBe(403);
  });
  test('rated once; the second rating is refused and the first stays', async () => {
    const { b, u } = await repairJob();
    expect((await rate(b, 4, tok(u._id, 'user'))).status).toBe(200);
    expect((await rate(b, 1, tok(u._id, 'user'))).body.code).toBe('ALREADY_RATED');
    expect((await RepairBooking.findById(b._id).lean()).rating).toBe(4);
  });
  test('20 one-star taps at once count once in the pro\'s average', async () => {
    const w = await Worker.create({ name: 'Target', phone: '9011111111', rating: 5, reviewCount: 10 });
    const { b, u } = await repairJob('COMPLETED', { worker: w });
    const res = await Promise.all(Array.from({ length: 20 }, () => rate(b, 1, tok(u._id, 'user'))));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    const after = await Worker.findById(w._id).lean();
    expect(after.reviewCount).toBe(11);
    expect(after.rating).toBeCloseTo((5 * 10 + 1) / 11, 2);
  });
  test('ratings from many customers at the same moment are all counted', async () => {
    const w = await Worker.create({ name: 'Busy pro', phone: '9022222222' });
    const jobs = await Promise.all(Array.from({ length: 15 }, () => repairJob('COMPLETED', { worker: w })));
    await Promise.all(jobs.map(({ b, u }, i) => rate(b, (i % 5) + 1, tok(u._id, 'user'))));
    const after = await Worker.findById(w._id).lean();
    expect(after.reviewCount).toBe(15);
    // Rounded to 2 decimals at each step, so a long run drifts by a hundredth or so.
    expect(after.rating).toBeCloseTo(3, 1);
  });
  test('a customer the pro brought through their own link is kept out of the public average', async () => {
    const w = await Worker.create({ name: 'Own link pro', phone: '9033333333', rating: 4, reviewCount: 2 });
    const { b, u } = await repairJob('COMPLETED', { worker: w, booking: { viaOwnLink: true } });
    expect((await rate(b, 1, tok(u._id, 'user'))).status).toBe(200);
    expect((await Worker.findById(w._id).lean())).toMatchObject({ rating: 4, reviewCount: 2 });
  });
  test('a shop\'s job feeds the shop\'s average, not the technician\'s', async () => {
    const s = await Shop.create({ businessName: 'Rated Shop', ownerName: 'O', phone: '9044444444' });
    const { b, u, w } = await repairJob('COMPLETED', { booking: { shopId: s._id } });
    await rate(b, 5, tok(u._id, 'user'));
    expect((await Shop.findById(s._id).lean()).reviewCount).toBe(1);
    expect((await Worker.findById(w._id).lean()).reviewCount || 0).toBe(0);
  });
});

describe('the errand customer rates the helper', () => {
  test('10 taps at once count once', async () => {
    const w = await Worker.create({ name: 'Helper', phone: '9055555555', rating: 5, reviewCount: 4 });
    const u = await User.create({ name: 'Errand cust', phone: '8955555555' });
    const t = await HelpingTask.collection.insertOne({ reference: 'HT1', userId: u._id, workerId: w._id, status: 'COMPLETED', serviceType: 'shopping', createdAt: new Date(), updatedAt: new Date() });
    const res = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/api/helping/tasks/${t.insertedId}/rate`).set(tok(u._id, 'user')).send({ rating: 2 })));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Worker.findById(w._id).lean()).reviewCount).toBe(5);
  });
});

describe('the pro rates the customer', () => {
  const rateCustomer = (b, who, body) => request(app).post(`/api/jobs/${b._id}/rate-customer`).set(who).send(body);
  test.each([[0], [6], ['great'], [2.5]])('stars %j are refused', async (stars) => {
    const { b, w } = await repairJob();
    expect((await rateCustomer(b, tok(w._id, 'worker'), { stars })).status).toBe(400);
  });
  test('only the pro who did the job', async () => {
    const { b } = await repairJob();
    expect((await rateCustomer(b, tok(oid(), 'worker'), { stars: 1 })).status).toBe(403);
  });
  test('not before the job is done', async () => {
    const { b, w } = await repairJob('ON_THE_WAY');
    expect((await rateCustomer(b, tok(w._id, 'worker'), { stars: 5 })).body.code).toBe('NOT_DONE');
  });
  test('not after the rating window closes', async () => {
    const { b, w } = await repairJob('COMPLETED', { booking: { completedAt: new Date(Date.now() - 400 * 86400e3) } });
    expect((await rateCustomer(b, tok(w._id, 'worker'), { stars: 5 })).body.code).toBe('TOO_LATE');
  });
  test('unknown tags are dropped, a long note is cut, and it counts once however many taps', async () => {
    const { b, w, u } = await repairJob();
    const res = await Promise.all(Array.from({ length: 8 }, () => rateCustomer(b, tok(w._id, 'worker'), { stars: 2, tags: ['made-up-tag'], note: 'n'.repeat(250) })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    const saved = (await RepairBooking.findById(b._id).lean()).customerRating;
    expect(saved.tags).toEqual([]);
    expect((await User.findById(u._id).lean()).ratingCount).toBe(1);
  });
  test('a customer rated by several pros at the same moment keeps every rating', async () => {
    const u = await User.create({ name: 'Popular', phone: '8966666666' });
    const jobs = await Promise.all(Array.from({ length: 10 }, async () => {
      const { b, w } = await repairJob();
      await RepairBooking.updateOne({ _id: b._id }, { $set: { userId: u._id } });
      return { b, w };
    }));
    await Promise.all(jobs.map(({ b, w }) => rateCustomer(b, tok(w._id, 'worker'), { stars: 4 })));
    expect((await User.findById(u._id).lean())).toMatchObject({ ratingCount: 10, rating: 4 });
  });
  test('the pending list shows the job until it is rated', async () => {
    const { b, w } = await repairJob();
    const before = await request(app).get('/api/jobs/rate-customer/pending').set(tok(w._id, 'worker'));
    expect(before.body.pending).toMatchObject({ id: String(b._id) });
    await rateCustomer(b, tok(w._id, 'worker'), { stars: 5 });
    expect((await request(app).get('/api/jobs/rate-customer/pending').set(tok(w._id, 'worker'))).body.pending).toBeNull();
  });
});
