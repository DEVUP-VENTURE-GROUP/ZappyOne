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
    payClaim: { method: 'upi', amountPaise: 27000, at: new Date(Date.now() - claimAgoMin * MIN) },
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => !k.includes('.'))),
  });
  const nested = Object.fromEntries(Object.entries(extra).filter(([k]) => k.includes('.')));
  if (Object.keys(nested).length) await PetBooking.collection.updateOne({ _id: insertedId }, { $set: nested });
  return { id: insertedId, workerId: w };
}
const openFor = async (id) => alerts.OpsAlert.find({ 'data.id': String(id), doneAt: null }).lean();

test('pro silent: reminded at 5 and 10 min; a UPI payment with its reference counts as received at 30; each step once', async () => {
  const fresh = await job(2);
  const first = await job(6);
  const again = await job(11, { 'payClaim.remindedAt': new Date(Date.now() - 5 * MIN) });
  const auto = await job(31, { 'payClaim.remindedAt': new Date(), 'payClaim.remindedAgainAt': new Date() });
  for (const j of [fresh, first, again, auto]) await PetBooking.collection.updateOne({ _id: j.id }, { $set: { 'payClaim.utr': `43129876${String(j.id).slice(-4).replace(/\D/g, '0').padStart(4, '0')}` } });
  const out = await payDirect.sweepClaims();
  expect(out).toMatchObject({ reminded: 2, autoReceived: 1 });

  expect((await PetBooking.findById(fresh.id).lean()).payClaim.remindedAt).toBeUndefined();
  expect((await PetBooking.findById(first.id).lean()).payClaim.remindedAt).toBeInstanceOf(Date);
  expect((await PetBooking.findById(again.id).lean()).payClaim.remindedAgainAt).toBeInstanceOf(Date);
  const a = await PetBooking.findById(auto.id).lean();
  expect(a.paymentStatus).toBe('paid');
  expect(a.payClaim.autoReceivedAt).toBeInstanceOf(Date);
  expect(a.status).toBe('PAYMENT_COMPLETED');

  expect(await payDirect.sweepClaims()).toMatchObject({ reminded: 0, autoReceived: 0 });
});

test('cash is never closed by the sweep, however long; a UPI claim with no reference is not either', async () => {
  const cash = await job(90, { 'payClaim.method': 'cash', 'payClaim.remindedAt': new Date(), 'payClaim.remindedAgainAt': new Date() });
  const noRef = await job(90, { 'payClaim.remindedAt': new Date(), 'payClaim.remindedAgainAt': new Date() });
  await payDirect.sweepClaims();
  expect((await PetBooking.findById(cash.id).lean()).paymentStatus).toBe('unpaid');
  expect((await PetBooking.findById(noRef.id).lean()).paymentStatus).toBe('unpaid');
});

test('already paid, or the pro said not received: no reminder, never auto-received', async () => {
  const paid = await job(40, { paymentStatus: 'paid', 'payClaim.utr': '431298760001' });
  const refused = await job(40, { 'payClaim.utr': '431298760002' });
  await giveBack.JobGiveBack.create({ kind: 'pet', jobId: refused.id, providerKind: 'worker', providerId: refused.workerId, userId: owner, type: 'cash_refused', reason: 'cash_refused' });
  expect(await payDirect.sweepClaims()).toMatchObject({ autoReceived: 0 });
  expect((await PetBooking.findById(refused.id).lean()).paymentStatus).toBe('unpaid');
  expect((await PetBooking.findById(paid.id).lean()).payClaim.autoReceivedAt).toBeInstanceOf(Date);
});

test('"I paid by UPI" needs the 12-digit reference, and one reference pays one job', async () => {
  const cust = { Authorization: `Bearer ${sign({ sub: String(owner), role: 'user' })}` };
  const one = await job(0, { payClaim: undefined });
  const two = await job(0, { payClaim: undefined });
  await PetBooking.collection.updateMany({ _id: { $in: [one.id, two.id] } }, { $unset: { payClaim: 1 } });
  expect((await request(app).post(`/api/jobs/${one.id}/pay-claim`).set(cust).send({ method: 'upi' })).body.code).toBe('UPI_REF_REQUIRED');
  expect((await request(app).post(`/api/jobs/${one.id}/pay-claim`).set(cust).send({ method: 'upi', utr: '12345' })).body.code).toBe('UPI_REF_REQUIRED');
  expect((await request(app).post(`/api/jobs/${one.id}/pay-claim`).set(cust).send({ method: 'upi', utr: '4312 9876 5012' })).status).toBe(200);
  expect((await PetBooking.findById(one.id).lean()).payClaim.utr).toBe('431298765012');
  expect((await request(app).post(`/api/jobs/${two.id}/pay-claim`).set(cust).send({ method: 'upi', utr: '431298765012' })).body.code).toBe('UPI_REF_USED');
  expect((await request(app).post(`/api/jobs/${two.id}/pay-claim`).set(cust).send({ method: 'cash' })).status).toBe(200);
  const o = await request(app).get(`/api/jobs/${one.id}/options`).set(cust);
  expect(o.body.payTo.claim.utr).toBe('431298765012');
  expect(o.body.payTo.help).toMatchObject({ afterMinutes: 5 });
  expect((await request(app).get('/api/content/help-line')).body.help.phone).toBeTruthy();
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
  expect(open[0]).toMatchObject({ type: 'pay_disputed' });
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
