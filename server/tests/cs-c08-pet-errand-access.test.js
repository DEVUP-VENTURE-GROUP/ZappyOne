// Customer module 8, pet care and errands: a helper or pet pro outside the job changes nothing on it (status, items, advance, proof, handover, complete, cash), and a customer can only book their own pets.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
let app; let HelpingTask; let PetBooking; let Worker; let tok;
let n = 0;
const oid = () => new mongoose.Types.ObjectId();
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.9.${Math.floor(n / 250)}.${(n++) % 250}` });
});
afterAll(stopMongo);

const pro = () => { n += 1; return Worker.create({ name: `Helper ${n}`, phone: `79${String(n).padStart(8, '0')}`, kyc: { status: 'approved' } }); };

async function errand(status = 'IN_PROGRESS') {
  const holder = await pro();
  const itemId = oid();
  const { insertedId } = await HelpingTask.collection.insertOne({
    reference: `HT${n}${Math.random().toString(36).slice(2, 6)}`, userId: oid(), workerId: holder._id, status, serviceType: 'shopping',
    items: [{ _id: itemId, name: 'Milk', quantity: 1, status: 'pending', estimatedPricePaise: 6000 }],
    charge: { serviceChargePaise: 9900, totalPaise: 9900 }, statusHistory: [{ status, at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
  });
  return { id: String(insertedId), itemId: String(itemId), holder };
}

describe('errands: a helper outside the job changes nothing', () => {
  const ACTIONS = [
    ['move the status', 'post', (t) => `/api/helping/tasks/${t.id}/status`, { status: 'RETURNING' }],
    ['change an item', 'patch', (t) => `/api/helping/tasks/${t.id}/items/${t.itemId}`, { status: 'bought', actualPricePaise: 1 }],
    ['offer an alternative', 'post', (t) => `/api/helping/tasks/${t.id}/items/${t.itemId}/alternative`, { name: 'Cheaper milk', pricePaise: 100 }],
    ['ask for an advance', 'post', (t) => `/api/helping/tasks/${t.id}/advance`, { amountPaise: 500000 }],
    ['add proof', 'post', (t) => `/api/helping/tasks/${t.id}/proof`, { stage: 'handover', photos: ['helping/handover/u/x.jpg'] }],
    ['hand over', 'post', (t) => `/api/helping/tasks/${t.id}/handover`, { code: '1234' }],
    ['complete', 'post', (t) => `/api/helping/tasks/${t.id}/complete`, { code: '1234' }],
    ['mark cash collected', 'post', (t) => `/api/helping/tasks/${t.id}/collect-cash`, {}],
  ];
  test.each(ACTIONS)('%s', async (_name, method, path, body) => {
    const t = await errand();
    const outsider = await pro();
    const r = await request(app)[method](path(t)).set(tok(outsider._id, 'worker')).send(body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const after = await HelpingTask.findById(t.id).lean();
    expect(after.status).toBe('IN_PROGRESS');
    expect(after.items[0].status).toBe('pending');
    expect(String(after.workerId)).toBe(String(t.holder._id));
    expect(after.paymentStatus || 'pending').not.toBe('paid');
  });
  test('a customer cannot use a helper\'s actions', async () => {
    const t = await errand();
    const r = await request(app).post(`/api/helping/tasks/${t.id}/collect-cash`).set(tok(oid(), 'user')).send({});
    expect(r.status).toBe(403);
  });
});

describe('pet care: a pro outside the booking changes nothing', () => {
  async function petJob(status = 'PROVIDER_ACCEPTED') {
    const holder = await pro();
    const { insertedId } = await PetBooking.collection.insertOne({
      reference: `PB${n}${Math.random().toString(36).slice(2, 6)}`, userId: oid(), workerId: holder._id, status, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pricing: { totalPaise: 79900, providerAmountPaise: 70000 }, handoverOtp: '4321', statusHistory: [{ status, at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
    });
    return { id: String(insertedId), holder };
  }
  test.each([
    ['move the status', 'post', (id) => `/api/pet/bookings/${id}/status`, { status: 'PROVIDER_EN_ROUTE' }],
    ['decline it away from the holder', 'post', (id) => `/api/pet/bookings/${id}/decline`, { reason: 'busy' }],
    ['mark cash collected', 'post', (id) => `/api/pet/bookings/${id}/collect-cash`, {}],
  ])('%s', async (_name, method, path, body) => {
    const j = await petJob();
    const outsider = await pro();
    const r = await request(app)[method](path(j.id)).set(tok(outsider._id, 'worker')).send(body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const after = await PetBooking.findById(j.id).lean();
    expect(after.status).toBe('PROVIDER_ACCEPTED');
    expect(String(after.workerId)).toBe(String(j.holder._id));
  });
  test('another customer cannot read the booking or its handover code', async () => {
    const j = await petJob();
    const r = await request(app).get(`/api/pet/bookings/${j.id}`).set(tok(oid(), 'user'));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).not.toMatch(/4321/);
  });
});

describe('pet care: a customer books only their own pets', () => {
  test('a booking with someone else\'s pet is refused before anything is written', async () => {
    const PetPassport = require('../src/modules/service/pet-passport.model');
    const other = oid();
    const pet = await PetPassport.collection.insertOne({ userId: other, name: 'Not yours', species: 'dog', size: 'medium', isArchived: false, createdAt: new Date() });
    const me = oid();
    const r = await request(app).post('/api/pet/bookings').set(tok(me, 'user')).send({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep', pets: [{ petId: String(pet.insertedId), variantCode: 'pg_full_grooming' }],
      serviceLocation: { coordinates: [78.39, 17.44], address: 'Plot 4, Madhapur' },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(await PetBooking.countDocuments({ userId: me })).toBe(0);
  });
});
