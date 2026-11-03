// Home's live catalog is built once a minute and served from Redis in between, per app UI level.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');

jest.setTimeout(120000);
let app;
beforeAll(async () => {
  process.env.LIVE_CATALOG_CACHE_SEC = '60';
  await startMongo();
  app = require('../src/app')();
});
afterAll(async () => { process.env.LIVE_CATALOG_CACHE_SEC = '0'; await stopMongo(); });

test('the second visit is served from the cache, and apps get their own copy', async () => {
  const first = await request(app).get('/api/provider/onboarding/catalog');
  expect(first.status).toBe(200);
  // The key carries the coverage version (onboarding/coverage-version), so a provider's change is a new key.
  const key = `catalog:live:${await require('../src/modules/onboarding/coverage-version').current()}:Infinity`;
  expect(await redis.ttl(key)).toBeGreaterThan(0);

  await redis.set(key, JSON.stringify({ domains: [{ code: 'from-cache' }] }), 'EX', 60);
  const second = await request(app).get('/api/provider/onboarding/catalog');
  expect(second.body.domains.map((d) => d.code)).toEqual(['from-cache']);

  const appCall = await request(app).get('/api/provider/onboarding/catalog').set('x-client-type', 'mobile').set('x-ui-level', '3');
  expect(appCall.body.domains.map((d) => d.code)).not.toContain('from-cache');
});

test('a provider change makes the next visit build the catalog again', async () => {
  const version = require('../src/modules/onboarding/coverage-version');
  const key = `catalog:live:${await version.current()}:Infinity`;
  await redis.set(key, JSON.stringify({ domains: [{ code: 'from-cache' }] }), 'EX', 60);
  const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.updateOne({ code: 'nobody_cares' }, { $set: { name: 'x' } }, { upsert: true });
  await new Promise((r) => setTimeout(r, 1100));
  const fresh = await request(app).get('/api/provider/onboarding/catalog');
  expect(fresh.body.domains.map((d) => d.code)).not.toContain('from-cache');
});
