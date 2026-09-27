/**
 * The admin portal is its own app on its own origin (admin/).
 *
 * Two guarantees are asserted here:
 *  1. In production the admin API refuses browser calls from any other origin,
 *     so an admin token lifted from the customer site cannot be replayed there.
 *  2. The admin session lives in its own refresh cookie. When the customer and
 *     admin apps shared `zappy_rt`, signing into one in the same browser
 *     replaced the other's session.
 */

jest.mock('../src/modules/auth/auth.service', () => ({
  refresh: jest.fn(),
  revoke: jest.fn().mockResolvedValue(true),
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const authService = require('../src/modules/auth/auth.service');
const ctrl = require('../src/modules/auth/auth.controller');
const { requireAdminOrigin } = require('../src/middlewares/adminOrigin');

describe('admin origin guard', () => {
  const app = express();
  app.use('/api/secret-slug', requireAdminOrigin, (req, res) => res.json({ ok: true }));
  const prevEnv = process.env.NODE_ENV;
  afterAll(() => { process.env.NODE_ENV = prevEnv; });

  test('production: refuses the customer origin, admits the admin origin and non-browser calls', async () => {
    process.env.NODE_ENV = 'production';
    await request(app).get('/api/secret-slug/x').set('Origin', 'https://zappyone.com').expect(403);
    await request(app).get('/api/secret-slug/x').set('Origin', 'https://admin.zappyone.com').expect(200);
    await request(app).get('/api/secret-slug/x').expect(200);
  });

  test('development: any origin passes (localhost / LAN testing)', async () => {
    process.env.NODE_ENV = 'development';
    await request(app).get('/api/secret-slug/x').set('Origin', 'http://localhost:5173').expect(200);
  });
});

describe('admin refresh cookie', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/refresh', ctrl.refresh);
  app.post('/api/auth/logout', ctrl.logout);

  beforeEach(() => jest.clearAllMocks());

  test('admin portal refresh reads only zappy_admin_rt, never the customer cookie', async () => {
    const res = await request(app).post('/api/auth/refresh')
      .set('X-Client-Type', 'admin')
      .set('Cookie', 'zappy_rt=customer-token')
      .send({});
    expect(res.status).toBe(401);
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  test('admin portal refresh rotates into zappy_admin_rt', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt2', role: 'admin' });
    const res = await request(app).post('/api/auth/refresh')
      .set('X-Client-Type', 'admin')
      .set('Cookie', 'zappy_admin_rt=rt1')
      .send({});
    expect(res.status).toBe(200);
    expect(authService.refresh).toHaveBeenCalledWith('rt1');
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/zappy_admin_rt=rt2/);
    expect(cookies).not.toMatch(/zappy_rt=/);
  });

  test('a non-admin session in the admin cookie is revoked and refused', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt2', role: 'user' });
    const res = await request(app).post('/api/auth/refresh')
      .set('X-Client-Type', 'admin')
      .set('Cookie', 'zappy_admin_rt=rt1')
      .send({});
    expect(res.status).toBe(401);
    expect(authService.revoke).toHaveBeenCalledWith('rt2');
  });

  test('customer refresh is unchanged and ignores the admin cookie', async () => {
    authService.refresh.mockResolvedValue({ accessToken: 'at', refreshToken: 'c2', role: 'user' });
    const res = await request(app).post('/api/auth/refresh')
      .set('Cookie', 'zappy_rt=c1; zappy_admin_rt=a1')
      .send({});
    expect(res.status).toBe(200);
    expect(authService.refresh).toHaveBeenCalledWith('c1');
    expect(res.headers['set-cookie'].join(';')).toMatch(/zappy_rt=c2/);
  });

  test('admin logout clears only the admin cookie', async () => {
    const res = await request(app).post('/api/auth/logout')
      .set('X-Client-Type', 'admin')
      .set('Cookie', 'zappy_admin_rt=a1; zappy_rt=c1')
      .send({});
    expect(res.status).toBe(200);
    expect(authService.revoke).toHaveBeenCalledWith('a1');
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/zappy_admin_rt=;/);
    expect(cookies).not.toMatch(/zappy_rt=;/);
  });
});
