// Admin's integrations check: every service reports working, not set up or not working with a fix, and the check never throws, even with nothing configured.
const { startMongo, stopMongo, adminToken } = require('./helpers');
const request = require('supertest');

jest.setTimeout(60000);
const KEYS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY', 'APNS_KEY_PATH', 'GOOGLE_MAPS_KEY', 'MAPBOX_TOKEN'];
let saved;
beforeAll(async () => {
  await startMongo();
  require('../src/config');
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  await stopMongo();
});

test('with nothing set up, each service says so with a fix, and arrival times fall back to distance', async () => {
  const spy = jest.spyOn(global, 'fetch');
  const r = await require('../src/modules/admin/lib/integrations').checkAll();
  expect(r.allOk).toBe(false);
  expect(r.etaSource).toBe('straight-line distance only');
  const byKey = Object.fromEntries(r.services.map((s) => [s.key, s]));
  for (const k of ['push_android', 'push_ios', 'maps_google', 'maps_mapbox']) {
    expect(byKey[k]).toMatchObject({ state: 'missing', ok: false });
    expect(byKey[k].fix).toBeTruthy();
  }
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('a Google key without billing is reported as not working, with the billing fix', async () => {
  process.env.GOOGLE_MAPS_KEY = 'test-key';
  const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ status: 'REQUEST_DENIED', error_message: 'You must enable Billing on the Google Cloud Project' }) });
  const r = await require('../src/modules/admin/lib/integrations').checkAll();
  const g = r.services.find((s) => s.key === 'maps_google');
  expect(g).toMatchObject({ state: 'failing', ok: false });
  expect(g.fix).toMatch(/billing/i);
  spy.mockRestore();
  delete process.env.GOOGLE_MAPS_KEY;
});

test('a working Google key reports the traffic time it saw', async () => {
  process.env.GOOGLE_MAPS_KEY = 'test-key';
  const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: 6200 }, duration: { value: 840 }, duration_in_traffic: { value: 1080 } }] }] }) });
  const r = await require('../src/modules/admin/lib/integrations').checkAll();
  expect(r.services.find((s) => s.key === 'maps_google')).toMatchObject({ state: 'ok', detail: expect.stringMatching(/6\.2 km, 18 min in traffic/) });
  expect(r.etaSource).toBe('Google (live traffic)');
  spy.mockRestore();
  delete process.env.GOOGLE_MAPS_KEY;
});

test('a service that never answers is reported, not left hanging', async () => {
  process.env.MAPBOX_TOKEN = 'test-token';
  const spy = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
  const r = await require('../src/modules/admin/lib/integrations').checkAll();
  expect(r.services.find((s) => s.key === 'maps_mapbox')).toMatchObject({ state: 'failing', detail: expect.stringMatching(/did not answer/) });
  spy.mockRestore();
  delete process.env.MAPBOX_TOKEN;
}, 20000);

test('only admin can open it', async () => {
  const app = require('../src/app')();
  const path = `/api/${process.env.ADMIN_LOGIN_SLUG}/system/integrations`;
  expect([401, 403, 404]).toContain((await request(app).get(path)).status);
  const admin = await adminToken();
  const r = await request(app).get(path).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.services)).toBe(true);
});
