// Admin sees what went wrong on a booking: the payment story, reports and alerts in its drawer, and every issue across bookings in one list.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let token; let PetBooking; let alerts; let jobId;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const Admin = require('../src/modules/admin/admin.model');
  const admin = await Admin.create({ email: `ops-${Date.now()}@z.test`, name: 'Ops', passwordHash: 'x', role: 'super_admin' });
  token = require('../src/modules/auth/token.service').signAccessToken({ sub: String(admin._id), role: 'admin', email: admin.email });
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  alerts = require('../src/modules/admin/ops-alerts');

  const userId = new mongoose.Types.ObjectId();
  const workerId = new mongoose.Types.ObjectId();
  const at = new Date(Date.now() - 20 * 60000);
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: 'PB-ISSUE1', userId, workerId, status: 'SERVICE_COMPLETED', serviceMode: 'home_visit', categoryCode: 'pet_grooming',
    paymentMethod: 'cash', paymentStatus: 'unpaid', pets: [], pricing: { subtotalPaise: 27000, totalPaise: 27000 },
    serviceLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2' }, statusHistory: [], createdAt: new Date(),
    payClaim: { method: 'upi', amountPaise: 27000, utr: '431298765012', at, remindedAt: new Date(at.getTime() + 5 * 60000) },
  });
  jobId = insertedId;
  await require('../src/modules/jobs/give-back').JobGiveBack.create({ kind: 'pet', jobId, providerKind: 'worker', providerId: workerId, userId, type: 'cash_refused', reason: 'cash_refused', note: 'not in my UPI' });
  await alerts.raise({ type: 'pay_disputed', key: `pay:${jobId}`, title: 'Payment dispute on PB-ISSUE1', body: 'Customer says paid', data: { kind: 'pet', id: String(jobId), reference: 'PB-ISSUE1' } });
  await alerts.raise({ type: 'worker_sos', urgent: true, title: 'SOS: Ravi', body: 'Gachibowli' });
});
afterAll(stopMongo);

const call = (path) => request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`)
  .set('Authorization', `Bearer ${token}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');

test('a booking\'s drawer tells its whole story: the UPI claim, the reminder, the pro\'s report, the open alert', async () => {
  const res = await call(`/bookings/pet/${jobId}`);
  expect(res.status).toBe(200);
  const { payment, reports, alerts: open } = res.body.issues;
  expect(payment.map((p) => p.what)).toEqual(['Customer said they paid ₹270 by UPI (ref 431298765012)', 'Pro reminded to confirm']);
  expect(reports).toEqual([expect.objectContaining({ type: 'cash_refused', label: 'Pro said the customer did not pay', note: 'not in my UPI', resolvedAt: null })]);
  expect(open).toEqual([expect.objectContaining({ type: 'pay_disputed', doneAt: null, job: { kind: 'pet', id: String(jobId), reference: 'PB-ISSUE1' } })]);
});

test('the issues list: open first, done once closed, filtered by type, and only admins see it', async () => {
  let r = await call('/issues');
  expect(r.status).toBe(200);
  expect(r.body.open).toBe(2);
  expect(r.body.types).toEqual(['pay_disputed', 'worker_sos']);
  expect((await call('/issues?type=pay_disputed')).body.rows).toHaveLength(1);

  await alerts.done(r.body.rows.find((x) => x.type === 'worker_sos').id, null);
  r = await call('/issues');
  expect(r.body.rows.map((x) => x.type)).toEqual(['pay_disputed']);
  expect((await call('/issues?state=done')).body.rows.map((x) => x.type)).toEqual(['worker_sos']);
  expect((await call('/issues?state=all')).body.rows).toHaveLength(2);

  const user = require('../src/modules/auth/token.service').signAccessToken({ sub: String(new mongoose.Types.ObjectId()), role: 'user' });
  const denied = await request(app).get(`/api/${process.env.ADMIN_LOGIN_SLUG}/issues`).set('Authorization', `Bearer ${user}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
  expect([401, 403]).toContain(denied.status);
});
