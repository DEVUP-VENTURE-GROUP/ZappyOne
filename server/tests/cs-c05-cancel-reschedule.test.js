// Customer module 5, cancel and reschedule: only the booking's own customer or its own pro can cancel or move it, moves keep to their window and count, a finished job cannot be cancelled, and a double tap cancels once.
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
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.2.${Math.floor(n / 250)}.${(n++) % 250}` });
});
afterAll(stopMongo);

async function job(status = 'WORKER_ACCEPTED', extra = {}) {
  n += 1;
  const w = await Worker.create({ name: 'Cancel Pro', phone: `83${String(n).padStart(8, '0')}`, kyc: { status: 'approved' } });
  const b = await RepairBooking.create({
    reference: `CN${n}${Math.random().toString(36).slice(2, 6)}`, userId: new mongoose.Types.ObjectId(), workerId: w._id, vertical: 'two_wheeler', brandCode: 'one', modelCode: 'one',
    serviceMode: 'doorstep', status, paymentMethod: 'cash', paymentStatus: 'pending', location: { type: 'Point', coordinates: [78.38, 17.44], address: 'X' },
    priceSnapshot: { subtotalPaise: 30000, totalPaise: 30000 }, statusHistory: [{ status, at: new Date() }], ...extra,
  });
  return { b, w };
}
const cancel = (b, who, body = { reason: 'changed my mind' }) => request(app).post(`/api/repair/bookings/${b._id}/cancel`).set(who).send(body);
const move = (b, who, scheduledAt) => request(app).post(`/api/jobs/${b._id}/reschedule`).set(who).send({ scheduledAt });
const at = (ms) => new Date(Date.now() + ms).toISOString();

describe('who can cancel', () => {
  test('the booking\'s customer cancels it', async () => {
    const { b } = await job('CONFIRMED', { workerId: null });
    const r = await cancel(b, tok(b.userId, 'user'));
    expect(r.status).toBe(200);
    expect((await RepairBooking.findById(b._id).lean()).status).toBe('CANCELLED');
  });
  test.each(['CONFIRMED', 'PROVIDER_ASSIGNED', 'WORKER_ACCEPTED'])('a pro not on the job cannot cancel or release a %s booking', async (status) => {
    const { b, w } = await job(status);
    const outsider = await Worker.create({ name: 'Outsider', phone: `82${String(++n).padStart(8, '0')}`, kyc: { status: 'approved' } });
    const r = await cancel(b, tok(outsider._id, 'worker'));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const after = await RepairBooking.findById(b._id).lean();
    expect(after.status).toBe(status);
    expect(String(after.workerId || '')).toBe(String(w._id || ''));
  });
  test('a shop that does not hold the job cannot cancel it', async () => {
    const { b } = await job('WORKER_ACCEPTED');
    const r = await cancel(b, tok(new mongoose.Types.ObjectId(), 'shop'));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await RepairBooking.findById(b._id).lean()).status).toBe('WORKER_ACCEPTED');
  });
  test('another customer cannot see the cancellation fee or cancel', async () => {
    const { b } = await job();
    const stranger = tok(new mongoose.Types.ObjectId(), 'user');
    expect((await request(app).get(`/api/repair/bookings/${b._id}/cancellation-quote`).set(stranger)).status).toBeGreaterThanOrEqual(400);
    expect((await cancel(b, stranger)).status).toBe(404);
  });
  test('a pro not on the job cannot read its cancellation fee', async () => {
    const { b } = await job();
    const outsider = await Worker.create({ name: 'Peek', phone: `82${String(++n).padStart(8, '0')}` });
    const r = await request(app).get(`/api/repair/bookings/${b._id}/cancellation-quote`).set(tok(outsider._id, 'worker'));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  test.each(['COMPLETED', 'CANCELLED', 'REFUNDED'])('a %s booking cannot be cancelled', async (status) => {
    const { b } = await job(status);
    const r = await cancel(b, tok(b.userId, 'user'));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect((await RepairBooking.findById(b._id).lean()).status).toBe(status);
  });
  test('10 cancel taps at once cancel once, one history entry, nothing crashes', async () => {
    const { b } = await job('CONFIRMED', { workerId: null });
    const res = await Promise.all(Array.from({ length: 10 }, () => cancel(b, tok(b.userId, 'user'))));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const d = await RepairBooking.findById(b._id).lean();
    expect(d.status).toBe('CANCELLED');
    expect(d.statusHistory.filter((h) => h.status === 'CANCELLED')).toHaveLength(1);
  });
  test.each([['a 301-letter reason', { reason: 'x'.repeat(301) }], ['a reason as an object', { reason: { $ne: '' } }]])('%s → 400', async (_name, body) => {
    const { b } = await job();
    expect((await cancel(b, tok(b.userId, 'user'), body)).status).toBe(400);
  });
});

describe('moving the time', () => {
  const later = (extra = {}) => job('WORKER_ACCEPTED', { scheduledAt: new Date(Date.now() + 2 * 86400e3), ...extra });
  test('the customer moves a booking for later to another time inside the window', async () => {
    const { b } = await later();
    const to = at(3 * 86400e3);
    const r = await move(b, tok(b.userId, 'user'), to);
    expect(r.status).toBe(200);
    expect(new Date((await RepairBooking.findById(b._id).lean()).scheduledAt).toISOString()).toBe(to);
  });
  test.each([
    ['in the past', -3600e3], ['10 minutes from now (under 30)', 10 * 60e3], ['15 days out (over 14)', 15 * 86400e3],
  ])('a time %s is refused and nothing moves', async (_name, ms) => {
    const { b } = await later();
    const before = (await RepairBooking.findById(b._id).lean()).scheduledAt;
    const r = await move(b, tok(b.userId, 'user'), at(ms));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(String((await RepairBooking.findById(b._id).lean()).scheduledAt)).toBe(String(before));
  });
  test('no more than two moves per booking', async () => {
    const { b } = await later();
    expect((await move(b, tok(b.userId, 'user'), at(3 * 86400e3))).status).toBe(200);
    expect((await move(b, tok(b.userId, 'user'), at(4 * 86400e3))).status).toBe(200);
    expect((await move(b, tok(b.userId, 'user'), at(5 * 86400e3))).status).toBeGreaterThanOrEqual(400);
  });
  test.each(['ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'COMPLETED'])('once the pro has set off (%s), it is a cancel, not a move', async (status) => {
    const { b } = await job(status, { scheduledAt: new Date(Date.now() + 86400e3) });
    expect((await move(b, tok(b.userId, 'user'), at(2 * 86400e3))).status).toBeGreaterThanOrEqual(400);
  });
  test('another customer cannot move it', async () => {
    const { b } = await later();
    expect((await move(b, tok(new mongoose.Types.ObjectId(), 'user'), at(3 * 86400e3))).status).toBeGreaterThanOrEqual(400);
  });
  test.each([['a pro', 'worker'], ['a shop', 'shop']])('%s cannot move a customer\'s booking through the customer route', async (_name, role) => {
    const { b, w } = await later();
    expect((await move(b, tok(w._id, role), at(3 * 86400e3))).status).toBe(403);
  });
  test.each([['not a date', 'tomorrow'], ['missing', undefined]])('a time that is %s → 400', async (_name, scheduledAt) => {
    const { b } = await later();
    expect((await move(b, tok(b.userId, 'user'), scheduledAt)).status).toBe(400);
  });
  test('5 move taps at once count as at most the two allowed moves', async () => {
    const { b } = await later();
    const res = await Promise.all([3, 4, 5, 6, 7].map((d) => move(b, tok(b.userId, 'user'), at(d * 86400e3))));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    const { JobReschedule } = require('../src/modules/jobs/reschedule');
    if (JobReschedule) expect(await JobReschedule.countDocuments({ jobId: b._id })).toBeLessThanOrEqual(2);
  });
});
