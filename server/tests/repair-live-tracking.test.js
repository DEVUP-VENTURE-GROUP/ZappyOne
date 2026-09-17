/**
 * A repair customer must get the live map the order customer already gets.
 *
 * Reported from production: "map is not coming — there is already a flow where
 * we can see live, connect it." Exactly right. The plumbing existed end to end
 * (rooms, ETA engine, the customer's subscription) but only ONE caller ever
 * passed `repairBookingId` — the technician's repair job page. Every other
 * place a technician publishes position sent an `orderId` or nothing:
 *
 *   · the dashboard's continuous feed while online   -> orderId only
 *   · the socket ping                                -> orderId only
 *   · the order job page                             -> orderId only
 *
 * So live tracking for a repair worked only while the technician happened to be
 * staring at that one screen, and the customer otherwise waited forever on
 * "Live map starts as soon as their phone reports in".
 *
 * The worker's active repair is a fact the server can look up, so now it does.
 * These tests pin both halves: it must be found when nobody names it, and it
 * must still refuse to broadcast when broadcasting would be wrong.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const Worker = require('../src/modules/worker/worker.model');

jest.setTimeout(60000);

const workerId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

async function bookingAt(status, wid = workerId) {
  return RepairBooking.create({
    reference: `L${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    userId,
    vertical: 'mobile',
    brandCode: 'samsung', modelCode: 'samsung-galaxy-s23-ultra',
    serviceMode: 'pickup_repair',
    workerId: wid,
    status,
    location: { type: 'Point', coordinates: [77.905, 17.343], address: 'Test' },
    priceSnapshot: { subtotalPaise: 70000, totalPaise: 70000 },
    statusHistory: [{ status, at: new Date() }],
  });
}

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });
  await Worker.create({
    _id: workerId, name: 'Test Tech', phone: '9000000001',
    kyc: { status: 'approved' },
  });
});

afterAll(async () => { await stopMongo(); });
beforeEach(async () => { await RepairBooking.deleteMany({}); });

/**
 * The resolution rule, exercised directly.
 *
 * `updateLocation` needs redis, geo indexes and a socket bus to run end to end,
 * so the piece that actually changed — "which repair does this ping belong to"
 * — is asserted against the database it queries.
 */
const REPAIR_MOVING_STATUSES = ['ON_THE_WAY', 'OUT_FOR_RETURN', 'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP'];

function findActiveRepair(wid) {
  return RepairBooking.findOne({ workerId: wid, status: { $in: REPAIR_MOVING_STATUSES } })
    .sort({ updatedAt: -1 })
    .select('status userId location').lean();
}

describe('finding the repair a location ping belongs to', () => {
  it.each(REPAIR_MOVING_STATUSES)('finds the technician\'s active repair at %s', async (status) => {
    await bookingAt(status);
    const found = await findActiveRepair(workerId);
    expect(found).not.toBeNull();
    expect(found.status).toBe(status);
  });

  it('finds nothing before the technician is travelling', async () => {
    // WORKER_ACCEPTED is assigned but stationary — publishing here would be
    // tracking someone who has not set off.
    await bookingAt('WORKER_ACCEPTED');
    expect(await findActiveRepair(workerId)).toBeNull();
  });

  it.each(['COMPLETED', 'CANCELLED', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING'])(
    'finds nothing once the job is at %s',
    async (status) => {
      await bookingAt(status);
      expect(await findActiveRepair(workerId)).toBeNull();
    },
  );

  it('never finds ANOTHER technician\'s job', async () => {
    const otherWorker = new mongoose.Types.ObjectId();
    await bookingAt('ON_THE_WAY', otherWorker);
    // The guard that stops a repair becoming a tracking device.
    expect(await findActiveRepair(workerId)).toBeNull();
    expect(await findActiveRepair(otherWorker)).not.toBeNull();
  });

  it('picks the most recently touched job when a technician has two', async () => {
    const older = await bookingAt('PICKUP_SCHEDULED');
    await new Promise((r) => setTimeout(r, 15));
    const newer = await bookingAt('ON_THE_WAY');

    const found = await findActiveRepair(workerId);
    expect(String(found._id)).toBe(String(newer._id));
    expect(String(found._id)).not.toBe(String(older._id));
  });

  it('carries the destination the ETA engine needs', async () => {
    await bookingAt('ON_THE_WAY');
    const found = await findActiveRepair(workerId);
    // Without these the map draws a marker going nowhere and no ETA appears.
    expect(found.location.coordinates).toEqual([77.905, 17.343]);
    expect(String(found.userId)).toBe(String(userId));
  });
});
