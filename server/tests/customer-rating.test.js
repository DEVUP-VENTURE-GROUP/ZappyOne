/**
 * Providers rate customers (jobs/customer-rating): only the provider who did
 * the job, only once it is done, once; it rolls into the customer's average;
 * "unsafe" or a low average flags the customer for ops.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let cr; let HelpingTask; let User;
const HERE = { type: 'Point', coordinates: [78.39, 17.44], address: 'Madhapur' };
let n = 0;

beforeAll(async () => {
  await startMongo();
  cr = require('../src/modules/jobs/customer-rating');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  User = require('../src/modules/user/user.model');
});
afterAll(stopMongo);

const task = async (userId, workerId, status = 'COMPLETED') => {
  n += 1;
  return HelpingTask.create({
    reference: `HT-CR-${n}`, userId, workerId, serviceType: 'pickup', status, pickupLocation: HERE, destination: HERE,
    charge: { serviceChargePaise: 9000, workerEarningPaise: 8000 }, paymentMethod: 'cash', completedAt: new Date(),
  });
};

test('only the provider who did it, only when done, only once; rolls into the average', async () => {
  const u = await User.create({ name: 'Aarav', phone: '9000002001' });
  const w = new mongoose.Types.ObjectId();
  const live = await task(u._id, w, 'EN_ROUTE');
  await expect(cr.rate({ kind: 'helping', id: live._id, role: 'worker', providerId: w, stars: 5 })).rejects.toMatchObject({ code: 'NOT_DONE' });
  const t = await task(u._id, w);
  await expect(cr.rate({ kind: 'helping', id: t._id, role: 'worker', providerId: new mongoose.Types.ObjectId(), stars: 5 })).rejects.toMatchObject({ code: 'NOT_YOURS' });
  await cr.rate({ kind: 'helping', id: t._id, role: 'worker', providerId: w, stars: 4, tags: ['on_time', 'made_up_tag'] });
  await expect(cr.rate({ kind: 'helping', id: t._id, role: 'worker', providerId: w, stars: 1 })).rejects.toMatchObject({ code: 'ALREADY_RATED' });
  expect((await HelpingTask.findById(t._id).lean()).customerRating).toMatchObject({ stars: 4, tags: ['on_time'] });
  const t2 = await task(u._id, w);
  await cr.rate({ kind: 'helping', id: t2._id, role: 'worker', providerId: w, stars: 2 });
  expect(await cr.summaryFor(u._id)).toEqual({ rating: 3, count: 2, missedVisits: 0, cashRefused: 0 });
});

test('"unsafe" flags the customer for ops at once', async () => {
  const u = await User.create({ name: 'Ravi', phone: '9000002002' });
  const w = new mongoose.Types.ObjectId();
  const t = await task(u._id, w);
  await cr.rate({ kind: 'helping', id: t._id, role: 'worker', providerId: w, stars: 2, tags: ['unsafe'] });
  expect((await User.findById(u._id).lean()).flags.lowCustomerRating).toBe(true);
  expect(await cr.summaryFor(new mongoose.Types.ObjectId())).toBeNull();
});
