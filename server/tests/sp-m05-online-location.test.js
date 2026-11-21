// ServicePro module 5, going online and live location: only a verified pro in India with a real GPS fix goes online, fake jumps are dropped, and a pro's position reaches only their own customer.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { redis } = require('../src/config/redis');

jest.setTimeout(180000);
let app; let Worker;
let ipN = 0;
const oid = () => new mongoose.Types.ObjectId();
const HYD = { lat: 17.4483, lng: 78.3915 };
const as = (w, role = 'worker') => `Bearer ${signAccessToken({ sub: String(w._id || w), role })}`;
const post = (path, w, body, role) => request(app).post(`/api/workers/${path}`).set('Authorization', as(w, role)).set('X-Forwarded-For', `10.5.${Math.floor(ipN / 250)}.${(ipN++) % 250}`).send(body);
let n = 0;
const pro = (extra = {}) => { n += 1; return Worker.create({ name: `Online ${n}`, phone: `95${String(n).padStart(8, '0')}`, kyc: { status: 'approved' }, ...extra }); };

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Worker = require('../src/modules/worker/worker.model');
  // The in-process Redis has no GEOADD inside a pipeline; the live Redis does.
  jest.spyOn(require('../src/modules/worker/geo.service'), 'markOnline').mockResolvedValue();
});
afterAll(stopMongo);

describe('going online: input', () => {
  test.each([
    ['no position', {}],
    ['latitude only', { lat: HYD.lat }],
    ['longitude only', { lng: HYD.lng }],
    ['latitude as text', { lat: 'north', lng: HYD.lng }],
    ['position as objects', { lat: { $gt: 0 }, lng: HYD.lng }],
    ['negative accuracy', { ...HYD, accuracy: -5 }],
    ['absurd accuracy', { ...HYD, accuracy: 2e6 }],
  ])('%s → 400', async (_name, body) => {
    const w = await pro();
    expect((await post('online', w, body)).status).toBe(400);
    expect((await Worker.findById(w._id).lean()).isOnline).not.toBe(true);
  });
});

describe('going online: who and where', () => {
  test.each([
    ['London', { lat: 51.5, lng: -0.12 }],
    ['Dubai', { lat: 25.2, lng: 55.27 }],
    ['Singapore', { lat: 1.35, lng: 103.8 }],
    ['0,0 (a phone with no fix)', { lat: 0, lng: 0 }],
    ['latitude 200', { lat: 200, lng: 78 }],
  ])('outside India (%s) is refused', async (_name, pos) => {
    const r = await post('online', await pro(), pos);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('LOCATION_OUT_OF_AREA');
  });
  test.each([[501], [1000], [5000]])('a rough fix (%s m) is refused with a way to fix it', async (accuracy) => {
    const r = await post('online', await pro(), { ...HYD, accuracy });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('LOCATION_TOO_ROUGH');
  });
  test.each([[0], [5], [499], [500], [null]])('a fix of %s m is good enough', async (accuracy) => {
    expect((await post('online', await pro(), { ...HYD, accuracy })).status).toBe(200);
  });
  test.each([
    ['documents not sent', { kyc: { status: 'not_submitted' } }, 403, 'KYC_NOT_APPROVED'],
    ['documents in review', { kyc: { status: 'pending_review' } }, 403, 'KYC_NOT_APPROVED'],
    ['documents rejected', { kyc: { status: 'rejected' } }, 403, 'KYC_NOT_APPROVED'],
    ['blocked (stopped at sign-in itself)', { isBlocked: true }, 403, 'ACCOUNT_BLOCKED'],
    ['paused for handing back jobs', { penalties: { pausedUntil: new Date(Date.now() + 3600e3) } }, 403, 'WORKER_PAUSED'],
  ])('%s → refused', async (_name, extra, status, code) => {
    const w = await pro(extra);
    const r = await post('online', w, HYD);
    expect([r.status, r.body.code]).toEqual([status, code]);
    expect((await Worker.findById(w._id).lean()).isOnline).not.toBe(true);
  });
  test('a pause that has ended lets them online', async () => {
    expect((await post('online', await pro({ penalties: { pausedUntil: new Date(Date.now() - 60000) } }), HYD)).status).toBe(200);
  });
  test('owing ZappyOne past the limit stops going online, with the amount', async () => {
    const w = await pro();
    const Wallet = require('../src/modules/wallet/wallet.model');
    await Wallet.collection.insertOne({ owner: { kind: 'worker', id: w._id }, balancePaise: -10_000_000, createdAt: new Date(), updatedAt: new Date() });
    const r = await post('online', w, HYD);
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('WALLET_BLOCKED');
  });
  test('a token for someone who no longer exists', async () => {
    expect((await post('online', oid(), HYD)).status).toBe(404);
  });
  test.each([['a customer', 'user'], ['a shop owner', 'shop']])('%s cannot use the pro switch', async (_name, role) => {
    expect((await post('online', oid(), HYD, role)).status).toBe(403);
  });

  test('online stores the position, and going online again keeps the session start', async () => {
    const w = await pro();
    const first = await post('online', w, { ...HYD, accuracy: 12 });
    expect(first.status).toBe(200);
    const a = await Worker.findById(w._id).lean();
    expect(a).toMatchObject({ isOnline: true, isAvailable: true });
    expect(a.currentLocation.coordinates).toEqual([HYD.lng, HYD.lat]);
    expect(a.currentLocation.accuracyM).toBe(12);
    await new Promise((r) => setTimeout(r, 20));
    await post('online', w, HYD);
    expect((await Worker.findById(w._id).lean()).onlineSince.getTime()).toBe(a.onlineSince.getTime());
  });
  test('offline turns them off', async () => {
    const w = await pro();
    await post('online', w, HYD);
    expect((await post('offline', w, {})).status).toBe(200);
    expect((await Worker.findById(w._id).lean()).isOnline).toBe(false);
  });
  test('offline twice is harmless', async () => {
    const w = await pro();
    expect((await post('offline', w, {})).status).toBe(200);
    expect((await post('offline', w, {})).status).toBe(200);
  });
});

describe('live location', () => {
  test.each([
    ['no position', {}],
    ['latitude 91', { lat: 91, lng: 78 }],
    ['longitude 181', { lat: 17, lng: 181 }],
    ['bad job id', { ...HYD, jobId: 'abc' }],
    ['bad order id', { ...HYD, orderId: '123' }],
    ['position as text', { lat: 'x', lng: 'y' }],
  ])('%s → 400', async (_name, body) => {
    expect((await post('location', await pro(), body)).status).toBe(400);
  });

  test('the stored position is written at most once every 30 seconds, however often they ping', async () => {
    const w = await pro();
    await redis.del(`loc:mongo:${w._id}`, `worker:lastloc:${w._id}`);
    for (let i = 0; i < 10; i += 1) expect((await post('location', w, { lat: HYD.lat + i * 0.0001, lng: HYD.lng })).status).toBe(200);
    expect((await Worker.findById(w._id).lean()).currentLocation.coordinates[1]).toBeCloseTo(HYD.lat, 6);
  });
  test('a rough reading never replaces a good stored position', async () => {
    const w = await pro({ currentLocation: { type: 'Point', coordinates: [HYD.lng, HYD.lat] } });
    await redis.del(`loc:mongo:${w._id}`, `worker:lastloc:${w._id}`);
    await post('location', w, { lat: HYD.lat + 0.01, lng: HYD.lng, accuracy: 3000 });
    expect((await Worker.findById(w._id).lean()).currentLocation.coordinates).toEqual([HYD.lng, HYD.lat]);
  });

  test.each([
    ['a 2 km hop in 10 seconds (720 km/h)', 0.018, 10_000, false],
    ['Hyderabad to Delhi in a minute', 11, 60_000, false],
    ['a 1 km move in a minute (60 km/h)', 0.009, 60_000, true],
    ['standing still', 0, 60_000, true],
    ['a 3 km move in 2 minutes (90 km/h)', 0.027, 120_000, true],
  ])('%s: accepted = %s', async (_name, dLat, ms, accepted) => {
    const w = await pro();
    await redis.del(`loc:mongo:${w._id}`);
    await redis.set(`worker:lastloc:${w._id}`, JSON.stringify({ lat: HYD.lat, lng: HYD.lng, ts: Date.now() - ms }));
    const r = await post('location', w, { lat: HYD.lat + dLat, lng: HYD.lng });
    expect(r.status).toBe(200);
    const stored = (await Worker.findById(w._id).lean()).currentLocation?.coordinates?.[1];
    if (accepted) expect(stored).toBeCloseTo(HYD.lat + dLat, 6);
    else expect(stored).not.toBeCloseTo(HYD.lat + dLat, 6);
  });

  test('a pro cannot push their position onto another pro\'s order', async () => {
    const owner = await pro(); const intruder = await pro();
    const Order = require('../src/modules/order/order.model');
    const { insertedId } = await Order.collection.insertOne({ userId: oid(), workerId: owner._id, status: 'on_the_way', createdAt: new Date(), updatedAt: new Date() });
    const spy = jest.spyOn(redis, 'publish');
    await redis.del(`worker:lastloc:${intruder._id}`);
    expect((await post('location', intruder, { ...HYD, orderId: String(insertedId) })).status).toBe(200);
    const leaked = spy.mock.calls.filter(([ch, msg]) => ch === 'order:event' && msg.includes(String(insertedId)));
    spy.mockRestore();
    expect(leaked).toEqual([]);
  });
  test('the assigned pro on the way does reach their order', async () => {
    const owner = await pro();
    const Order = require('../src/modules/order/order.model');
    const { insertedId } = await Order.collection.insertOne({ userId: oid(), workerId: owner._id, status: 'on_the_way', createdAt: new Date(), updatedAt: new Date() });
    const spy = jest.spyOn(redis, 'publish');
    await redis.del(`worker:lastloc:${owner._id}`);
    await post('location', owner, { ...HYD, orderId: String(insertedId) });
    const sent = spy.mock.calls.filter(([ch, msg]) => ch === 'order:event' && msg.includes(String(insertedId)));
    spy.mockRestore();
    expect(sent.length).toBeGreaterThan(0);
  });

  test('scale: 500 pros send their position at the same moment: every one answered, none fails', async () => {
    const list = await Worker.insertMany(Array.from({ length: 500 }, (_, i) => ({ name: `Ping ${i}`, phone: `94${String(i).padStart(8, '0')}`, kyc: { status: 'approved' } })));
    const t = Date.now();
    const res = await Promise.all(list.map((w, i) => post('location', w, { lat: HYD.lat + (i % 50) * 0.001, lng: HYD.lng + Math.floor(i / 50) * 0.001 })));
    expect(res.filter((r) => r.status !== 200)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(60000);
  });
});
