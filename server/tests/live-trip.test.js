/**
 * Live tracking beyond orders: repairs, pet bookings and helping tasks.
 *
 *   - a customer may watch their own job's room, and nobody else's
 *   - a ping is routed to the trip the worker is actually on, whichever kind
 *   - only a trip to the customer earns "almost there"; a helper heading to a
 *     shop or a technician driving a device to the workshop does not
 *   - outside a travelling status nothing is shared
 *
 * Pet and helping documents are inserted raw: these rules read a handful of
 * fields, and the full booking flows have their own suites.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { redis } = require('../src/config/redis');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const { activeTrip, canWatchJob } = require('../src/modules/worker/active-trip');

jest.setTimeout(60000);

const oid = () => new mongoose.Types.ObjectId();
const HOME = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
const SHOP = { type: 'Point', coordinates: [78.3800, 17.4400], address: 'Inorbit' };

beforeAll(startMongo);
afterAll(stopMongo);
beforeEach(async () => {
  await redis.flushall();
  await Promise.all([RepairBooking.collection.deleteMany({}), PetBooking.collection.deleteMany({}), HelpingTask.collection.deleteMany({})]);
});

const repair = (doc) => RepairBooking.collection.insertOne({ updatedAt: new Date(), location: HOME, ...doc });
const pet = (doc) => PetBooking.collection.insertOne({ updatedAt: new Date(), serviceLocation: HOME, ...doc });
const task = (doc) => HelpingTask.collection.insertOne({ updatedAt: new Date(), ...doc });

describe('who may watch a job', () => {
  test('the customer, the assigned worker, the shop and admins; nobody else', async () => {
    const userId = oid(); const workerId = oid(); const shopId = oid();
    const { insertedId } = await repair({ userId, workerId, shopId, status: 'ON_THE_WAY' });
    const id = String(insertedId);
    expect(await canWatchJob(id, { id: userId, role: 'user' })).toBe(true);
    expect(await canWatchJob(id, { id: workerId, role: 'worker' })).toBe(true);
    expect(await canWatchJob(id, { id: shopId, role: 'shop' })).toBe(true);
    expect(await canWatchJob(id, { id: oid(), role: 'admin' })).toBe(true);
    expect(await canWatchJob(id, { id: oid(), role: 'user' })).toBe(false);
    expect(await canWatchJob(id, { id: oid(), role: 'worker' })).toBe(false);
  });

  test('works the same for pet bookings and helping tasks', async () => {
    const userId = oid();
    const p = await pet({ userId, status: 'PROVIDER_EN_ROUTE' });
    const t = await task({ userId, status: 'EN_ROUTE', serviceType: 'shopping' });
    expect(await canWatchJob(String(p.insertedId), { id: userId, role: 'user' })).toBe(true);
    expect(await canWatchJob(String(t.insertedId), { id: userId, role: 'user' })).toBe(true);
    expect(await canWatchJob(String(t.insertedId), { id: oid(), role: 'user' })).toBe(false);
  });

  test('an unknown id is refused', async () => {
    expect(await canWatchJob(String(oid()), { id: oid(), role: 'user' })).toBe(false);
  });
});

describe('which trip a ping belongs to', () => {
  test('a technician on the way to the customer: live, with an ETA to them', async () => {
    const workerId = oid();
    const { insertedId } = await repair({ userId: oid(), workerId, status: 'ON_THE_WAY' });
    const trip = await activeTrip(workerId, { fresh: true });
    expect(trip).toMatchObject({ kind: 'repair', id: String(insertedId), toCustomer: true, link: `/repair/bookings/${insertedId}` });
    expect(trip.dest).toEqual({ lng: 78.3915, lat: 17.4483 });
  });

  test('a device on its way to the workshop is live but not "arriving"', async () => {
    const workerId = oid();
    await repair({ userId: oid(), workerId, status: 'DEVICE_PICKED_UP' });
    const trip = await activeTrip(workerId, { fresh: true });
    expect(trip).toMatchObject({ kind: 'repair', dest: null, toCustomer: false });
  });

  test('a pet groomer heading to the owner', async () => {
    const workerId = oid();
    await pet({ userId: oid(), workerId, status: 'PROVIDER_EN_ROUTE', serviceMode: 'doorstep' });
    expect(await activeTrip(workerId, { fresh: true })).toMatchObject({ kind: 'pet', toCustomer: true });
  });

  test('a pet grooming session in progress is not a trip', async () => {
    const workerId = oid();
    await pet({ userId: oid(), workerId, status: 'SERVICE_STARTED', serviceMode: 'doorstep' });
    expect(await activeTrip(workerId, { fresh: true })).toBeNull();
  });

  test('a shopping helper: to the shop first (not "arriving"), then to the customer', async () => {
    const workerId = oid();
    const { insertedId } = await task({ userId: oid(), workerId, status: 'EN_ROUTE', serviceType: 'shopping', pickupLocation: SHOP, destination: HOME });
    expect(await activeTrip(workerId, { fresh: true })).toMatchObject({ kind: 'helping', toCustomer: false, dest: { lng: 78.38, lat: 17.44 } });

    await HelpingTask.collection.updateOne({ _id: insertedId }, { $set: { status: 'RETURNING' } });
    expect(await activeTrip(workerId, { fresh: true })).toMatchObject({ toCustomer: true, dest: { lng: 78.3915, lat: 17.4483 } });
  });

  test('a return: to the customer first, then to the store', async () => {
    const workerId = oid();
    const { insertedId } = await task({ userId: oid(), workerId, status: 'EN_ROUTE', serviceType: 'return', pickupLocation: HOME, destination: SHOP });
    expect(await activeTrip(workerId, { fresh: true })).toMatchObject({ toCustomer: true });
    await HelpingTask.collection.updateOne({ _id: insertedId }, { $set: { status: 'RETURNING' } });
    expect(await activeTrip(workerId, { fresh: true })).toMatchObject({ toCustomer: false });
  });

  test('once the provider has arrived, nothing is shared', async () => {
    const workerId = oid();
    await repair({ userId: oid(), workerId, status: 'ARRIVED' });
    await task({ userId: oid(), workerId, status: 'ARRIVED', serviceType: 'shopping', pickupLocation: SHOP });
    expect(await activeTrip(workerId, { fresh: true })).toBeNull();
  });

  test('a hint naming someone else\'s job is ignored', async () => {
    const workerId = oid();
    const other = await repair({ userId: oid(), workerId: oid(), status: 'ON_THE_WAY' });
    const mine = await pet({ userId: oid(), workerId, status: 'PROVIDER_EN_ROUTE' });
    const trip = await activeTrip(workerId, { hintId: String(other.insertedId) });
    expect(trip.id).toBe(String(mine.insertedId));
  });
});
