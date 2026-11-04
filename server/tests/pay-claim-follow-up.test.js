// "I've paid" never closes a job by itself: the pro is reminded, then ZappyOne gets an urgent case; two different stories become a dispute; every urgent alert lands in the admin bell.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let sign; let PetBooking; let Worker; let payDirect; let alerts; let giveBack;
const owner = new mongoose.Types.ObjectId();
const MIN = 60000;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  payDirect = require('../src/modules/jobs/pay-direct');
  alerts = require('../src/modules/admin/ops-alerts');
  giveBack = require('../src/modules/jobs/give-back');
  await alerts.OpsAlert.init();
});
afterAll(stopMongo);

let n = 0;
async function job(claimAgoMin, extra = {}) {
  n += 1;
  const { insertedId: w } = await Worker.collection.insertOne({ name: 'Ravi Kumar', phone: `98222000${String(n).padStart(2, '0')}`, savedUpiIds: [{ upiId: 'ravi@okhdfcbank', isDefault: true }], createdAt: new Date() });
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `PB-F${n}`, userId: owner, workerId: w, status: 'SERVICE_COMPLETED', serviceMode: 'home_visit', categoryCode: 'pet_grooming',
    paymentMethod: 'cash', paymentStatus: 'unpaid', pets: [], pricing: { subtotalPaise: 27000, totalPaise: 27000 },
    serviceLocation: { type: 'Point', coordinates: [78.48, 17.38], address: 'Flat 2' }, statusHistory: [], createdAt: new Date(),
    payClaim: { method: 'upi', amountPaise: 27000, at: new Date(Date.now() - claimAgoMin * MIN) }, ...extra,
  });
  return { id: insertedId, workerId: w };
}
const openFor = async (id) => alerts.OpsAlert.find({ 'data.id': String(id), doneAt: null }).lean();

test('pro silent: reminded after 5 min, urgent case after 10, never marked paid, each step once', async () => {
  const fresh = await job(2);
  const remind = await job(6);
  const late = await job(12);
  const out = await payDirect.sweepClaims();
  expect(out).toMatchObject({ reminded: 1, escalated: 1 });

  expect((await PetBooking.findById(fresh.id).lean()).payClaim.remindedAt).toBeUndefined();
  const r = await PetBooking.findById(remind.id).lean();
  expect(r.payClaim.remindedAt).toBeInstanceOf(Date);
  expect(r.payClaim.escalatedAt).toBeUndefined();
  expect(await openFor(remind.id)).toHaveLength(0);

  const l = await PetBooking.findById(late.id).lean();
  expect(l.payClaim.escalatedAt).toBeInstanceOf(Date);
  expect(l.paymentStatus).toBe('unpaid');
  const [a] = await openFor(late.id);
  expect(a).toMatchObject({ type: 'pay_unconfirmed', urgent: true });

  expect(await payDirect.sweepClaims()).toMatchObject({ reminded: 0, escalated: 0 });
  expect(await payDirect.sweepClaims({ now: Date.now() + 6 * MIN })).toMatchObject({ escalated: 1 });
  expect(await openFor(remind.id)).toHaveLength(1);
});

test('already paid, or the pro already said not paid: no reminder and no "not confirmed" case', async () => {
  const paid = await job(15, { paymentStatus: 'paid' });
  const refused = await job(15);
  await giveBack.JobGiveBack.create({ kind: 'pet', jobId: refused.id, providerKind: 'worker', providerId: refused.workerId, userId: owner, type: 'cash_refused', reason: 'cash_refused' });
  await payDirect.sweepClaims();
  expect(await openFor(paid.id)).toHaveLength(0);
  expect((await openFor(refused.id)).filter((x) => x.type === 'pay_unconfirmed')).toHaveLength(0);
});

test('customer says paid and the pro says not paid: one urgent dispute case, no strike on the customer', async () => {
  const User = require('../src/modules/user/user.model');
  await User.collection.insertOne({ _id: owner, name: 'Abilash', phone: '9000099001', createdAt: new Date() });
  const j = await job(1);
  const pro = { Authorization: `Bearer ${sign({ sub: String(j.workerId), role: 'worker' })}` };
  const res = await request(app).post(`/api/jobs/${j.id}/cash-refused`).set(pro).send({ note: 'not in my UPI' });
  expect(res.status).toBe(200);
  const open = await openFor(j.id);
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({ type: 'pay_disputed', urgent: true });
  expect(open[0].body).toMatch(/says they paid ₹270 by UPI/);
  expect((await User.findById(owner).lean()).abuse?.cashRefused || 0).toBe(0);
});

test('the bell: open alerts come with the to-do list; Done takes one off; the same thing again reopens one', async () => {
  const { Admin } = { Admin: require('../src/modules/admin/admin.model') };
  const admin = await Admin.collection.insertOne({ name: 'Ops', email: 'ops@test.in', role: 'super_admin', isActive: true, createdAt: new Date() });
  const a = await alerts.raise({ type: 'worker_sos', title: 'SOS: Ravi', body: 'Gachibowli', urgent: true, key: 'sos:t1' });
  await alerts.raise({ type: 'worker_sos', title: 'SOS: Ravi (again)', urgent: true, key: 'sos:t1' });
  expect(await alerts.OpsAlert.countDocuments({ openKey: 'sos:t1' })).toBe(1);

  const todo = await require('../src/modules/admin/todo.service').forAdmin({ _id: admin.insertedId, role: 'super_admin' });
  expect(todo.alerts.find((x) => x.id === String(a._id))).toMatchObject({ title: 'SOS: Ravi (again)', urgent: true });

  expect(await alerts.done(a._id, admin.insertedId)).toEqual({ done: true });
  expect(await alerts.done(a._id, admin.insertedId)).toEqual({ done: false });
  await alerts.raise({ type: 'worker_sos', title: 'SOS: Ravi', urgent: true, key: 'sos:t1' });
  expect(await alerts.OpsAlert.countDocuments({ title: /SOS: Ravi/ })).toBe(2);
});

test('nothing sends to the old ops channel nobody listened to', () => {
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (p.endsWith('.js') && fs.readFileSync(p, 'utf8').includes('notification:admin:ops')) hits.push(p);
    }
  })(path.join(__dirname, '../src'));
  expect(hits).toEqual([]);
});
