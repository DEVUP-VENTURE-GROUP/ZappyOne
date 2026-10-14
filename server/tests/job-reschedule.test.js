/**
 * Moving a booked time (jobs/reschedule): only bookings made for later, only
 * before the provider sets off, 30 min to 14 days out, at most twice.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let HelpingTask; let rs;
const HERE = { type: 'Point', coordinates: [78.4867, 17.385], address: 'Start' };
const H = 3600000;
let n = 0;

beforeAll(async () => {
  await startMongo();
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  rs = require('../src/modules/jobs/reschedule');
});
afterAll(stopMongo);

const task = (userId, status, extra = {}) => {
  n += 1;
  return HelpingTask.create({
    reference: `HT-RS-${n}`, userId, serviceType: 'shopping', status, pickupLocation: HERE, destination: HERE,
    charge: { serviceChargePaise: 12000, workerEarningPaise: 10800, commissionPaise: 1200 },
    paymentMethod: 'cash', scheduledAt: new Date(Date.now() + 5 * H), ...extra,
  });
};

test('moves a later booking, tells the time back, and logs it', async () => {
  const user = new mongoose.Types.ObjectId();
  const t = await task(user, 'WORKER_ACCEPTED', { workerId: new mongoose.Types.ObjectId() });
  const to = new Date(Date.now() + 26 * H);
  const r = await rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: to.toISOString() });
  expect(r.left).toBe(1);
  expect((await HelpingTask.findById(t._id).lean()).scheduledAt.getTime()).toBe(to.getTime());
  expect(await rs.JobReschedule.countDocuments({ jobId: t._id, providerTold: true })).toBe(1);
});

test('too soon, too far, someone else\'s, on the way, and past the limit are refused', async () => {
  const user = new mongoose.Types.ObjectId();
  const t = await task(user, 'WORKER_SEARCHING');
  const at = (ms) => new Date(Date.now() + ms).toISOString();
  await expect(rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: at(10 * 60000) })).rejects.toMatchObject({ code: 'TOO_SOON' });
  await expect(rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: at(20 * 24 * H) })).rejects.toMatchObject({ code: 'TOO_FAR' });
  await expect(rs.reschedule({ kind: 'helping', id: t._id, userId: new mongoose.Types.ObjectId(), scheduledAt: at(3 * H) })).rejects.toMatchObject({ status: 404 });

  const going = await task(user, 'EN_ROUTE');
  await expect(rs.reschedule({ kind: 'helping', id: going._id, userId: user, scheduledAt: at(3 * H) })).rejects.toMatchObject({ code: 'NOT_MOVABLE' });

  await rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: at(3 * H) });
  await rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: at(4 * H) });
  await expect(rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: at(6 * H) })).rejects.toMatchObject({ code: 'NOT_MOVABLE' });
  expect(await rs.view('helping', (await HelpingTask.findById(t._id).lean()))).toMatchObject({ allowed: false, left: 0 });
});

test('a booking for now that someone holds has no time to move', async () => {
  const user = new mongoose.Types.ObjectId();
  const t = await task(user, 'WORKER_ACCEPTED', { scheduledAt: null, workerId: new mongoose.Types.ObjectId() });
  expect(await rs.view('helping', t.toObject())).toMatchObject({ allowed: false });
});

test('a booking for now that nobody has taken can become one for later', async () => {
  const user = new mongoose.Types.ObjectId();
  const t = await task(user, 'WORKER_SEARCHING', { scheduledAt: null });
  expect(await rs.view('helping', t.toObject())).toMatchObject({ allowed: true, fromNow: true });
  const to = new Date(Date.now() + 3 * H);
  await rs.reschedule({ kind: 'helping', id: t._id, userId: user, scheduledAt: to.toISOString() });
  expect((await HelpingTask.findById(t._id).lean()).scheduledAt.getTime()).toBe(to.getTime());
});
