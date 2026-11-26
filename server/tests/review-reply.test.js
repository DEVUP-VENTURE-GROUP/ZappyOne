// A provider answers a review in public: only their own, no contact details or abuse, can edit or remove it, customers see it, admin can take it down.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(120000);
let app; let Review; let reviews; let Worker; let User;
const userId = new mongoose.Types.ObjectId();
const tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  Review = require('../src/modules/review/review.model');
  reviews = require('../src/modules/review/review.service');
  Worker = require('../src/modules/worker/worker.model');
  User = require('../src/modules/user/user.model');
  await User.collection.insertOne({ _id: userId, name: 'Ravi Kumar', phone: '+919000000951' });
});
afterAll(stopMongo);

let n = 0;
async function setup(comment = 'Came late but fixed it') {
  const workerId = new mongoose.Types.ObjectId();
  await Worker.collection.insertOne({ _id: workerId, name: 'Asha', phone: `90000009${String(++n).padStart(2, '0')}`, kyc: { status: 'approved' } });
  const r = await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId, workerId, rating: 3, comment });
  return { workerId, id: String(r._id) };
}
const put = (id, who, text) => request(app).put(`/api/reviews/${id}/reply`).set(tok(who, 'worker')).send({ text });

test('the provider replies and sees it on their own list', async () => {
  const { workerId, id } = await setup();
  const r = await put(id, workerId, 'Sorry for the delay, traffic on the ORR. Thanks for the review.');
  expect(r.status).toBe(200);
  expect(r.body.reply.text).toMatch(/Sorry for the delay/);
  const mine = await request(app).get('/api/reviews/mine').set(tok(workerId, 'worker'));
  expect(mine.body.reviews[0].reply.text).toMatch(/Sorry for the delay/);
});

test('customers see the reply on the public profile', async () => {
  const { workerId, id } = await setup();
  await put(id, workerId, 'Thank you');
  const pub = await reviews.publicSummary({ workerId });
  expect(pub.reviews[0].reply).toMatchObject({ text: 'Thank you' });
});

test('editing replaces it and an empty reply removes it', async () => {
  const { workerId, id } = await setup();
  await put(id, workerId, 'First');
  await put(id, workerId, 'Second');
  expect((await Review.findById(id).lean()).reply.text).toBe('Second');
  const gone = await put(id, workerId, '');
  expect(gone.body.reply).toBeNull();
  expect((await reviews.publicSummary({ workerId })).reviews[0].reply).toBeNull();
});

test.each([
  ['a phone number', 'Call me on 9876543210'],
  ['an email', 'mail me at a@b.com'],
  ['abuse', 'you bastard'],
])('a reply with %s is refused', async (_n, text) => {
  const { workerId, id } = await setup();
  const r = await put(id, workerId, text);
  expect(r.status).toBe(400);
  expect(r.body.code).toBe('REPLY_NOT_ALLOWED');
});

test('another provider, a customer, a bad id and a long reply are refused', async () => {
  const { id } = await setup();
  const other = await setup();
  expect((await put(id, other.workerId, 'Not mine')).status).toBe(404);
  expect((await request(app).put(`/api/reviews/${id}/reply`).set(tok(userId, 'user')).send({ text: 'hi' })).status).toBe(404);
  expect((await put('nope', other.workerId, 'hi')).status).toBe(404);
  expect((await put(id, other.workerId, 'x'.repeat(501))).status).toBe(400);
  expect((await Review.findById(id).lean()).reply?.text || '').toBe('');
});

test('admin can take a reply down', async () => {
  const { workerId, id } = await setup();
  await put(id, workerId, 'Thanks');
  await reviews.moderate(id, { action: 'remove_reply', reason: 'Off topic' }, null);
  expect((await reviews.publicSummary({ workerId })).reviews[0].reply).toBeNull();
  expect((await reviews.adminList({})).reviews.find((r) => r.id === id).reply).toBeNull();
});
