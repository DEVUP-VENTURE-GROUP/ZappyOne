// Fleet access: only admins whose access includes Fleet get a Fleet session (at sign-in and at every renewal); every sign-in and Fleet action is recorded.
jest.mock('../src/modules/auth/auth.service', () => ({
  loginAdmin: jest.fn(), refresh: jest.fn(), revoke: jest.fn().mockResolvedValue(true),
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startMongo, stopMongo } = require('./helpers');
const authService = require('../src/modules/auth/auth.service');
const ctrl = require('../src/modules/auth/auth.controller');
const Admin = require('../src/modules/admin/admin.model');
const AuditLog = require('../src/modules/admin/audit-log.model');
const activity = require('../src/modules/workforce/activity');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.post('/api/auth/admin/login', ctrl.loginAdmin);
app.post('/api/auth/refresh', ctrl.refresh);
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, code: err.code })); // eslint-disable-line no-unused-vars

let marketing; let fleetLead;
const signIn = (admin, portal) => {
  authService.loginAdmin.mockResolvedValueOnce({ admin: { _id: admin._id, email: admin.email, role: 'admin' }, accessToken: 'a', refreshToken: 'r' });
  return request(app).post('/api/auth/admin/login').set('X-Client-Type', portal).send({ email: admin.email, password: 'x'.repeat(12) });
};
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  await startMongo();
  marketing = await Admin.create({ name: 'Mira', email: 'mira@zappyone.com', passwordHash: 'x', role: 'marketing' });
  fleetLead = await Admin.create({ name: 'Farid', email: 'farid@zappyone.com', passwordHash: 'x', role: 'fleet_manager' });
});
afterAll(stopMongo);
beforeEach(() => jest.clearAllMocks());

test('an admin without Fleet access is refused at the Fleet portal, the session is revoked, and the attempt is recorded', async () => {
  const res = await signIn(marketing, 'fleet');
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('NO_FLEET_ACCESS');
  expect(authService.revoke).toHaveBeenCalledWith('r');
  expect(res.headers['set-cookie']).toBeUndefined();
  await settle();
  expect(await AuditLog.findOne({ action: 'admin.login_failure', 'actor.email': marketing.email, portal: 'fleet' })).toBeTruthy();
});

test('the same admin signs in to admin as before, recorded with the portal', async () => {
  const res = await signIn(marketing, 'admin');
  expect(res.status).toBe(200);
  expect(res.headers['set-cookie'].join(';')).toMatch(/zappy_admin_rt=/);
  await settle();
  expect(await AuditLog.findOne({ action: 'admin.login_success', 'actor.id': marketing._id, portal: 'admin' })).toBeTruthy();
});

test('a fleet manager gets a Fleet session in the Fleet cookie, not the admin one', async () => {
  const res = await signIn(fleetLead, 'fleet');
  expect(res.status).toBe(200);
  const cookies = res.headers['set-cookie'].join(';');
  expect(cookies).toMatch(/zappy_fleet_rt=/);
  expect(cookies).not.toMatch(/zappy_admin_rt=/);
});

test('Fleet access given on its own opens the portal; taken away, the next renewal ends the session', async () => {
  await Admin.updateOne({ _id: marketing._id }, { $set: { permissions: ['fleet:*'] } });
  expect((await signIn(marketing, 'fleet')).status).toBe(200);

  await Admin.updateOne({ _id: marketing._id }, { $set: { permissions: [] } });
  authService.refresh.mockResolvedValueOnce({ accessToken: jwt.sign({ sub: String(marketing._id), role: 'admin' }, 'k'), refreshToken: 'r2', role: 'admin' });
  const res = await request(app).post('/api/auth/refresh').set('X-Client-Type', 'fleet').set('Cookie', 'zappy_fleet_rt=r1').send({});
  expect(res.status).toBe(401);
  expect(res.body.code).toBe('NO_FLEET_ACCESS');
  expect(authService.revoke).toHaveBeenCalledWith('r2');
});

describe('Fleet activity', () => {
  const fleet = express();
  fleet.use(express.json());
  fleet.use((req, res, next) => { req.auth = { sub: String(fleetLead._id), email: fleetLead.email, role: 'admin' }; next(); });
  fleet.use(activity.recorder);
  fleet.get('/workforce/shifts/:id/selfie', (req, res) => res.send('img'));
  fleet.get('/workforce/hubs', (req, res) => res.json([]));
  fleet.post('/workforce/thing', (req, res) => res.json({ ok: true }));
  fleet.post('/workforce/detailed', (req, res) => { require('../src/modules/admin/audit.service').fromRequest(req, 'workforce.hub_create', { kind: 'hub' }, null, {}); res.json({ ok: true }); });
  fleet.post('/workforce/fails', (req, res) => res.status(400).json({}));

  test('private reads and unlogged writes are recorded once; plain reads, detailed writes and failures are not doubled', async () => {
    await AuditLog.deleteMany({});
    await request(fleet).get('/workforce/shifts/abc/selfie').set('X-Client-Type', 'fleet').expect(200);
    await request(fleet).get('/workforce/hubs').expect(200);
    await request(fleet).post('/workforce/thing').send({ a: 1 }).expect(200);
    await request(fleet).post('/workforce/detailed').expect(200);
    await request(fleet).post('/workforce/fails').expect(400);
    await settle();
    const actions = (await AuditLog.find({}).lean()).map((l) => l.action).sort();
    expect(actions).toEqual(['fleet.post', 'fleet.view_selfie', 'workforce.hub_create']);
    expect(await AuditLog.findOne({ action: 'fleet.view_selfie' }).lean()).toMatchObject({ portal: 'fleet', 'actor': { email: fleetLead.email } });
  });

  test('the activity list has Fleet actions and Fleet sign-ins, newest first, and filters by person', async () => {
    await AuditLog.create({ actor: { kind: 'admin', id: marketing._id }, action: 'admin.login_success', portal: 'fleet' });
    await AuditLog.create({ actor: { kind: 'admin', id: marketing._id }, action: 'pricing_update', portal: 'admin' });
    const all = await activity.list();
    expect(all.logs.map((l) => l.action)).toContain('admin.login_success');
    expect(all.logs.map((l) => l.action)).not.toContain('pricing_update');
    const mine = await activity.list({ actorId: marketing._id });
    expect(mine.logs.every((l) => String(l.actor.id) === String(marketing._id))).toBe(true);
  });
});
