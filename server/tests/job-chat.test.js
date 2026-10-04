/**
 * Job chat: the customer and the provider holding the job can talk once it is
 * accepted; nobody else sees it; it is closed before acceptance and on
 * cancelled jobs; the other side's messages are marked read when opened.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let chat; let PetBooking;
const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const customer = { kind: 'user', id: String(userId) };
const worker = { kind: 'worker', id: String(workerId) };

beforeAll(async () => {
  await startMongo();
  chat = require('../src/modules/jobs/job-chat.service');
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
});
afterAll(stopMongo);

async function booking(status, withWorker = true) {
  const r = await PetBooking.collection.insertOne({
    userId, workerId: withWorker ? workerId : null, shopId: null, reference: `PET-${Math.random()}`, categoryCode: 'pet_grooming', status,
    statusHistory: [], pets: [], pricing: {}, execution: {}, createdAt: new Date(), updatedAt: new Date(),
  });
  return String(r.insertedId);
}

test('customer and provider talk once the job is accepted; reading marks it read', async () => {
  const id = await booking('PROVIDER_ACCEPTED');
  await chat.send({ jobId: id, actor: customer, text: 'Please come to gate 2' });
  await chat.send({ jobId: id, actor: worker, text: 'On my way' });
  const forWorker = await chat.list({ jobId: id, actor: worker });
  expect(forWorker.open).toBe(true);
  expect(forWorker.messages.map((m) => [m.text, m.mine])).toEqual([['Please come to gate 2', false], ['On my way', true]]);
  const forCustomer = await chat.list({ jobId: id, actor: customer });
  expect(forCustomer.messages[0].readAt).toBeTruthy(); // the worker opened it
});

test('nobody outside the job can read or write', async () => {
  const id = await booking('PROVIDER_ACCEPTED');
  const stranger = { kind: 'worker', id: String(new mongoose.Types.ObjectId()) };
  await expect(chat.list({ jobId: id, actor: stranger })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(chat.send({ jobId: id, actor: stranger, text: 'hi' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('closed before acceptance and on cancelled jobs, with a reason people understand', async () => {
  const waiting = await booking('PROVIDER_ASSIGNED');
  await expect(chat.send({ jobId: waiting, actor: customer, text: 'hello' })).rejects.toMatchObject({ code: 'CHAT_CLOSED' });
  const cancelled = await booking('CANCELLED');
  const out = await chat.list({ jobId: cancelled, actor: customer });
  expect(out).toMatchObject({ open: false });
  expect(out.reason).toMatch(/cancelled/);
});
