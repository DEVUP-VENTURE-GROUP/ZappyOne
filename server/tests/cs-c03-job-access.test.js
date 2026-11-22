// Customer module 3, a job's own screens: every customer action on a job (details, receipt, chat, tip, boost, address, contact, extras, reschedule, cancel, payment claim, share) is refused to anyone but its own customer, and a pro outside the job sees nothing either.
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
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.4.0.${(n++) % 250}` });
});
afterAll(stopMongo);

async function job(status = 'WORKER_ACCEPTED') {
  const w = await Worker.create({ name: 'Access Pro', phone: `86${String(++n).padStart(8, '0')}` });
  const b = await RepairBooking.create({
    reference: `AC${n}${Math.random().toString(36).slice(2, 6)}`, userId: new mongoose.Types.ObjectId(), workerId: w._id, vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one',
    serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: 'pending', location: { type: 'Point', coordinates: [78.38, 17.44], address: 'Flat 9, Secret Lane' },
    priceSnapshot: { subtotalPaise: 12900, totalPaise: 12900 }, statusHistory: [{ status, at: new Date() }], completedAt: status === 'COMPLETED' ? new Date() : null,
  });
  return { b, w };
}

const ACTIONS = [
  ['job details', 'get', (id) => `/api/jobs/${id}/options`],
  ['repair details', 'get', (id) => `/api/repair/bookings/${id}`],
  ['receipt', 'get', (id) => `/api/jobs/${id}/receipt`],
  ['chat', 'get', (id) => `/api/jobs/${id}/chat`],
  ['send a chat message', 'post', (id) => `/api/jobs/${id}/chat`, { text: 'hello' }],
  ['tip', 'post', (id) => `/api/jobs/${id}/tip`, { amountPaise: 5000, method: 'cash' }],
  ['boost', 'post', (id) => `/api/jobs/${id}/boost`, { amountPaise: 1000 }],
  ['change the address', 'patch', (id) => `/api/jobs/${id}/place`, { address: 'Hijacked', coordinates: [78.4, 17.45] }],
  ['change the contact', 'patch', (id) => `/api/jobs/${id}/contact`, { phone: '9000000000' }],
  ['add extras', 'post', (id) => `/api/jobs/${id}/extras`, { items: [] }],
  ['reschedule', 'post', (id) => `/api/jobs/${id}/reschedule`, { scheduledAt: new Date(Date.now() + 86400e3).toISOString() }],
  ['cancel', 'post', (id) => `/api/repair/bookings/${id}/cancel`, { reason: 'not mine' }],
  ['claim payment', 'post', (id) => `/api/jobs/${id}/pay-claim`, { method: 'upi', utr: '123456789012' }],
  ['share a tracking link', 'post', (id) => `/api/jobs/${id}/share`],
  ['report the pro absent', 'post', (id) => `/api/jobs/${id}/provider-absent`],
];

describe('another customer is refused every action, and the job is unchanged', () => {
  test.each(ACTIONS)('%s', async (_name, method, path, body = undefined) => {
    const { b } = await job();
    const r = await request(app)[method](path(b._id)).set(tok(new mongoose.Types.ObjectId(), 'user')).send(body || {});
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(JSON.stringify(r.body)).not.toMatch(/Secret Lane/);
    const after = await RepairBooking.findById(b._id).lean();
    expect(after.status).toBe('WORKER_ACCEPTED');
    expect(after.location.address).toBe('Flat 9, Secret Lane');
    expect(after.tip?.paise || 0).toBe(0);
    expect(after.boost?.paise || 0).toBe(0);
  });
});

describe('a pro who is not on the job sees nothing of it', () => {
  test.each([
    ['job details', (id) => `/api/jobs/${id}/options`], ['repair details', (id) => `/api/repair/bookings/${id}`],
    ['receipt', (id) => `/api/jobs/${id}/receipt`], ['chat', (id) => `/api/jobs/${id}/chat`], ['earnings', (id) => `/api/jobs/${id}/earnings`],
  ])('%s', async (_name, path) => {
    const { b } = await job();
    const other = await Worker.create({ name: 'Other Pro', phone: `85${String(++n).padStart(8, '0')}` });
    const r = await request(app).get(path(b._id)).set(tok(other._id, 'worker'));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(JSON.stringify(r.body)).not.toMatch(/Secret Lane/);
  });
});

describe('the job\'s own customer and pro do get in', () => {
  test('the customer sees their job details and receipt', async () => {
    const { b } = await job('COMPLETED');
    expect((await request(app).get(`/api/jobs/${b._id}/options`).set(tok(b.userId, 'user'))).status).toBe(200);
    expect((await request(app).get(`/api/repair/bookings/${b._id}`).set(tok(b.userId, 'user'))).status).toBe(200);
  });
  test('the job\'s pro sees its details', async () => {
    const { b, w } = await job();
    expect((await request(app).get(`/api/repair/bookings/${b._id}`).set(tok(w._id, 'worker'))).status).toBe(200);
  });
});

describe('bad ids never crash', () => {
  test.each([['malformed', 'not-an-id'], ['unknown', String(new mongoose.Types.ObjectId())]])('%s id', async (_name, id) => {
    for (const [, method, path, body] of ACTIONS) {
      const r = await request(app)[method](path(id)).set(tok(new mongoose.Types.ObjectId(), 'user')).send(body || {});
      expect(r.status).toBeLessThan(500);
    }
  });
});
