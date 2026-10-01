/**
 * The admin's view of live work: every kind on one board, and "stuck" judged
 * by each kind's own clock rather than one rule for everything.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const EventBooking = require('../src/modules/events/event-booking.model');
const ops = require('../src/modules/jobs/ops.service');

jest.setTimeout(60000);
const oid = () => new mongoose.Types.ObjectId();
const ago = (min) => new Date(Date.now() - min * 60000);
const HOME = { type: 'Point', coordinates: [78.39, 17.44], address: 'Madhapur' };
const insert = (Model, doc) => Model.collection.insertOne({ userId: oid(), createdAt: ago(1), ...doc });

beforeAll(startMongo);
afterAll(stopMongo);

test('every kind is on the board, and each is stuck by its own clock', async () => {
  await insert(RepairBooking, { status: 'CONFIRMED', location: HOME, statusHistory: [{ status: 'CONFIRMED', at: ago(25) }] });       // no provider, 25 min: stuck
  await insert(RepairBooking, { status: 'AT_WORKSHOP', location: HOME, statusHistory: [{ status: 'AT_WORKSHOP', at: ago(600) }] }); // a day at the workshop is normal
  await insert(RepairBooking, { status: 'COMPLETED', location: HOME, statusHistory: [] });                                         // finished: not live
  await insert(PetBooking, { status: 'SERVICE_STARTED', serviceLocation: HOME, checkOutAt: ago(-600), statusHistory: [{ status: 'SERVICE_STARTED', at: ago(900) }] }); // boarding, before checkout
  await insert(HelpingTask, { status: 'EN_ROUTE', pickupLocation: HOME, statusHistory: [{ status: 'EN_ROUTE', at: ago(90) }] });     // en route 90 min: stuck
  await insert(EventBooking, { status: 'confirmed', eventDate: ago(24 * 60), statusHistory: [] });                                  // date passed: stuck

  const live = await ops.liveJobs();
  expect(live.map((j) => j.kind).sort()).toEqual(['event', 'helping', 'pet', 'repair', 'repair']);

  const stuck = await ops.stuckJobs();
  expect(stuck.map((j) => `${j.kind}:${j.status}`).sort()).toEqual(['event:confirmed', 'helping:EN_ROUTE', 'repair:CONFIRMED']);
  expect(stuck.find((j) => j.kind === 'event').stuck).toBe('event date passed, not completed');

  expect(ops.summarise(live)).toMatchObject({ live: 5, stuck: 3, byKind: { repair: { live: 2, waiting: 1, stuck: 1 } } });
});
