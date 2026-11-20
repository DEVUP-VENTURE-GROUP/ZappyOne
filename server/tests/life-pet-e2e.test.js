// A pet visit's whole life over the real API: on the way, arrived, the owner's code to start, done, paid, both rate; and the edges (wrong code, wrong person, skipped steps, double taps, handing back too late).
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app; let PetBooking; let Worker; let User; let tok;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  User = require('../src/modules/user/user.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

let n = 0;
async function visit(status = 'PROVIDER_ACCEPTED') {
  n += 1;
  const u = await User.create({ name: 'Meera', phone: `93300${String(n).padStart(5, '0')}`, startPin: '7314' });
  const w = await Worker.create({ name: 'Sameer', phone: `94400${String(n).padStart(5, '0')}`, isOnline: true });
  const b = await PetBooking.create({
    reference: `LP${n}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, userId: u._id, workerId: w._id, categoryCode: 'pet_walk',
    status, serviceMode: 'doorstep', paymentMethod: 'cash', pricing: { totalPaise: 30000, commissionPaise: 3000 }, pets: [],
    serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
  });
  return { b, pro: tok(w._id, 'worker'), customer: tok(u._id, 'user') };
}
const move = (id, status, auth, code) => request(app).post(`/api/pet/bookings/${id}/status`).set(auth).send({ status, ...(code && { code }) });
const statusOf = async (id) => (await PetBooking.findById(id).lean()).status;

describe('happy path: accepted to rated', () => {
  test('on the way, arrived, the owner\'s code starts it, done, cash, both rate', async () => {
    const { b, pro, customer } = await visit();
    expect((await move(b._id, 'PROVIDER_EN_ROUTE', pro)).status).toBe(200);
    expect((await move(b._id, 'PROVIDER_ARRIVED', pro)).status).toBe(200);
    expect((await move(b._id, 'SERVICE_STARTED', pro)).body.code).toBe('START_CODE_REQUIRED');
    expect((await move(b._id, 'SERVICE_STARTED', pro, '0000')).status).toBe(401);
    expect(await statusOf(b._id)).toBe('PROVIDER_ARRIVED');
    expect((await move(b._id, 'SERVICE_STARTED', pro, '7314')).status).toBe(200);
    expect((await move(b._id, 'SERVICE_COMPLETED', pro)).status).toBe(200);

    expect((await request(app).get(`/api/jobs/${b._id}/options`).set(customer)).body.liveActivity).toMatchObject({ stage: 'payment' });
    expect((await request(app).post(`/api/pet/bookings/${b._id}/collect-cash`).set(pro)).status).toBe(200);
    expect(['PAYMENT_COMPLETED', 'CLOSED']).toContain(await statusOf(b._id));

    expect((await request(app).post(`/api/pet/bookings/${b._id}/rate`).set(customer).send({ rating: 5 })).status).toBe(200);
    expect((await request(app).post(`/api/pet/bookings/${b._id}/rate`).set(customer).send({ rating: 1 })).status).toBe(409);
    expect((await request(app).post(`/api/jobs/${b._id}/rate-customer`).set(pro).send({ stars: 5 })).status).toBe(200);
  });
});

describe('edges', () => {
  test('a skipped step is a plain 409 and nothing moves', async () => {
    const { b, pro } = await visit();
    const res = await move(b._id, 'SERVICE_COMPLETED', pro);
    expect(res.status).toBe(409);
    expect(await statusOf(b._id)).toBe('PROVIDER_ACCEPTED');
  });

  test('only the provider on the visit can move it; the owner cannot', async () => {
    const { b, customer } = await visit();
    expect((await move(b._id, 'PROVIDER_EN_ROUTE', tok(new mongoose.Types.ObjectId(), 'worker'))).status).toBe(403);
    expect((await move(b._id, 'PROVIDER_EN_ROUTE', customer)).status).toBe(403);
    expect(await statusOf(b._id)).toBe('PROVIDER_ACCEPTED');
  });

  test('two taps at once on the same step: it moves once', async () => {
    const { b, pro } = await visit();
    const [x, y] = await Promise.all([move(b._id, 'PROVIDER_EN_ROUTE', pro), move(b._id, 'PROVIDER_EN_ROUTE', pro)]);
    expect([x.status, y.status]).toContain(200);
    expect([x.status, y.status].every((s) => s < 500)).toBe(true);
    const doc = await PetBooking.findById(b._id).lean();
    expect((doc.timeline || doc.statusHistory || []).filter((h) => h.status === 'PROVIDER_EN_ROUTE')).toHaveLength(1);
  });

  test('a visit under way cannot be handed back', async () => {
    const { b, pro } = await visit('SERVICE_STARTED');
    expect((await request(app).post(`/api/jobs/${b._id}/give-back`).set(pro).send({ reason: 'other', note: 'family emergency' })).status).toBe(409);
    expect(await statusOf(b._id)).toBe('SERVICE_STARTED');
  });
});
