// City and state pages: every state listed, live cities book now, others say coming soon, no thin service pages, no fake ratings, valid structured data.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const City = require('../src/modules/seo/city.model');
const { CITIES, STATE_LIST } = require('../src/modules/seo/seo-data');

jest.setTimeout(60000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);

const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('covers every state and union territory', () => {
  expect(STATE_LIST.length).toBe(36);
  expect(CITIES.length).toBeGreaterThan(100);
  expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
});

test('a live city books now; a coming-soon city says so and has no service pages', async () => {
  const hyd = await request(app).get('/in/hyderabad');
  expect(hyd.status).toBe(200);
  expect(hyd.text).toContain('Live now');
  expect(hyd.text).toContain('href="https://www.zappyone.com/in/hyderabad/bike-wash"');
  const pune = await request(app).get('/in/pune');
  expect(pune.text).toContain('ZappyOne is coming to Pune');
  expect(pune.text).not.toContain('Live now');
  const thin = await request(app).get('/in/pune/bike-wash');
  expect(thin.status).toBe(301);
  expect(thin.headers.location).toBe('https://www.zappyone.com/in/pune');
  expect((await request(app).get('/in/hyderabad/gachibowli/car-wash')).status).toBe(200);
  expect((await request(app).get('/in/nowhere')).status).toBe(301);
});

test('no fake ratings or old brand anywhere, and structured data parses', async () => {
  for (const path of ['/in', '/in/state/telangana', '/in/hyderabad', '/in/hyderabad/grocery-shopping-help', '/in/delhi']) {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/ratingValue|reviewCount|aggregateRating/i);
    expect(res.text).not.toMatch(/\bZappy\b(?!One| One|<b>One)/);
    expect(res.text).toContain(`<link rel="canonical" href="https://www.zappyone.com${path}">`);
    expect(ldOf(res.text).length).toBeGreaterThan(0);
  }
});

test('admin switching a city live turns its page and sitemap on', async () => {
  await City.create({ slug: 'pune', name: 'Pune', state: 'Maharashtra', lat: 18.52, lng: 73.85, live: true });
  require('../src/config/redis').redis.del?.('seo:sitemap:v2')?.catch?.(() => {});
  expect((await request(app).get('/in/pune')).text).toContain('Live now');
  const map = (await request(app).get('/sitemap.xml')).text;
  expect(map).toContain('https://www.zappyone.com/in/state/ladakh');
  expect(map).toContain('https://www.zappyone.com/in/hyderabad/bike-wash');
  expect(map).not.toContain('https://www.zappyone.com/in/delhi/bike-wash');
});
