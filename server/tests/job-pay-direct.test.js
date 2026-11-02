// Jobs are paid to the pro directly: the customer sees whom, how much and the pro's UPI ID once the work is done; "I've paid" tells the pro; nothing online.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let app; let sign; let PetBooking; let Worker;
const owner = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
});
afterAll(stopMongo);

const auth = (id) => ({ Authorization: `Bearer ${sign({ sub: String(id), role: 'user' })}` });
let n = 0;
async function worker(upiIds = []) {
  n += 1;
  const { insertedId } = await Worker.collection.insertOne({ name: 'Ravi Kumar', phone: `98111000${String(n).padStart(2, '0')}`, savedUpiIds: upiIds, createdAt: new Date() });
  return insertedId;
}
async function booking(workerId, status = 'SERVICE_COMPLETED', extra = {}) {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `PB-${Math.random().toString(36).slice(2, 10)}`, userId: owner, workerId, status, serviceMode: 'home_visit', categoryCode: 'pet_grooming',
    paymentMethod: 'cash', paymentStatus: 'unpaid', pets: [], pricing: { subtotalPaise: 60000, totalPaise: 60000 },
    serviceLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2' }, statusHistory: [], createdAt: new Date(), ...extra,
  });
  return String(insertedId);
}

test('done job: the pro, the amount and their UPI ID; "I paid by UPI" is saved and never marks it paid', async () => {
  const w = await worker([{ upiId: 'old@okaxis' }, { upiId: 'ravi.k@okhdfcbank', isDefault: true }]);
  const id = await booking(w);
  const o = await request(app).get(`/api/jobs/${id}/options`).set(auth(owner));
  expect(o.body.payTo).toMatchObject({ amountPaise: 60000, to: { name: 'Ravi', upiId: 'ravi.k@okhdfcbank' }, methods: ['upi', 'cash'], claim: null });

  const r = await request(app).post(`/api/jobs/${id}/pay-claim`).set(auth(owner)).send({ method: 'upi' });
  expect(r.status).toBe(200);
  const b = await PetBooking.findById(id).lean();
  expect(b.payClaim).toMatchObject({ method: 'upi', amountPaise: 60000 });
  expect(b.paymentStatus).toBe('unpaid');
  expect((await request(app).get(`/api/jobs/${id}/options`).set(auth(owner))).body.payTo.claim.method).toBe('upi');
});

test('no UPI ID on file: cash only; not due yet, paid, or someone else: refused', async () => {
  const noUpi = await worker([{ upiId: 'not a upi id' }]);
  const id = await booking(noUpi);
  expect((await request(app).get(`/api/jobs/${id}/options`).set(auth(owner))).body.payTo.methods).toEqual(['cash']);
  expect((await request(app).post(`/api/jobs/${id}/pay-claim`).set(auth(owner)).send({ method: 'upi' })).body.code).toBe('BAD_METHOD');
  expect((await request(app).post(`/api/jobs/${id}/pay-claim`).set(auth(new mongoose.Types.ObjectId())).send({ method: 'cash' })).status).toBe(404);

  const w = await worker([{ upiId: 'a@okaxis' }]);
  const early = await booking(w, 'SERVICE_STARTED');
  expect((await request(app).get(`/api/jobs/${early}/options`).set(auth(owner))).body.payTo).toBeNull();
  expect((await request(app).post(`/api/jobs/${early}/pay-claim`).set(auth(owner)).send({ method: 'cash' })).body.code).toBe('NOT_DUE');
  const paid = await booking(w, 'SERVICE_COMPLETED', { paymentStatus: 'paid' });
  expect((await request(app).get(`/api/jobs/${paid}/options`).set(auth(owner))).body.payTo).toBeNull();
});

test('nothing is offered or taken online for a job', async () => {
  expect((await request(app).get('/api/payments/availability')).body.online).toBe(false);
  expect(() => require('../src/modules/payment/payables').assertOnlineAvailable('online')).toThrow(expect.objectContaining({ code: 'ONLINE_PAYMENTS_DISABLED' }));
  expect(() => require('../src/modules/payment/payables').assertOnlineAvailable('cash')).not.toThrow();
});
