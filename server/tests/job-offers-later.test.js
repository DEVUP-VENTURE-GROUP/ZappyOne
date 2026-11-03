// "I can come by …" end to end through the routes: who may offer, the customer's choice, silence, and that a waiting job is never lost while an offer stands.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(120000);
let app;
const oid = () => new mongoose.Types.ObjectId();
const HOME = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
const as = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
let phone = 9000000700;
async function helper({ approved = true } = {}) {
  const w = await Worker.create({ name: `Helper ${phone}`, phone: String(phone += 1), kyc: { status: 'approved' }, isOnline: true, lastSeenAt: new Date(), currentLocation: { type: 'Point', coordinates: [78.39, 17.45] } });
  if (approved) await ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode: 'helping_services', lineCode: 'shopping_pickup', status: 'approved' });
  return w;
}
async function task(extra = {}) {
  const userId = oid();
  const { insertedId } = await HelpingTask.collection.insertOne({
    reference: `ZH${Math.random().toString(36).slice(2, 8)}`, userId, status: 'CONFIRMED', serviceType: 'shopping', title: 'Groceries', workerId: null,
    pickupLocation: HOME, charge: { workerEarningPaise: 9000 }, items: [], statusHistory: [{ status: 'CONFIRMED', at: new Date() }], matching: {}, createdAt: new Date(), updatedAt: new Date(), ...extra,
  });
  return { id: String(insertedId), userId };
}
const offer = (id, w, minutes) => request(app).post(`/api/jobs/${id}/offers`).set(as(w._id, 'worker')).send({ minutes });
const view = (t) => request(app).get(`/api/jobs/${t.id}/offers`).set(as(t.userId, 'user'));
const choose = (t, w) => request(app).post(`/api/jobs/${t.id}/offers/choose`).set(as(t.userId, 'user')).send({ by: `worker:${w._id}` });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  jest.spyOn(require('../src/modules/messaging/send'), 'send').mockResolvedValue(null);
});
afterAll(stopMongo);

test('a verified pro offers a time; the customer sees it and says OK; the job is theirs and the promise is that time', async () => {
  const t = await task(); const w = await helper();
  const res = await offer(t.id, w, 20);
  expect(res.status).toBe(201);
  const seen = await view(t);
  expect(seen.body.offers).toEqual([expect.objectContaining({ by: `worker:${w._id}`, minutes: 20 })]);
  expect((await choose(t, w)).status).toBe(200);
  const after = await HelpingTask.findById(t.id).lean();
  expect(String(after.workerId)).toBe(String(w._id));
  expect(after.matching.promise).toMatchObject({ by: `worker:${w._id}`, minutes: 20, how: 'customer' });
  await new Promise((r) => setTimeout(r, 200));
  const { ArrivalPromise } = require('../src/modules/jobs/promise');
  const kept = await ArrivalPromise.findOne({ jobId: t.id }).lean();
  expect(kept).toMatchObject({ source: 'offered_time', promisedMinutes: 20 });
  expect(new Date(kept.promisedBy).getTime()).toBe(new Date(after.matching.promise.arriveBy).getTime());
});

test('who may not offer: unverified, a time not on the list, a job someone has, a job booked for later', async () => {
  const t = await task();
  expect((await offer(t.id, await helper({ approved: false }), 20)).status).toBe(403);
  expect((await offer(t.id, await helper(), 7)).status).toBe(400);
  const taken = await task({ workerId: oid(), status: 'WORKER_ACCEPTED' });
  expect((await offer(taken.id, await helper(), 20)).status).toBe(409);
  const later = await task({ scheduledAt: new Date(Date.now() + 5 * 3600e3) });
  expect((await offer(later.id, await helper(), 20)).status).toBe(409);
});

test('one offer per pro (a new one replaces theirs); the customer picks the second pro and the first hears it went elsewhere', async () => {
  const t = await task(); const a = await helper(); const b = await helper();
  await offer(t.id, a, 45); await offer(t.id, a, 30); await offer(t.id, b, 60);
  const seen = (await view(t)).body.offers;
  expect(seen.map((o) => [o.by, o.minutes])).toEqual([[`worker:${a._id}`, 30], [`worker:${b._id}`, 60]]);
  expect((await choose(t, b)).status).toBe(200);
  await new Promise((r) => setTimeout(r, 200));
  const Notification = require('../src/modules/notification/notification.model');
  expect(await Notification.findOne({ 'recipient.id': a._id, title: 'That job went to another pro' }).lean()).toBeTruthy();
  expect((await choose(t, a)).status).toBe(409);
});

test('silence: past the decision time the soonest offer is taken for the customer, but never one later than 30 minutes', async () => {
  const { autoChoose } = require('../src/modules/jobs/offers');
  const soon = await task(); const far = await task(); const p = await helper(); const q = await helper();
  await offer(soon.id, p, 20); await offer(far.id, q, 45);
  const inThree = Date.now() + 3 * 60000;
  expect(await autoChoose('helping', await HelpingTask.findById(soon.id).lean(), Date.now())).toBe(false);
  expect(await autoChoose('helping', await HelpingTask.findById(soon.id).lean(), inThree)).toBe(true);
  expect((await HelpingTask.findById(soon.id).lean()).matching.promise.how).toBe('auto');
  expect(await autoChoose('helping', await HelpingTask.findById(far.id).lean(), inThree)).toBe(false);
  expect((await HelpingTask.findById(far.id).lean()).workerId).toBeNull();
});

test('never lost: the sweep does not close a job while an offer stands; an offer whose pro can no longer take it is dropped, the job keeps waiting', async () => {
  const t = await task({ createdAt: new Date(Date.now() - 40 * 60000), statusHistory: [{ status: 'CONFIRMED', at: new Date(Date.now() - 40 * 60000) }] });
  const w = await helper();
  await offer(t.id, w, 30);
  await require('../src/modules/jobs/waves').sweep({ now: Date.now() });
  expect((await HelpingTask.findById(t.id).lean()).status).toBe('CONFIRMED');

  // Meanwhile they went over their dues limit: saying OK to them fails cleanly, their offer goes.
  const Wallet = require('../src/modules/wallet/wallet.model');
  await Wallet.updateOne({ 'owner.kind': 'worker', 'owner.id': w._id }, { $set: { balancePaise: -250000 } }, { upsert: true });
  expect((await choose(t, w)).status).toBe(409);
  const after = await HelpingTask.findById(t.id).lean();
  expect(after.workerId).toBeNull();
  expect(after.matching.offers).toHaveLength(0);
  expect(after.matching.promise).toBeNull();
});

test('worst cases: a cancelled booking tells everyone who offered; a partner may offer on as many jobs as they choose', async () => {
  const Notification = require('../src/modules/notification/notification.model');
  const t = await task(); const a = await helper(); const b = await helper();
  await offer(t.id, a, 20); await offer(t.id, b, 30);
  await HelpingTask.updateOne({ _id: t.id }, { $set: { status: 'CANCELLED' } });
  await require('../src/modules/jobs/job-events').announce('helping', await HelpingTask.findById(t.id).lean(), 'CANCELLED');
  await new Promise((r) => setTimeout(r, 200));
  for (const w of [a, b]) expect(await Notification.findOne({ 'recipient.id': w._id, title: 'That booking was cancelled' }).lean()).toBeTruthy();
  expect((await HelpingTask.findById(t.id).lean()).matching.offers).toHaveLength(0);

  // ServicePro partners have no job cap: one pro may offer a time on as many jobs as they choose.
  const busyPro = await helper();
  const jobs = await Promise.all([task(), task(), task()]);
  for (const j of jobs) expect((await offer(j.id, busyPro, 20)).status).toBe(201);
});
