// ServicePro module 6, job offers and dispatch: who is rung first, who is left out, and that one job goes to exactly one pro however many tap Accept at once.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { fairOrder, statsOf, istDay } = require('../src/modules/jobs/fairness');
const busy = require('../src/modules/jobs/busy');

jest.setTimeout(180000);
const oid = () => new mongoose.Types.ObjectId();
const today = istDay();
const c = (id, km, stats = {}, extra = {}) => ({ id, km, kind: 'repair', stats: { jobsToday: 0, lastAt: 0, reliable: true, ...stats }, ...extra });
const ids = (list) => list.map((x) => x.id);

describe('ranking: who is rung first', () => {
  test.each([
    ['nearer wins when both are outside the promise', [c('far', 20), c('near', 12)], ['near', 'far']],
    ['inside the promise beats outside, however close', [c('out', 6), c('in', 1)], ['in', 'out']],
    ['inside the promise, fewer jobs today wins over nearer', [c('busyNear', 0.5, { jobsToday: 3 }), c('freshFar', 2, { jobsToday: 0 })], ['freshFar', 'busyNear']],
    ['inside, same jobs: longest idle wins', [c('recent', 1, { lastAt: 2000 }), c('idle', 1.5, { lastAt: 1000 })], ['idle', 'recent']],
    ['inside, a pro who answers rings beats one who does not', [c('ignores', 0.5, { reliable: false }), c('answers', 2)], ['answers', 'ignores']],
    ['staff on duty always first', [c('pro', 0.2), c('staff', 30, {}, { staff: true })], ['staff', 'pro']],
    ['no GPS yet goes after anyone with a distance', [c('nogps', null), c('far', 25)], ['far', 'nogps']],
    ['two with no GPS: fewer jobs first', [c('a', null, { jobsToday: 2 }), c('b', null, { jobsToday: 1 })], ['b', 'a']],
    ['two with no GPS, same jobs: longest idle first', [c('a', null, { lastAt: 9 }), c('b', null, { lastAt: 3 })], ['b', 'a']],
    ['outside the promise, reliability does not reorder by distance', [c('farGood', 15), c('nearBad', 12, { reliable: false })], ['nearBad', 'farGood']],
    ['same distance outside: fewer jobs first, never the same person by default', [c('a', 20, { jobsToday: 5 }), c('b', 20, { jobsToday: 0 })], ['b', 'a']],
    ['empty list', [], []],
    ['one candidate', [c('only', 3)], ['only']],
  ])('%s', (_name, list, order) => {
    expect(ids(fairOrder(list))).toEqual(order);
  });

  test('a missing stats object counts as a fresh, reliable pro', () => {
    expect(ids(fairOrder([{ id: 'x', km: 1, kind: 'repair' }, c('y', 1, { jobsToday: 1 })]))).toEqual(['x', 'y']);
  });
  test('the input list is not changed', () => {
    const list = [c('b', 5), c('a', 1)];
    fairOrder(list);
    expect(ids(list)).toEqual(['b', 'a']);
  });
  test('a tighter promise moves the band', () => {
    expect(ids(fairOrder([c('k2', 2, { jobsToday: 5 }), c('k1', 1, { jobsToday: 0 })], { promiseMin: 1 }))[0]).toBe('k1');
  });

  test('scale: 20,000 candidates ranked in well under a second, staff first and every band in order', () => {
    const list = Array.from({ length: 20000 }, (_, i) => c(`p${i}`, (i * 7919) % 300 / 10, { jobsToday: i % 6, lastAt: (i * 31) % 1000, reliable: i % 9 !== 0 }, i % 5000 === 0 ? { staff: true } : {}));
    const t = Date.now();
    const out = fairOrder(list);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(out).toHaveLength(20000);
    expect(out.slice(0, 4).every((x) => x.staff)).toBe(true);
    const firstOut = out.findIndex((x) => !x.staff && x.km > 4);
    expect(out.slice(4, firstOut).every((x) => x.km <= 4)).toBe(true);
  });
  test('scale: the same input always gives the same order', () => {
    const list = Array.from({ length: 2000 }, (_, i) => c(`p${i}`, (i % 40) / 4, { jobsToday: i % 3, lastAt: i % 17 }));
    expect(ids(fairOrder(list))).toEqual(ids(fairOrder([...list])));
  });
});

describe('a pro\'s record for ranking', () => {
  test.each([
    ['no record', null, { jobsToday: 0, lastAt: 0, reliable: true }],
    ['jobs counted today', { dispatchStats: { day: today, jobs: 4, lastAt: new Date(5000) } }, { jobsToday: 4, lastAt: 5000 }],
    ['jobs from another day do not count', { dispatchStats: { day: '2000-01-01', jobs: 9 } }, { jobsToday: 0 }],
    ['new pro under 10 rings: reliable', { penalties: { totalOffers: 9, totalRejects: 9 } }, { reliable: true }],
    ['exactly half accepted: reliable', { penalties: { totalOffers: 10, totalRejects: 5 } }, { reliable: true }],
    ['under half accepted: not reliable', { penalties: { totalOffers: 10, totalRejects: 6 } }, { reliable: false }],
    ['all accepted', { penalties: { totalOffers: 500, totalRejects: 0 } }, { reliable: true }],
    ['none accepted', { penalties: { totalOffers: 500, totalRejects: 500 } }, { reliable: false }],
    ['rings but no reject count', { penalties: { totalOffers: 50 } }, { reliable: true }],
  ])('%s', (_name, doc, expected) => {
    expect(statsOf(doc, today)).toMatchObject(expected);
  });
});

describe('busy for a while, and back', () => {
  const now = Date.UTC(2026, 10, 21, 6, 0);
  let w;
  beforeAll(async () => {
    await startMongo();
    w = await require('../src/modules/worker/worker.model').create({ name: 'Busy Pro', phone: '9700000001' });
  });

  test.each([[60], [120]])('%s minutes is accepted', async (minutes) => {
    const r = await busy.set({ workerId: w._id, minutes, now });
    expect(r.busyUntil.getTime()).toBe(now + minutes * 60000);
  });
  test.each([[0], [30], [90], [180], [-60], [1e9]])('%s minutes is refused', async (minutes) => {
    await expect(busy.set({ workerId: w._id, minutes, now })).rejects.toMatchObject({ code: 'BAD_MINUTES' });
  });
  test.each([
    ['in the past', now - 60000, 'BAD_TIME'], ['now', now, 'BAD_TIME'], ['4 minutes ahead', now + 4 * 60000, 'BAD_TIME'],
    ['not a date', 'tomorrow-ish', 'BAD_TIME'], ['13 hours ahead', now + 13 * 3600000, 'TOO_LONG'],
  ])('until %s is refused', async (_name, until, code) => {
    await expect(busy.set({ workerId: w._id, until, now })).rejects.toMatchObject({ code });
  });
  test.each([['6 minutes ahead', 6 * 60000], ['exactly 12 hours', 12 * 3600000], ['3 hours', 3 * 3600000]])('until %s is fine', async (_name, ms) => {
    const r = await busy.set({ workerId: w._id, until: new Date(now + ms).toISOString(), now });
    expect(r.busyUntil.getTime()).toBe(now + ms);
  });
  test('off clears it at once', async () => {
    expect((await busy.set({ workerId: w._id, off: true })).busyUntil).toBeNull();
  });
  test('busyAmong leaves out only those still busy', async () => {
    const Worker = require('../src/modules/worker/worker.model');
    const [a, b, d] = await Promise.all([1, 2, 3].map((i) => Worker.create({ name: `B${i}`, phone: `970000010${i}` })));
    await Worker.updateOne({ _id: a._id }, { busyUntil: new Date(Date.now() + 3600e3) });
    await Worker.updateOne({ _id: b._id }, { busyUntil: new Date(Date.now() - 1000) });
    expect([...await busy.busyAmong([a._id, b._id, d._id])]).toEqual([String(a._id)]);
    expect((await busy.busyAmong([])).size).toBe(0);
    expect((await busy.busyAmong(null)).size).toBe(0);
  });
  test('viewOf shows a time only while it is ahead', () => {
    expect(busy.viewOf({ busyUntil: new Date(Date.now() + 60000) })).toBeInstanceOf(Date);
    expect(busy.viewOf({ busyUntil: new Date(Date.now() - 60000) })).toBeNull();
    expect(busy.viewOf(null)).toBeNull();
  });
  test('freeInMin: the soonest busy pro nearby, rounded up to 5 minutes, never under 5', async () => {
    const Worker = require('../src/modules/worker/worker.model');
    const loc = { type: 'Point', coordinates: [78.39, 17.44] };
    const t = Date.now();
    const soon = await Worker.create({ name: 'Soon', phone: '9700000201', isOnline: true, currentLocation: loc, busyUntil: new Date(t + 12 * 60000) });
    const later = await Worker.create({ name: 'Later', phone: '9700000202', isOnline: true, currentLocation: loc, busyUntil: new Date(t + 50 * 60000) });
    const farAway = await Worker.create({ name: 'Far', phone: '9700000203', isOnline: true, currentLocation: { type: 'Point', coordinates: [78.9, 17.9] }, busyUntil: new Date(t + 6 * 60000) });
    await Worker.init();
    expect(await busy.freeInMin({ workerIds: [soon._id, later._id, farAway._id], lat: 17.44, lng: 78.39, now: t })).toBe(15);
    const almost = await Worker.create({ name: 'Almost', phone: '9700000204', isOnline: true, currentLocation: loc, busyUntil: new Date(t + 60000) });
    expect(await busy.freeInMin({ workerIds: [almost._id], lat: 17.44, lng: 78.39, now: t })).toBe(5);
    expect(await busy.freeInMin({ workerIds: [], lat: 17.44, lng: 78.39 })).toBeNull();
  });
});

describe('claiming a job: exactly one pro wins', () => {
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  let app;
  let Worker;
  let n = 0;
  const HOME = [78.3915, 17.4483];
  const as = (w, role = 'worker') => signAccessToken({ sub: String(w._id || w), role });
  const claim = (id, w, role) => request(app).post(`/api/repair/bookings/${id}/claim`).set('Authorization', `Bearer ${as(w, role)}`).send({});

  async function pros(count, extra = {}) {
    const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
    const list = await Worker.insertMany(Array.from({ length: count }, () => {
      n += 1;
      return { name: `Claim ${n}`, phone: `96${String(n).padStart(8, '0')}`, kyc: { status: 'approved' }, isOnline: true, lastSeenAt: new Date(), currentLocation: { type: 'Point', coordinates: [HOME[0], HOME[1] + 0.005] }, ...extra };
    }));
    await ProviderEnrolment.insertMany(list.map((w) => ({ providerKind: 'individual', workerId: w._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' })));
    return list;
  }
  let seq = 0;
  async function openJob(offerTo = [], extra = {}) {
    seq += 1;
    const { insertedId } = await RepairBooking.collection.insertOne({
      reference: `ZR${Date.now().toString(36)}${seq}`, userId: oid(), vertical: 'mobile', brandCode: 'samsung', modelCode: 'samsung-s23', repairCode: 'battery_replacement', priceSnapshot: { labourPaise: 200000, subtotalPaise: 200000, totalPaise: 200000 }, serviceMode: 'doorstep',
      status: 'CONFIRMED', workerId: null, shopId: null, location: { type: 'Point', coordinates: HOME, address: 'Madhapur' },
      matching: { offeredTo: offerTo.map((w) => `worker:${w._id}`) }, pricing: { totalPaise: 200000 }, statusHistory: [], createdAt: new Date(), updatedAt: new Date(), ...extra,
    });
    return insertedId;
  }

  beforeAll(async () => {
    app = require('../src/app')();
    Worker = require('../src/modules/worker/worker.model');
    const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
    await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'electronics', repairVertical: 'mobile', status: 'live' });
  });
  afterAll(stopMongo);

  test.each([[2], [10], [40]])('%s pros tap Accept at the same moment: one wins, the rest are told it is gone', async (count) => {
    const list = await pros(count);
    const id = await openJob(list);
    const results = await Promise.all(list.map((w) => claim(id, w)));
    const won = results.filter((r) => r.status === 200);
    expect(won).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'ALREADY_CLAIMED')).toBe(true);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    const job = await RepairBooking.findById(id).lean();
    expect(String(job.workerId)).toBe(String(won[0].body.booking.workerId));
  });

  test('the winner tapping again does not take it twice or break it', async () => {
    const [w] = await pros(1);
    const id = await openJob([w]);
    expect((await claim(id, w)).status).toBe(200);
    expect([200, 409]).toContain((await claim(id, w)).status);
    expect(String((await RepairBooking.findById(id).lean()).workerId)).toBe(String(w._id));
  });

  test.each([
    ['never offered', async () => { const [w] = await pros(1); return [await openJob([]), w]; }, 403],
    ['offered but not verified for the service', async () => { const w = await Worker.create({ name: 'Unverified', phone: '9599999901', kyc: { status: 'approved' } }); return [await openJob([w]), w]; }, 403],
    ['job already cancelled', async () => { const [w] = await pros(1); return [await openJob([w], { status: 'CANCELLED' }), w]; }, 409],
    ['job already completed', async () => { const [w] = await pros(1); return [await openJob([w], { status: 'COMPLETED' }), w]; }, 409],
    ['job held by someone else', async () => { const [w, other] = await pros(2); return [await openJob([w], { workerId: other._id, status: 'WORKER_ACCEPTED' }), w]; }, 409],
  ])('%s → refused', async (_name, make, status) => {
    const [id, w] = await make();
    const r = await claim(id, w);
    expect(r.status).toBe(status);
    expect(r.body.booking).toBeUndefined();
  });

  test.each([
    ['no such job', () => oid(), 404],
    ['a malformed id', () => 'not-an-id', 400],
  ])('%s', async (_name, idOf, status) => {
    const [w] = await pros(1);
    expect((await claim(idOf(), w)).status).toBe(status);
  });

  test.each([['a customer', 'user'], ['an admin token', 'admin']])('%s cannot claim', async (_name, role) => {
    const id = await openJob([]);
    expect([401, 403]).toContain((await claim(id, oid(), role)).status);
  });

  test('no token at all', async () => {
    const id = await openJob([]);
    expect((await request(app).post(`/api/repair/bookings/${id}/claim`).send({})).status).toBe(401);
  });

  test('a blocked pro cannot claim even when offered', async () => {
    const [w] = await pros(1, { isBlocked: true });
    const id = await openJob([w]);
    expect([401, 403]).toContain((await claim(id, w)).status);
    expect((await RepairBooking.findById(id).lean()).workerId).toBeNull();
  });

  test('scale: 25 jobs, 8 pros each, all claimed at once: every job has exactly one pro and nobody holds a job they lost', async () => {
    const jobs = [];
    for (let i = 0; i < 25; i += 1) {
      const list = await pros(8);
      jobs.push({ id: await openJob(list), list });
    }
    const all = await Promise.all(jobs.flatMap(({ id, list }) => list.map((w) => claim(id, w).then((r) => ({ id, w, r })))));
    for (const { id } of jobs) {
      const wins = all.filter((x) => String(x.id) === String(id) && x.r.status === 200);
      expect(wins).toHaveLength(1);
      expect(String((await RepairBooking.findById(id).lean()).workerId)).toBe(String(wins[0].w._id));
    }
    expect(all.filter((x) => ![200, 409].includes(x.r.status))).toEqual([]);
  });
});
