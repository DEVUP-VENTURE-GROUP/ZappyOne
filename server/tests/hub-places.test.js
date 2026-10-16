// Hub routes: pincodes and localities saved as areas, a drawn area cleared back to the radius, oversized places refused, map search hidden without a key.
const express = require('express');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const Hub = require('../src/modules/workforce/hub.model');
const { covers } = require('../src/modules/workforce/coverage');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.auth = { sub: '64b000000000000000000001', role: 'admin', email: 'ops@zappyone.com' }; next(); });
app.use(require('../src/modules/workforce/workforce.admin.routes'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, code: err.code })); // eslint-disable-line no-unused-vars

const PIN = { kind: 'pincode', key: '500081', name: 'Hyderabad', bbox: { west: 78.366773, south: 17.423186, east: 78.404057, north: 17.457494 } };
const base = { name: 'Madhapur', city: 'Hyderabad', lat: 17.4483, lng: 78.3915, serviceKm: 25 };

beforeAll(startMongo);
afterAll(stopMongo);

test('a hub saved with a pincode covers inside it and not 10 km out, even with a 25 km radius', async () => {
  const res = await request(app).post('/workforce/hubs').send({ ...base, places: [PIN] }).expect(201);
  const hub = await Hub.findById(res.body.hub._id).lean();
  expect(hub.places[0]).toMatchObject({ kind: 'pincode', key: '500081' });
  expect(covers(hub, { lat: 17.44, lng: 78.38 })).toBe(true);
  expect(covers(hub, { lat: 17.44 + 10 / 111, lng: 78.38 })).toBe(false);
});

test('clearing the drawn area and places goes back to the radius', async () => {
  const { body } = await request(app).post('/workforce/hubs').send({ ...base, name: 'Kondapur', area: [[78.35, 17.45], [78.37, 17.45], [78.37, 17.47]], places: [PIN] }).expect(201);
  await request(app).put(`/workforce/hubs/${body.hub._id}`).send({ area: null, places: [] }).expect(200);
  const hub = await Hub.findById(body.hub._id).lean();
  expect(hub.area?.coordinates).toBeUndefined();
  expect(hub.places).toHaveLength(0);
  expect(covers(hub, { lat: 17.4483 + 20 / 111, lng: 78.3915 })).toBe(true);
});

test('a place bigger than one hub could serve is refused', async () => {
  const res = await request(app).post('/workforce/hubs').send({ ...base, name: 'Telangana', places: [{ ...PIN, key: 'x', kind: 'locality', bbox: { west: 77, south: 16, east: 81, north: 19 } }] });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('PLACE_TOO_LARGE');
});

test('without a map key, search says so and the hubs list hides it', async () => {
  const prev = process.env.MAPBOX_TOKEN;
  delete process.env.MAPBOX_TOKEN;
  expect((await request(app).get('/workforce/areas').query({ q: '500081' })).body.code).toBe('MAPS_NOT_CONFIGURED');
  expect((await request(app).get('/workforce/hubs')).body.search).toBe(false);
  if (prev) process.env.MAPBOX_TOKEN = prev;
});
