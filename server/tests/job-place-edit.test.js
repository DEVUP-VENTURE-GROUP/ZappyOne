// Fixing the address after booking: owner only, before the pro sets off, a short move only; the change is saved.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let sign; let PetBooking;
const owner = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
});
afterAll(stopMongo);

const auth = (id) => ({ Authorization: `Bearer ${sign({ sub: String(id), role: 'user' })}` });
async function booking(status = 'PROVIDER_ASSIGNED', serviceMode = 'home_visit') {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `PB-${Math.random().toString(36).slice(2, 10)}`, userId: owner, status, serviceMode, categoryCode: 'pet_grooming',
    serviceLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2, Road 5' }, statusHistory: [], createdAt: new Date(),
  });
  return String(insertedId);
}

test('a short move and a new address are saved; options say it can be edited', async () => {
  const id = await booking();
  const opts = await request(app).get(`/api/jobs/${id}/options`).set(auth(owner));
  expect(opts.body.place).toMatchObject({ allowed: true, maxMoveM: 500 });
  const r = await request(app).patch(`/api/jobs/${id}/place`).set(auth(owner)).send({ lat: 17.3810, lng: 78.4805, address: 'Flat 2B, Road 5' });
  expect(r.status).toBe(200);
  const saved = await PetBooking.findById(id).lean();
  expect(saved.serviceLocation.coordinates).toEqual([78.4805, 17.381]);
  expect(saved.serviceLocation.address).toBe('Flat 2B, Road 5');
});

test('refused: too far, someone else, on the way, or a visit to the pro', async () => {
  const id = await booking();
  expect((await request(app).patch(`/api/jobs/${id}/place`).set(auth(owner)).send({ lat: 17.40, lng: 78.48 })).body.code).toBe('TOO_FAR');
  expect((await request(app).patch(`/api/jobs/${id}/place`).set(auth(new mongoose.Types.ObjectId())).send({ address: 'x' })).status).toBe(403);
  const moving = await booking('PROVIDER_EN_ROUTE');
  expect((await request(app).patch(`/api/jobs/${moving}/place`).set(auth(owner)).send({ address: 'x' })).status).toBe(409);
  const atPro = await booking('PROVIDER_ASSIGNED', 'provider_location');
  expect((await request(app).patch(`/api/jobs/${atPro}/place`).set(auth(owner)).send({ address: 'x' })).status).toBe(409);
});
