/**
 * Stage clocks — the part of the flow a customer feels without being shown.
 *
 * A repair is handed to one provider, so the timings are a working person's:
 * ten minutes to answer, ten to get moving, ten to finish, ten to hand back.
 * What is tested here is that the clock is fair — it stops when we are waiting
 * on the customer — and that the only stage acted on automatically is the one
 * where the customer is waiting on nobody.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo, passHandoverGates } = require('./helpers');

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const bookingService = require('../src/modules/repair/services/booking.service');
const slaService = require('../src/modules/repair/services/sla.service');
const { sweep } = require('../src/jobs/repair-sla.worker');

jest.setTimeout(90000);

const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const loc = { coordinates: [78.4, 17.4], address: 'Test address' };

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });
  await Repair.create({
    code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile',
    pricingMode: 'fixed', minSkillLevel: 1, allowedServiceModes: ['doorstep'], warrantyDays: 180,
  });
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement',
    minPaise: 150000, recommendedPaise: 200000, maxPaise: 300000,
  });
});

afterAll(async () => { await stopMongo(); });

async function newBooking(key) {
  const { booking } = await bookingService.createBooking({
    userId, brandCode: 'samsung', modelCode: 'samsung-s23',
    repairCode: 'battery_replacement', serviceMode: 'doorstep',
    workerId, location: loc, idempotencyKey: key,
  });

  // The customer gave their handover codes; this suite is not about that.
  await passHandoverGates(booking._id);
  return RepairBooking.findById(booking._id);
}

describe('stage clocks', () => {
  it('gives the provider a working window to answer, not a ping', async () => {
    const booking = await newBooking('sla-1');

    expect(booking.status).toBe('PROVIDER_ASSIGNED');
    const minutes = Math.round((booking.stageDeadlineAt - Date.now()) / 60000);
    // Ten minutes: they are mid-job and the work is theirs alone.
    expect(minutes).toBeGreaterThanOrEqual(9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it('resets the clock at each stage', async () => {
    const booking = await newBooking('sla-2');
    const acceptDue = booking.stageDeadlineAt;

    const moved = await bookingService.transition(booking._id, 'WORKER_ACCEPTED', {
      actorRole: 'worker', actorId: workerId,
    });

    expect(moved.stageDeadlineAt).not.toEqual(acceptDue);
    expect(moved.stageDeadlineAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stops the clock while the customer is deciding', async () => {
    const booking = await newBooking('sla-3');
    for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'QUOTE_PENDING']) {
      await bookingService.transition(booking._id, s, { actorRole: 'worker', actorId: workerId });
    }

    const waiting = await RepairBooking.findById(booking._id);
    // No deadline while the ball is in the customer's court — a technician who
    // asked a question is not late for the answer.
    expect(waiting.stageDeadlineAt).toBeNull();
    expect(waiting.slaPausedAt).toBeTruthy();
    expect(slaService.progressOf(waiting).paused).toBe(true);
  });

  it('banks the customer\'s thinking time instead of charging it to the provider', async () => {
    const booking = await RepairBooking.findOne({ idempotencyKey: 'sla-3' });
    // The customer took a while to answer.
    await RepairBooking.updateOne(
      { _id: booking._id },
      { $set: { slaPausedAt: new Date(Date.now() - 5 * 60 * 1000) } },
    );

    await bookingService.transition(booking._id, 'CUSTOMER_APPROVAL_PENDING', { actorRole: 'worker', actorId: workerId });
    const resumed = await bookingService.transition(booking._id, 'APPROVED', { actorRole: 'customer', actorId: userId });

    expect(resumed.slaPausedMs).toBeGreaterThan(4 * 60 * 1000);
  });

  it('takes back a job the provider never answered', async () => {
    const booking = await newBooking('sla-4');
    // The window passed.
    await RepairBooking.updateOne(
      { _id: booking._id },
      { $set: { stageDeadlineAt: new Date(Date.now() - 60 * 1000) } },
    );

    const result = await sweep();
    expect(result.reclaimed).toBeGreaterThanOrEqual(1);

    const after = await RepairBooking.findById(booking._id).lean();
    expect(after.status).toBe('CONFIRMED');
    expect(after.workerId).toBeNull();
    expect(after.declines[0].reason).toBe('no_response');
    expect(after.slaBreaches[0].stage).toBe('accept');
  });

  it('flags a slow repair without cancelling work already under way', async () => {
    const booking = await newBooking('sla-5');
    for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS']) {
      await bookingService.transition(booking._id, s, { actorRole: 'worker', actorId: workerId });
    }
    await RepairBooking.updateOne(
      { _id: booking._id },
      { $set: { stageDeadlineAt: new Date(Date.now() - 3 * 60 * 1000) } },
    );

    await sweep();

    const after = await RepairBooking.findById(booking._id).lean();
    // Flagged, but the technician keeps the job — their hands are in the device.
    expect(after.status).toBe('REPAIR_IN_PROGRESS');
    expect(String(after.workerId)).toBe(String(workerId));
    expect(after.slaBreaches.some((b) => b.stage === 'ready')).toBe(true);
  });

  it('does not record the same overrun once a minute', async () => {
    const booking = await RepairBooking.findOne({ idempotencyKey: 'sla-5' });
    await sweep();
    await sweep();

    const after = await RepairBooking.findById(booking._id).lean();
    expect(after.slaBreaches.filter((b) => b.stage === 'ready')).toHaveLength(1);
  });
});
