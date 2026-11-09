// Admin App & traffic: the apps and websites report which surface, app and version they are; live now, daily traffic and versions come back split by surface, as counts only.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let traffic; let VisitorSession;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  traffic = require('../src/modules/admin-portal/traffic.service');
  ({ VisitorSession } = require('../src/modules/telemetry/telemetry.model'));
});
afterAll(stopMongo);

const view = (body) => request(app).post('/api/telemetry/pageview').send(body);
const settle = () => new Promise((r) => setTimeout(r, 150));
// The server saves after replying (the app never waits), so wait for the record.
async function saved(sessionId) {
  for (let i = 0; i < 40; i += 1) {
    const s = await VisitorSession.findOne({ sessionId }).lean();
    if (s) return s;
    await settle();
  }
  return null;
}

test('a page view from the ServicePro app records platform, app, version and phone', async () => {
  await view({ sessionId: 'sess_app_one', path: '/shop', platform: 'android', app: 'servicepro', appVersion: '1.0.2', deviceModel: 'Redmi Note 12', osVersion: 34, userType: 'shop' });
  const s = await saved('sess_app_one');
  expect(s).toMatchObject({ platform: 'android', app: 'servicepro', appVersion: '1.0.2', deviceModel: 'Redmi Note 12', osVersion: '34', userType: 'shop' });
});

test('made-up values are ignored, not stored', async () => {
  await view({ sessionId: 'sess_bad_vals', path: '/', platform: 'windows95', app: 'hacker', appVersion: '<script>' });
  const s = await saved('sess_bad_vals');
  expect(s).toMatchObject({ platform: 'web', app: 'customer', appVersion: null });
});

test('daily traffic is split by surface, and people counted once', async () => {
  await view({ sessionId: 'sess_web_a', path: '/', platform: 'web', app: 'customer' });
  await view({ sessionId: 'sess_cust_a', path: '/', platform: 'android', app: 'customer', appVersion: '1.0.2' });
  await settle();
  const out = await traffic.summary({ days: 1 });
  const by = Object.fromEntries(out.rows.map((r) => [r.surface, r]));
  expect(by['android:servicepro'].sessions).toBeGreaterThanOrEqual(1);
  expect(by['android:customer'].sessions).toBeGreaterThanOrEqual(1);
  expect(by['web:customer'].people).toBeGreaterThanOrEqual(1);
  expect(out.surfaces).toEqual(expect.arrayContaining(['android:servicepro', 'android:customer', 'web:customer']));
});

test('versions and phones in use are listed per app', async () => {
  const out = await traffic.versions({ days: 1 });
  expect(out.appVersions).toEqual(expect.arrayContaining([expect.objectContaining({ app: 'servicepro', value: '1.0.2' })]));
  expect(out.models).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'Redmi Note 12' })]));
});

test('live now counts who was seen in the last minute, by surface', async () => {
  await request(app).post('/api/telemetry/heartbeat').send({ sessionId: 'sess_app_one' });
  await settle();
  const out = await traffic.live();
  expect(out.total).toBeGreaterThanOrEqual(1);
  expect(out.bySurface['android:servicepro']).toBeGreaterThanOrEqual(1);
});

test('funnel: visits that opened a booking, per surface, beside bookings made and lost', async () => {
  await view({ sessionId: 'sess_booker_1', path: '/repair', platform: 'android', app: 'customer' });
  await saved('sess_booker_1');
  const out = await traffic.funnel({ days: 1 });
  const row = out.bySurface.find((r) => r.surface === 'android:customer');
  expect(row.visits).toBeGreaterThanOrEqual(1);
  expect(row.startedBooking).toBeGreaterThanOrEqual(1);
  expect(out.bookings).toEqual(expect.objectContaining({ made: expect.any(Number), lost: expect.any(Number) }));
});

test('notifications: sent, pushed and opened per type', async () => {
  const Notification = require('../src/modules/notification/notification.model');
  const mongoose = require('mongoose');
  const to = { kind: 'user', id: new mongoose.Types.ObjectId() };
  await Notification.create([
    { recipient: to, type: 'system_alert', title: 'a', channels: { push: { sent: true } }, readAt: new Date() },
    { recipient: to, type: 'system_alert', title: 'b', channels: { push: { sent: true } } },
    { recipient: to, type: 'system_alert', title: 'c' },
  ]);
  const out = await traffic.notifications({ days: 1 });
  const row = out.rows.find((r) => r.type === 'system_alert' && r.to === 'user');
  expect(row).toMatchObject({ sent: 3, pushed: 2, read: 1 });
});

test('retention: a person back the next day counts in day 1, 7 and 30', async () => {
  const mongoose = require('mongoose');
  const uid = new mongoose.Types.ObjectId();
  const day = 86_400_000; const t = Date.now() - 10 * day;
  await VisitorSession.collection.insertMany([
    { sessionId: 'ret_a', userId: uid, firstSeen: new Date(t), lastSeen: new Date(t) },
    { sessionId: 'ret_b', userId: uid, firstSeen: new Date(t + day), lastSeen: new Date(t + day) },
  ]);
  const out = await traffic.retention({ weeks: 4 });
  const c = out.cohorts.find((x) => x.people >= 1 && x.d1 >= 1);
  expect(c).toBeTruthy();
  expect(c.d7).toBeGreaterThanOrEqual(1);
  expect(c.d30).toBeGreaterThanOrEqual(1);
});

test('searches: top searches and the ones that found no service', async () => {
  const { SearchEvent } = require('../src/modules/telemetry/telemetry.model');
  await SearchEvent.create([{ category: 'ac_service', result: 'no_service' }, { category: 'ac_service', result: 'served' }, { category: 'mobile', result: 'served' }]);
  const out = await traffic.searches({ days: 1 });
  expect(out.top.find((r) => r.category === 'ac_service')).toMatchObject({ total: 2, noService: 1 });
  expect(out.unmet.map((r) => r.category)).toContain('ac_service');
});

test('speed: API calls are timed in memory, ids folded into one route', async () => {
  await request(app).get('/api/repair/verticals');
  await request(app).get('/api/repair/verticals');
  const out = await traffic.speed();
  const row = out.routes.find((r) => r.route === 'GET /api/repair/verticals');
  expect(row.calls).toBeGreaterThanOrEqual(2);
  expect(typeof row.p95).toBe('number');
});

test('partners and sources answer without data too', async () => {
  const p = await traffic.partners({ days: 7 });
  expect(p.now).toEqual(expect.objectContaining({ prosOnline: expect.any(Number), shopsLive: expect.any(Number) }));
  const s = await traffic.sources({ days: 7 });
  expect(Array.isArray(s.referrers)).toBe(true);
  expect(typeof s.referralSignups).toBe('number');
});
