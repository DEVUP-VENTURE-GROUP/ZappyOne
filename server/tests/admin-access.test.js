/**
 * Admin roles are enforced on every admin route, from the admin's record.
 */
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const Admin = require('../src/modules/admin/admin.model');
const { areaFor, can } = require('../src/modules/admin/access/permissions');

jest.setTimeout(60000);
let app;


beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
});
afterAll(stopMongo);

async function tokenFor(role, extra = {}) {
  const admin = await Admin.create({
    email: `${role}-${Date.now()}-${Math.random()}@z.test`, name: role, passwordHash: 'x', role, ...extra,
  });
  const { signAccessToken } = require('../src/modules/auth/token.service');
  return { admin, token: signAccessToken({ sub: String(admin._id), role: 'admin', email: admin.email }) };
}
const call = (method, path, token) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`)
  .set('Authorization', `Bearer ${token}`)
  .set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');

describe('area map', () => {
  test('every engine booking path is bookings work, not catalog', () => {
    expect(areaFor('/pet/bookings/abc/cancel')).toBe('bookings');
    expect(areaFor('/helping/tasks')).toBe('bookings');
    expect(areaFor('/repair/brands')).toBe('catalog');
    expect(areaFor('/onboarding/lines')).toBe('catalog');
    expect(areaFor('/onboarding/queue')).toBe('providers');
    expect(areaFor('/something-new')).toBeNull();
  });

  test('roles grant what they say', () => {
    expect(can({ role: 'finance' }, 'money', 'write')).toBe(true);
    expect(can({ role: 'support' }, 'money', 'read')).toBe(false);
    expect(can({ role: 'analyst' }, 'bookings', 'write')).toBe(false);
    expect(can({ role: 'support', permissions: ['money:read'] }, 'money', 'read')).toBe(true);
    expect(can({ role: 'super_admin' }, 'anything', 'write')).toBe(true);
  });
});

describe('enforced on requests', () => {
  test('support can read bookings but not payments', async () => {
    const { token } = await tokenFor('support');
    expect((await call('get', '/bookings', token)).status).not.toBe(403);
    const res = await call('get', '/payments', token);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'ADMIN_FORBIDDEN', area: 'money', action: 'read' });
  });

  test('an analyst can read but not change', async () => {
    const { token } = await tokenFor('analyst');
    expect((await call('get', '/payments/summary', token)).status).toBe(200);
    expect((await call('post', '/feature-flags', token).send({ flag: 'chat', enabled: false })).status).toBe(403);
  });

  test('everyone can read their own profile; only super admins manage the team', async () => {
    const { token } = await tokenFor('support');
    const me = await call('get', '/me', token);
    expect(me.status).toBe(200);
    expect(me.body.areas).toContain('bookings');
    expect(me.body.areas).not.toContain('money');
    expect((await call('get', '/admins', token)).status).toBe(403);
  });

  test('a deactivated admin is shut out even with a valid token', async () => {
    const { admin, token } = await tokenFor('ops');
    await Admin.updateOne({ _id: admin._id }, { $set: { isActive: false } });
    require('../src/modules/admin/access/guard').invalidate(admin._id);
    expect((await call('get', '/bookings', token)).status).toBe(401);
  });

  test('the last super admin cannot be demoted, and nobody changes their own role', async () => {
    await Admin.deleteMany({ role: 'super_admin' });
    const { admin, token } = await tokenFor('super_admin');
    const self = await call('patch', `/admins/${admin._id}`, token).send({ role: 'ops' });
    expect(self.body.code).toBe('SELF_CHANGE');
    const other = await tokenFor('super_admin');
    await Admin.updateOne({ _id: other.admin._id }, { $set: { isActive: false } });
    const demote = await call('patch', `/admins/${admin._id}`, other.token).send({ role: 'ops' });
    expect([401, 409]).toContain(demote.status); // the other is inactive → shut out; never a successful demotion
    expect((await Admin.findById(admin._id)).role).toBe('super_admin');
  });
});
