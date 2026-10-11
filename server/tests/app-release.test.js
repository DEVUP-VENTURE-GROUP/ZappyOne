/**
 * App versions (Admin → System → App versions):
 *   - an app with nothing set needs no update (0.0.0), and the public read needs no sign-in
 *   - an admin with System access sets them; others cannot; bad versions are refused
 */
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let Admin;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Admin = require('../src/modules/admin/admin.model');
});
afterAll(stopMongo);

async function adminToken(role) {
  const a = await Admin.create({ email: `${role}-${Date.now()}@z.test`, name: role, passwordHash: 'x', role });
  return require('../src/modules/auth/token.service').signAccessToken({ sub: String(a._id), role: 'admin', email: a.email });
}
const admin = (method, path, token) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`)
  .set('Authorization', `Bearer ${token}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');

test('nothing set means nobody has to update, and anyone can read it', async () => {
  const res = await request(app).get('/api/app-release/customer').expect(200);
  expect(res.body).toEqual({ minVersion: '0.0.0', latestVersion: '0.0.0', message: '' });
  await request(app).get('/api/app-release/not-an-app').expect(200);
});

test('a system admin sets the minimum; the app reads it', async () => {
  const token = await adminToken('super_admin');
  await admin('put', '/app-releases/customer', token).send({ minVersion: '1.0.1', latestVersion: '1.1.0', message: 'Please update' }).expect(200);
  const res = await request(app).get('/api/app-release/customer').expect(200);
  expect(res.body).toEqual({ minVersion: '1.0.1', latestVersion: '1.1.0', message: 'Please update' });
  await admin('put', '/app-releases/customer', token).send({ minVersion: 'one', latestVersion: '1.1.0' }).expect(400);
  await admin('put', '/app-releases/nope', token).send({ minVersion: '1.0.0', latestVersion: '1.0.0' }).expect(404);
});

test('signed-out callers cannot change versions', async () => {
  await request(app).put(`/api/${process.env.ADMIN_LOGIN_SLUG}/app-releases/customer`).send({ minVersion: '9.0.0', latestVersion: '9.0.0' }).expect((r) => expect([401, 403]).toContain(r.status));
});
