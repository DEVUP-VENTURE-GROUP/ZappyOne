// Customer module 4, paying the pro: "I paid" is a claim the pro confirms, only when money is due, only by the job's own customer, with a real 12-digit UPI reference that pays one job only.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
let app; let RepairBooking; let Worker; let tok;
let n = 0;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.3.${Math.floor(n / 250)}.${(n++) % 250}` });
});
afterAll(stopMongo);

async function job(status = 'QA_PENDING', { upi = true, extra = {} } = {}) {
  n += 1;
  const w = await Worker.create({ name: 'Pay Pro', phone: `84${String(n).padStart(8, '0')}`, savedUpiIds: upi ? [{ upiId: 'paypro@okaxis', isDefault: true }] : [] });
  const b = await RepairBooking.create({
    reference: `PY${n}${Math.random().toString(36).slice(2, 6)}`, userId: new mongoose.Types.ObjectId(), workerId: w._id, vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one',
    serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: 'pending', location: { type: 'Point', coordinates: [78.38, 17.44], address: 'X' },
    priceSnapshot: { subtotalPaise: 49900, totalPaise: 49900 }, statusHistory: [{ status, at: new Date() }], ...extra,
  });
  return { b, w };
}
const claim = (b, body, who) => request(app).post(`/api/jobs/${b._id}/pay-claim`).set(who || tok(b.userId, 'user')).send(body);
// A reference dated today in the YDDD form UPI apps use, so it reads as a real one.
function todayRef(tail = '12345678') {
  const ist = new Date(Date.now() + 330 * 60000);
  const start = Date.UTC(ist.getUTCFullYear(), 0, 0);
  const doy = Math.floor((ist.getTime() - start) / 86400000);
  return `${String(ist.getUTCFullYear()).slice(-1)}${String(doy).padStart(3, '0')}${tail}`;
}

describe('when there is something to pay', () => {
  test.each(['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS'])('nothing is due while the job is %s', async (status) => {
    const { b } = await job(status);
    expect((await claim(b, { method: 'cash' })).body.code).toBe('NOT_DUE');
  });
  test('the pay screen shows the amount and the pro\'s UPI ID once the work is done', async () => {
    const { b } = await job('QA_PENDING');
    const r = await request(app).get(`/api/jobs/${b._id}/options`).set(tok(b.userId, 'user'));
    expect(r.body.payTo).toMatchObject({ amountPaise: 49900, to: { upiId: 'paypro@okaxis' }, methods: ['upi', 'cash'] });
  });
  test('a paid job asks for nothing more', async () => {
    const { b } = await job('QA_PENDING', { extra: { paymentStatus: 'paid', cashCollectedAt: new Date() } });
    expect((await claim(b, { method: 'cash' })).body.code).toBe('NOT_DUE');
  });
});

describe('the claim itself', () => {
  test('cash is recorded and nothing is marked paid until the pro confirms', async () => {
    const { b } = await job();
    const r = await claim(b, { method: 'cash' });
    expect(r.status).toBe(200);
    const d = await RepairBooking.findById(b._id).lean();
    expect(d.payClaim).toMatchObject({ method: 'cash', amountPaise: 49900 });
    expect(d.paymentStatus).toBe('pending');
  });
  test.each([['no reference', ''], ['11 digits', '12345678901'], ['13 digits', '1234567890123'], ['letters', 'ABCDEFGHIJKL']])('UPI with %s is refused', async (_name, utr) => {
    const { b } = await job();
    expect((await claim(b, { method: 'upi', utr })).status).toBe(400);
    expect((await RepairBooking.findById(b._id).lean()).payClaim?.method).toBeUndefined();
  });
  test('a reference with spaces in it is read as its 12 digits', async () => {
    const { b } = await job();
    const ref = todayRef('11112222');
    expect((await claim(b, { method: 'upi', utr: `${ref.slice(0, 4)} ${ref.slice(4, 8)} ${ref.slice(8)}` })).status).toBe(200);
  });
  test('one UPI payment cannot pay two jobs', async () => {
    const a = await job(); const c = await job();
    const ref = todayRef('33334444');
    expect((await claim(a.b, { method: 'upi', utr: ref })).status).toBe(200);
    expect((await claim(c.b, { method: 'upi', utr: ref })).body.code).toBe('UPI_REF_USED');
  });
  test('UPI is refused when the pro has no UPI ID; cash still works', async () => {
    const { b } = await job('QA_PENDING', { upi: false });
    expect((await claim(b, { method: 'upi', utr: todayRef('55556666') })).body.code).toBe('BAD_METHOD');
    expect((await claim(b, { method: 'cash' })).status).toBe(200);
  });
  test.each([['card', { method: 'card' }], ['no method', {}], ['a 21-letter reference', { method: 'upi', utr: '1'.repeat(21) }]])('%s → 400', async (_name, body) => {
    const { b } = await job();
    expect((await claim(b, body)).status).toBe(400);
  });
});

describe('only the job\'s own customer', () => {
  test('another customer gets not found and nothing is written', async () => {
    const { b } = await job();
    expect((await claim(b, { method: 'cash' }, tok(new mongoose.Types.ObjectId(), 'user'))).status).toBe(404);
    expect((await RepairBooking.findById(b._id).lean()).payClaim?.method).toBeUndefined();
  });
  test.each([['the pro', 'worker'], ['a shop', 'shop']])('%s cannot claim the customer paid', async (_name, role) => {
    const { b, w } = await job();
    expect((await claim(b, { method: 'cash' }, tok(w._id, role))).status).toBe(403);
  });
  test.each([['malformed', 'zzz'], ['unknown', String(new mongoose.Types.ObjectId())]])('a %s job id never crashes', async (_name, id) => {
    const r = await request(app).post(`/api/jobs/${id}/pay-claim`).set(tok(new mongoose.Types.ObjectId(), 'user')).send({ method: 'cash' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});

describe('the pro confirms', () => {
  test('after the pro taps Received the job is paid, and the customer cannot claim again', async () => {
    const { b, w } = await job();
    await claim(b, { method: 'cash' });
    expect((await request(app).post(`/api/repair/bookings/${b._id}/collect-cash`).set(tok(w._id, 'worker'))).status).toBe(200);
    expect((await claim(b, { method: 'cash' })).body.code).toBe('NOT_DUE');
  });
  test('10 claims at once record one claim and never crash', async () => {
    const { b } = await job();
    const res = await Promise.all(Array.from({ length: 10 }, () => claim(b, { method: 'cash' })));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect((await RepairBooking.findById(b._id).lean()).payClaim.method).toBe('cash');
  });
});
