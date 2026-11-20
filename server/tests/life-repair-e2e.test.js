// A repair or service job's whole life over the real API, as the customer and the pro: on the way, start code, work, photos, payment, completion, ratings; and the edges that break at scale (double taps, wrong person, skipped steps, paying twice).
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');

jest.setTimeout(120000);
let app; let RepairBooking; let Worker; let tok;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

let n = 0;
async function job(status = 'WORKER_ACCEPTED', extra = {}) {
  n += 1;
  const w = await Worker.create({ name: 'Ravi Kumar', phone: `90000${String(n).padStart(5, '0')}`, savedUpiIds: [{ upiId: 'ravi@okaxis', isDefault: true }] });
  const b = await RepairBooking.create({
    reference: `LR${n}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, userId: new mongoose.Types.ObjectId(), workerId: w._id,
    vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one', serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: 'pending',
    location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Narsingi' }, priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 },
    statusHistory: [{ status, at: new Date() }], ...extra,
  });
  return { b, w, pro: tok(w._id, 'worker'), customer: tok(b.userId, 'user') };
}
const move = (id, status, auth) => request(app).post(`/api/repair/bookings/${id}/status`).set(auth).send({ status });
const statusOf = async (id) => (await RepairBooking.findById(id).lean()).status;

describe('happy path: booked to rated', () => {
  test('on the way, arrive, start with the code, work, photos, customer pays, complete, both rate', async () => {
    const { b, pro, customer } = await job();
    expect((await move(b._id, 'ON_THE_WAY', pro)).status).toBe(200);
    expect((await move(b._id, 'ARRIVED', pro)).status).toBe(200);
    await passHandoverGates(b._id);
    expect((await move(b._id, 'REPAIR_IN_PROGRESS', pro)).status).toBe(200);
    expect((await move(b._id, 'QA_PENDING', pro)).status).toBe(200);

    // Money is due now: the customer sees whom to pay and how much.
    const opts = await request(app).get(`/api/jobs/${b._id}/options`).set(customer);
    expect(opts.status).toBe(200);
    expect(opts.body.payTo).toMatchObject({ amountPaise: 12900, to: { upiId: 'ravi@okaxis' } });
    expect(opts.body.liveActivity).toMatchObject({ stage: 'payment' });
    const claim = await request(app).post(`/api/jobs/${b._id}/pay-claim`).set(customer).send({ method: 'upi', utr: '123456789012' });
    expect(claim.status).toBe(200);

    // Money first: not marked received, the pro cannot finish.
    const unpaid = await move(b._id, 'COMPLETED', pro);
    expect(unpaid.status).toBe(409);
    expect(unpaid.body.code).toBe('CASH_NOT_COLLECTED');
    expect((await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro)).status).toBe(200);

    // Then the photo: paid but no photo of the finished work, still cannot finish.
    const noPhoto = await move(b._id, 'COMPLETED', pro);
    expect(noPhoto.status).toBe(409);
    expect(noPhoto.body.code).toBe('PHOTO_REQUIRED');
    expect((await request(app).post(`/api/repair/bookings/${b._id}/completion-photos`).set(pro).send({ photos: ['order-proof/after.jpg'] })).status).toBe(200);
    expect((await move(b._id, 'COMPLETED', pro)).status).toBe(200);
    expect(await statusOf(b._id)).toBe('COMPLETED');

    expect((await request(app).post(`/api/repair/bookings/${b._id}/rate`).set(customer).send({ rating: 5, comment: 'Quick and clean' })).status).toBe(200);
    expect((await request(app).post(`/api/repair/bookings/${b._id}/rate`).set(customer).send({ rating: 1 })).status).toBeGreaterThanOrEqual(400);

    const pending = await request(app).get('/api/jobs/rate-customer/pending').set(pro);
    expect(pending.body.pending).toMatchObject({ id: String(b._id) });
    expect((await request(app).post(`/api/jobs/${b._id}/rate-customer`).set(pro).send({ stars: 5 })).status).toBe(200);
    expect((await request(app).get('/api/jobs/rate-customer/pending').set(pro)).body.pending).toBeNull();
  });
});

describe('edges', () => {
  test('a step cannot be skipped, and the answer is a plain 409, never a crash', async () => {
    const { b, pro } = await job();
    const res = await move(b._id, 'COMPLETED', pro);
    expect(res.status).toBe(409);
    expect(res.body.error).not.toMatch(/WORKER_ACCEPTED|COMPLETED|Cannot move/);
    expect(await statusOf(b._id)).toBe('WORKER_ACCEPTED');
  });

  test('only the pro on the job can move it; the customer cannot move it at all', async () => {
    const { b, customer } = await job();
    const stranger = tok(new mongoose.Types.ObjectId(), 'worker');
    expect((await move(b._id, 'ON_THE_WAY', stranger)).status).toBe(403);
    expect((await move(b._id, 'ON_THE_WAY', customer)).status).toBe(403);
    expect(await statusOf(b._id)).toBe('WORKER_ACCEPTED');
  });

  test('work cannot start before the customer gives the start code', async () => {
    const { b, pro } = await job('ARRIVED');
    expect((await move(b._id, 'REPAIR_IN_PROGRESS', pro)).status).toBe(409);
  });

  test('two taps on Complete at once: one completes, the other is told it is done, the job completes once', async () => {
    const { b, pro } = await job('QA_PENDING', { completionPhotos: ['order-proof/after.jpg'], paymentStatus: 'paid', cashCollectedAt: new Date() });
    const [a, c] = await Promise.all([move(b._id, 'COMPLETED', pro), move(b._id, 'COMPLETED', pro)]);
    expect([a.status, c.status].sort()).toEqual([200, 409]);
    const done = await RepairBooking.findById(b._id).lean();
    expect(done.statusHistory.filter((h) => h.status === 'COMPLETED')).toHaveLength(1);
  });

  test('"Received" twice records the money once', async () => {
    const { b, pro } = await job('QA_PENDING');
    const first = await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro);
    const again = await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro);
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body.alreadyPaid).toBe(true);
  });

  test('paying is not offered before the work is done, and a paid job offers nothing more', async () => {
    const { b, customer, pro } = await job('ON_THE_WAY');
    expect((await request(app).get(`/api/jobs/${b._id}/options`).set(customer)).body.payTo).toBeNull();
    expect((await request(app).post(`/api/jobs/${b._id}/pay-claim`).set(customer).send({ method: 'cash' })).status).toBe(409);
    await RepairBooking.updateOne({ _id: b._id }, { $set: { status: 'QA_PENDING' } });
    await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(pro);
    expect((await request(app).get(`/api/jobs/${b._id}/options`).set(customer)).body.payTo).toBeNull();
  });

  test('a UPI claim needs the 12-digit reference, and one reference pays one job only', async () => {
    const one = await job('QA_PENDING');
    const two = await job('QA_PENDING');
    expect((await request(app).post(`/api/jobs/${one.b._id}/pay-claim`).set(one.customer).send({ method: 'upi', utr: '12' })).status).toBe(400);
    expect((await request(app).post(`/api/jobs/${one.b._id}/pay-claim`).set(one.customer).send({ method: 'upi', utr: '555566667777' })).status).toBe(200);
    await RepairBooking.updateOne({ _id: two.b._id }, { $set: { userId: one.b.userId } });
    expect((await request(app).post(`/api/jobs/${two.b._id}/pay-claim`).set(one.customer).send({ method: 'upi', utr: '555566667777' })).status).toBe(409);
  });

  test('another customer cannot see the job, claim payment or rate it', async () => {
    const { b } = await job('QA_PENDING');
    const other = tok(new mongoose.Types.ObjectId(), 'user');
    expect((await request(app).post(`/api/jobs/${b._id}/pay-claim`).set(other).send({ method: 'cash' })).status).toBe(404);
    expect((await request(app).post(`/api/repair/bookings/${b._id}/rate`).set(other).send({ rating: 1 })).status).toBeGreaterThanOrEqual(400);
  });

  test('a job cannot be handed back once work has started', async () => {
    const { b, pro } = await job('REPAIR_IN_PROGRESS');
    const res = await request(app).post(`/api/jobs/${b._id}/give-back`).set(pro).send({ reason: 'other', note: 'family emergency' });
    expect(res.status).toBe(409);
    expect(await statusOf(b._id)).toBe('REPAIR_IN_PROGRESS');
  });
});
