// "Jobs done" on profiles grows for every job kind, once per job, and old done jobs are counted by the backfill.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const Shop = () => require('../src/modules/shop/shop.model');
const Worker = () => require('../src/modules/worker/worker.model');
const { KINDS } = require('../src/modules/jobs/kinds');
const count = require('../src/modules/jobs/job-count');

let n = 0;
async function people() {
  n += 1;
  const shopId = new mongoose.Types.ObjectId();
  const workerId = new mongoose.Types.ObjectId();
  await Shop().collection.insertOne({ _id: shopId, businessName: 'Test shop', phone: `90000000${n}`.padEnd(10, '0'), completedJobs: 0 });
  await Worker().collection.insertOne({ _id: workerId, name: 'Tech', phone: `80000000${n}`.padEnd(10, '0'), completedJobs: 0 });
  return { shopId, workerId };
}
const jobs = async (who) => ({ shop: (await Shop().findById(who.shopId).lean()).completedJobs, worker: (await Worker().findById(who.workerId).lean()).completedJobs });
async function job(kind, fields) {
  const _id = new mongoose.Types.ObjectId();
  await KINDS[kind].model().collection.insertOne({ _id, reference: `T-${_id}`, ...fields });
  return { _id, ...fields };
}

test('a repair done by a shop technician counts once for the shop and once for the technician', async () => {
  const who = await people();
  const doc = await job('repair', { ...who, status: 'COMPLETED' });
  expect(await count.onStatus('repair', doc, 'COMPLETED')).toBe(true);
  expect(await jobs(who)).toEqual({ shop: 1, worker: 1 });
});

test('passing through later done steps (confirmed, paid, closed) does not count the same job again', async () => {
  const who = await people();
  const doc = await job('pet', { ...who, status: 'SERVICE_COMPLETED' });
  for (const s of KINDS.pet.earning.done) await count.onStatus('pet', doc, s);
  expect(await jobs(who)).toEqual({ shop: 1, worker: 1 });
});

test('two saves racing on the same finish still count it once', async () => {
  const who = await people();
  const doc = await job('repair', { ...who, status: 'COMPLETED' });
  await Promise.all(Array.from({ length: 8 }, () => count.onStatus('repair', doc, 'COMPLETED')));
  expect(await jobs(who)).toEqual({ shop: 1, worker: 1 });
});

test('a job that is not done (on the way, cancelled) is not counted', async () => {
  const who = await people();
  const doc = await job('repair', { ...who, status: 'CANCELLED' });
  expect(await count.onStatus('repair', doc, 'CANCELLED')).toBe(false);
  expect(await count.onStatus('repair', doc, 'PROVIDER_ASSIGNED')).toBe(false);
  expect(await jobs(who)).toEqual({ shop: 0, worker: 0 });
});

test('pet and helping jobs count too, not only repairs', async () => {
  const who = await people();
  const pet = await job('pet', { workerId: who.workerId, status: KINDS.pet.earning.done[0] });
  const help = await job('helping', { shopId: who.shopId, status: KINDS.helping.earning.done[0] });
  await count.onStatus('pet', pet, pet.status);
  await count.onStatus('helping', help, help.status);
  expect(await jobs(who)).toEqual({ shop: 1, worker: 1 });
});

test('the backfill counts done jobs from before, and running it again adds nothing', async () => {
  const who = await people();
  await job('repair', { ...who, status: 'COMPLETED' });
  await job('pet', { shopId: who.shopId, status: 'CLOSED' });
  await job('repair', { ...who, status: 'CANCELLED' });
  await count.backfill();
  expect(await jobs(who)).toEqual({ shop: 2, worker: 1 });
  await count.backfill();
  expect(await jobs(who)).toEqual({ shop: 2, worker: 1 });
});
