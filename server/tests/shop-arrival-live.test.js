// A shop's arrival time starts from whoever would go and is nearest the customer, live (the owner's phone or an online technician), not from the shop's address; the address only when nobody is live.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let Shop; let Worker; let arrival; let sign;
const DOOR = { lat: 17.4401, lng: 78.3489 }; // Gachibowli
const FAR_SHOP = [77.9044, 17.3381]; // Vikarabad, about 50 km away
const NEAR = [78.3500, 17.4410]; // next street to the customer

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Shop = require('../src/modules/shop/shop.model');
  Worker = require('../src/modules/worker/worker.model');
  arrival = require('../src/modules/jobs/arrival');
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
});
afterAll(stopMongo);

let n = 0;
const shop = (extra = {}) => {
  n += 1;
  return Shop.create({ businessName: `Live ${n}`, ownerName: 'O', phone: `90000097${String(n).padStart(2, '0')}`, address: { text: 'Vikarabad', location: { type: 'Point', coordinates: FAR_SHOP } }, ...extra });
};
const eta = async (s) => (await arrival.forProviders([{ kind: 'shop', id: String(s._id) }], DOOR)).get(`shop:${s._id}`);

test('nobody live: from the shop, with time to set off', async () => {
  const s = await shop();
  const e = await eta(s);
  expect(e.km).toBeGreaterThan(40);
});

test('the owner is live next to the customer: from the owner, minutes not an hour', async () => {
  const s = await shop();
  const r = await request(app).post('/api/shops/me/location').set('Authorization', `Bearer ${sign({ sub: String(s._id), role: 'shop' })}`).send({ lat: NEAR[1], lng: NEAR[0] });
  expect(r.status).toBe(204);
  const e = await eta(s);
  expect(e.km).toBeLessThan(1);
  expect(e.minutes).toBeLessThan(10);
});

test('an online technician nearer than the shop is the start; a stale owner position is not', async () => {
  const s = await shop({ ownerLocation: { coordinates: NEAR, at: new Date(Date.now() - 60 * 60000) } });
  expect((await eta(s)).km).toBeGreaterThan(40);
  await Worker.create({ phone: '9000009799', name: 'Tech', shopId: s._id, isOnline: true, kyc: { status: 'approved' }, currentLocation: { type: 'Point', coordinates: [78.36, 17.45], updatedAt: new Date() } });
  expect((await eta(s)).km).toBeLessThan(3);
});

test('an owner far from the customer never makes a nearby shop look out of reach', async () => {
  const s = await shop({ address: { text: 'Gachibowli', location: { type: 'Point', coordinates: [78.352, 17.442] } }, ownerLocation: { coordinates: FAR_SHOP, at: new Date() } });
  expect((await eta(s)).km).toBeLessThan(1);
});

test('only the shop itself can say where its owner is, with a real position', async () => {
  const s = await shop();
  expect((await request(app).post('/api/shops/me/location').send({ lat: 17.4, lng: 78.3 })).status).toBe(401);
  const asCustomer = sign({ sub: String(new mongoose.Types.ObjectId()), role: 'user' });
  expect((await request(app).post('/api/shops/me/location').set('Authorization', `Bearer ${asCustomer}`).send({ lat: 17.4, lng: 78.3 })).status).toBe(403);
  const asShop = sign({ sub: String(s._id), role: 'shop' });
  expect((await request(app).post('/api/shops/me/location').set('Authorization', `Bearer ${asShop}`).send({ lat: 200, lng: 78.3 })).status).toBe(400);
});

test('a shop owner on the way to their own job: their phone position reaches the customer watching, not the shop address', async () => {
  const s = await shop();
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const b = await RepairBooking.collection.insertOne({ reference: 'RB-LIVE1', userId: new mongoose.Types.ObjectId(), shopId: s._id, workerId: null, status: 'ON_THE_WAY', vertical: 'mobile', serviceMode: 'doorstep',
    location: { type: 'Point', coordinates: [DOOR.lng, DOOR.lat], address: 'Gachibowli' }, statusHistory: [], createdAt: new Date(), updatedAt: new Date() });
  const { redis } = require('../src/config/redis');
  const sent = [];
  const spy = jest.spyOn(redis, 'publish').mockImplementation(async (ch, msg) => { sent.push([ch, JSON.parse(msg)]); return 1; });
  const r = await request(app).post('/api/shops/me/location').set('Authorization', `Bearer ${sign({ sub: String(s._id), role: 'shop' })}`).send({ lat: NEAR[1], lng: NEAR[0] });
  spy.mockRestore();
  expect(r.status).toBe(204);
  const ping = sent.find(([ch, m]) => ch === 'order:event' && m.event === 'worker.location');
  expect(ping[1]).toMatchObject({ orderId: String(b.insertedId), payload: { lat: NEAR[1], lng: NEAR[0] } });
});
