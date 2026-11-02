// A page refresh reuses the browser's copy of the public catalog; an error reply is never cached.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
});
afterAll(stopMongo);

test('categories are cacheable by the browser, a missing service is not', async () => {
  const ok = await request(app).get('/api/catalog/categories');
  expect(ok.status).toBe(200);
  expect(ok.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=600');

  const missing = await request(app).get('/api/catalog/services/no-such-service');
  expect(missing.status).toBe(404);
  expect(missing.headers['cache-control']).toBeUndefined();
});
