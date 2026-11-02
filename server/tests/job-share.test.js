// "Booked for someone else?": a private link shows the person at the door the live job without money, and only the owner can make one.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let sign; let PetBooking;
const owner = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
});
afterAll(stopMongo);

const auth = (id) => ({ Authorization: `Bearer ${sign({ sub: String(id), role: 'user' })}` });

async function booking(status = 'PROVIDER_ASSIGNED') {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `PB-${Math.random().toString(36).slice(2, 10)}`, userId: owner, status, categoryCode: 'pet_grooming', serviceMode: 'home_visit', handoverOtp: '4821',
    pricing: { totalPaise: 79900, platformFeePaise: 2000 }, contactPhone: '9999999999',
    address: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2, Road 5' }, statusHistory: [], createdAt: new Date(),
  });
  return String(insertedId);
}

test('owner shares; the link shows the job without money or the owner contact', async () => {
  const id = await booking();
  const made = await request(app).post(`/api/jobs/${id}/share`).set(auth(owner));
  expect(made.status).toBe(201);
  expect(made.body.url).toMatch(/\/t\/[A-Za-z0-9_-]{20,}$/);
  const again = await request(app).post(`/api/jobs/${id}/share`).set(auth(owner));
  expect(again.body.url).toBe(made.body.url);

  const token = made.body.url.split('/t/')[1];
  const seen = await request(app).get(`/api/jobs/shared/${token}`);
  expect(seen.status).toBe(200);
  expect(seen.body.kind).toBe('pet');
  expect(seen.body.data.booking.status).toBe('PROVIDER_ASSIGNED');
  expect(seen.body.data.booking.handoverOtp).toBe('4821');
  expect(seen.body.data.booking.pricing).toBeUndefined();
  expect(seen.body.data.booking.contactPhone).toBeUndefined();
  expect(seen.body.data.booking.userId).toBeUndefined();
  expect(JSON.stringify(seen.body)).not.toMatch(/79900|9999999999/);
});

test('only the owner can share, never a finished job; a turned-off or unknown link is gone', async () => {
  const id = await booking();
  expect((await request(app).post(`/api/jobs/${id}/share`).set(auth(stranger))).status).toBe(403);
  const done = await booking('CLOSED');
  expect((await request(app).post(`/api/jobs/${done}/share`).set(auth(owner))).status).toBe(409);

  const made = await request(app).post(`/api/jobs/${id}/share`).set(auth(owner));
  const token = made.body.url.split('/t/')[1];
  expect((await request(app).delete(`/api/jobs/${id}/share`).set(auth(owner))).status).toBe(200);
  expect((await request(app).get(`/api/jobs/shared/${token}`)).status).toBe(404);
  expect((await request(app).get('/api/jobs/shared/not-a-real-token-at-all')).status).toBe(404);
});
