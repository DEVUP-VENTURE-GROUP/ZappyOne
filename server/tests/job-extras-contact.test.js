// After booking: add a service (priced from the catalogue, added to the cash bill once) and change who the pro meets.
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
  const { PetPricingRule } = require('../src/modules/pet/models/config.model');
  const { PetServiceAddon } = require('../src/modules/pet/models/catalog.model');
  await PetPricingRule.collection.insertOne({ categoryCode: 'pet_grooming', variantCode: null, species: null, cityCode: null, isActive: true, commissionPct: 10, taxPct: 0, sizeMultipliers: { large: 1.5 } });
  await PetServiceAddon.collection.insertOne({ code: 'nail_trim', name: 'Nail trim', categoryCodes: ['pet_grooming'], variantCodes: [], species: ['dog', 'cat'], pricePaise: 10000, scalesWithSize: true, isActive: true });
});
afterAll(stopMongo);

const auth = (id) => ({ Authorization: `Bearer ${sign({ sub: String(id), role: 'user' })}` });
async function booking(status = 'PROVIDER_ACCEPTED', paymentMethod = 'cash') {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `PB-${Math.random().toString(36).slice(2, 10)}`, userId: owner, status, serviceMode: 'home_visit', categoryCode: 'pet_grooming', paymentMethod,
    pets: [{ petId: new mongoose.Types.ObjectId(), snapshot: { name: 'Bruno', species: 'dog', size: 'large' }, variantCode: 'full', addonCodes: [], addonsPaise: 0, linePaise: 50000, status: 'pending' }],
    pricing: { subtotalPaise: 50000, totalPaise: 50000, addonsPaise: 0, commissionPaise: 5000, commissionBasePaise: 50000, providerAmountPaise: 45000 },
    serviceLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2' }, statusHistory: [], createdAt: new Date(),
  });
  return String(insertedId);
}

test('options list the add-on at the size price; adding it raises the cash bill once', async () => {
  const id = await booking();
  const opts = await request(app).get(`/api/jobs/${id}/options`).set(auth(owner));
  expect(opts.body.extras).toMatchObject({ allowed: true, payBy: 'cash' });
  expect(opts.body.extras.items).toEqual([expect.objectContaining({ code: 'nail_trim', pricePaise: 15000, petIndex: 0, petName: 'Bruno' })]);

  const r = await request(app).post(`/api/jobs/${id}/extras`).set(auth(owner)).send({ code: 'nail_trim', petIndex: 0 });
  expect(r.status).toBe(200);
  const b = await PetBooking.findById(id).lean();
  expect(b.pricing).toMatchObject({ totalPaise: 65000, subtotalPaise: 65000, addonsPaise: 15000, commissionPaise: 6500, commissionBasePaise: 65000, providerAmountPaise: 58500 });
  expect(b.pets[0].addonCodes).toEqual(['nail_trim']);
  expect(b.extras).toHaveLength(1);

  expect((await request(app).post(`/api/jobs/${id}/extras`).set(auth(owner)).send({ code: 'nail_trim', petIndex: 0 })).status).toBe(409);
  expect((await PetBooking.findById(id).lean()).pricing.totalPaise).toBe(65000);
  const again = await request(app).get(`/api/jobs/${id}/options`).set(auth(owner));
  expect(again.body.addedExtras).toEqual([expect.objectContaining({ name: 'Nail trim', pricePaise: 15000 })]);
});

test('extras refused: someone else, finished, or paid online', async () => {
  const id = await booking();
  expect((await request(app).post(`/api/jobs/${id}/extras`).set(auth(new mongoose.Types.ObjectId())).send({ code: 'nail_trim' })).status).toBe(404);
  const done = await booking('SERVICE_COMPLETED');
  expect((await request(app).post(`/api/jobs/${done}/extras`).set(auth(owner)).send({ code: 'nail_trim' })).body.code).toBe('NOT_ADDABLE');
  const online = await booking('PROVIDER_ACCEPTED', 'online');
  expect((await request(app).post(`/api/jobs/${online}/extras`).set(auth(owner)).send({ code: 'nail_trim' })).body.code).toBe('NOT_ADDABLE');
});

test('contact person: set, cleared, validated, owner only, not once over', async () => {
  const id = await booking();
  const set = await request(app).patch(`/api/jobs/${id}/contact`).set(auth(owner)).send({ onSite: { name: 'Ravi Kumar', phone: '9876543210' } });
  expect(set.status).toBe(200);
  expect((await PetBooking.findById(id).lean()).onSite).toEqual({ name: 'Ravi Kumar', phone: '9876543210' });
  expect((await request(app).get(`/api/jobs/${id}/options`).set(auth(owner))).body.contact).toMatchObject({ allowed: true, onSite: { name: 'Ravi Kumar' } });

  expect((await request(app).patch(`/api/jobs/${id}/contact`).set(auth(owner)).send({ onSite: { name: 'Ravi', phone: '12345' } })).status).toBe(400);
  expect((await request(app).patch(`/api/jobs/${id}/contact`).set(auth(new mongoose.Types.ObjectId())).send({ onSite: null })).status).toBe(403);

  expect((await request(app).patch(`/api/jobs/${id}/contact`).set(auth(owner)).send({ onSite: null })).status).toBe(200);
  expect((await PetBooking.findById(id).lean()).onSite).toBeUndefined();

  const closed = await booking('CLOSED');
  expect((await request(app).patch(`/api/jobs/${closed}/contact`).set(auth(owner)).send({ onSite: null })).body.code).toBe('NOT_EDITABLE');
});
