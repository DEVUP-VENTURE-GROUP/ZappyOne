// Insight reports are computed once per filter and shared for two minutes.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(60000);

let app; let auth; let base;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  auth = { Authorization: `Bearer ${await adminToken()}` };
  base = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
});
afterAll(stopMongo);

test('two opens of the same report compute it once; another filter computes again', async () => {
  const svc = require('../src/modules/admin-portal/analytics.service');
  const spy = jest.spyOn(svc, 'overview');
  expect((await request(app).get(`${base}/insights/overview?days=7`).set(auth)).status).toBe(200);
  expect((await request(app).get(`${base}/insights/overview?days=7`).set(auth)).status).toBe(200);
  expect(spy).toHaveBeenCalledTimes(1);
  expect((await request(app).get(`${base}/insights/overview?days=30`).set(auth)).status).toBe(200);
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
