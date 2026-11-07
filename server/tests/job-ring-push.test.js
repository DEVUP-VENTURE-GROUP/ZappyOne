// A job offer reaches a phone with the native ring as data only (so the app rings full-screen), and every other device as the usual notification; non-offers never use the ring path.
const mongoose = require('mongoose');

const sent = [];
jest.mock('firebase-admin', () => ({
  apps: [{}],
  credential: { cert: () => ({}) },
  initializeApp: () => ({}),
  messaging: () => ({
    sendEachForMulticast: async (m) => { sent.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) }; },
  }),
}));

const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(async () => {
  Object.assign(require('../src/config').firebase, { projectId: 'test', clientEmail: 'test@test', privateKey: 'key' });
  await startMongo();
});
afterAll(stopMongo);
beforeEach(() => { sent.length = 0; });

const { processJob } = require('../src/jobs/notifications.worker');

async function worker(tokens, ring) {
  const Worker = require('../src/modules/worker/worker.model');
  const id = new mongoose.Types.ObjectId();
  await Worker.collection.insertOne({ _id: id, phone: `91${String(Math.random()).slice(2, 10)}`, deviceTokens: tokens, nativeTokens: ring });
  return String(id);
}
const push = (id, data) => processJob({ name: 'push', data: { recipient: { kind: 'worker', id }, title: 'New job near you', body: 'Phone screen, Madhapur', data } });

test('an offer goes data-only to the ringing phone and as a notification to the rest', async () => {
  const id = await worker(['old-phone', 'ring-phone', 'browser'], ['ring-phone']);
  await push(id, { kind: 'repair', id: 'job1', channel: 'offers', windowSec: 90 });
  const ring = sent.find((m) => m.tokens.includes('ring-phone'));
  const rest = sent.find((m) => m.tokens.includes('old-phone'));
  expect(ring.tokens).toEqual(['ring-phone']);
  expect(ring.notification).toBeUndefined();
  expect(ring.data).toMatchObject({ zr: 'offer', title: 'New job near you', id: 'job1', windowSec: '90' });
  expect(ring.android).toMatchObject({ priority: 'high', ttl: 90000 });
  expect(rest.tokens).toEqual(['old-phone', 'browser']);
  expect(rest.notification).toMatchObject({ title: 'New job near you' });
});

test('a job update refreshes one live card on a native phone, and is a normal notification elsewhere', async () => {
  const id = await worker(['old-phone', 'ring-phone'], ['ring-phone']);
  await push(id, { kind: 'repair', id: 'job2', status: 'ARRIVED' });
  const live = sent.find((m) => m.tokens.includes('ring-phone'));
  expect(live.notification).toBeUndefined();
  expect(live.data).toMatchObject({ zl: 'job', id: 'job2', stage: 'active' });
  expect(sent.find((m) => m.tokens.includes('old-phone')).notification).toMatchObject({ title: 'New job near you' });
});

test('a finished job tells the card to stop being sticky', async () => {
  const id = await worker(['ring-phone'], ['ring-phone']);
  await push(id, { kind: 'repair', id: 'job3', status: 'COMPLETED' });
  expect(sent[0].data).toMatchObject({ zl: 'job', stage: 'completed' });
  sent.length = 0;
  await push(id, { kind: 'repair', id: 'job4', status: 'CANCELLED' });
  expect(sent[0].data).toMatchObject({ zl: 'job', stage: 'cancelled' });
});

test('a push that is not about a job stays a normal notification, even on a native phone', async () => {
  const id = await worker(['ring-phone'], ['ring-phone']);
  await push(id, { type: 'promotional' });
  expect(sent).toHaveLength(1);
  expect(sent[0].notification).toMatchObject({ title: 'New job near you' });
  expect(sent[0].data.zl).toBeUndefined();
});
