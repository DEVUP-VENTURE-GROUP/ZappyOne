jest.setTimeout(60000);

/**
 * Cancelling a repair costs something, and the customer is told what.
 *
 * Three things are being protected here:
 *   - A cancellation is priced from the status BEFORE it happens. Pricing it
 *     afterwards makes every cancellation free, because the booking is by then
 *     simply "cancelled".
 *   - Penalty money and earned money are never mixed. A fee is compensation for
 *     wasted time; an inspection already done is income the technician earned.
 *   - Cancelling twice cannot charge twice.
 */

const { startMongo, stopMongo } = require('./helpers');

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const CancellationFeeRecord = require('../src/modules/order/cancellation-shield.model');
const cancellationService = require('../src/modules/repair/services/cancellation.service');
const mongoose = require('mongoose');
const pricingService = require('../src/modules/repair/services/pricing.service');

const USER = new mongoose.Types.ObjectId();
const WORKER = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });
});

afterAll(async () => { await stopMongo(); });

afterEach(async () => {
  await Promise.all([
    RepairBooking.deleteMany({}),
    CancellationFeeRecord.deleteMany({}),
  ]);
  pricingService.invalidateConfigCache();
});

/** A booking at a given point in its life. */
async function makeBooking({ status, paymentStatus = 'unpaid', totalPaise = 250000, diagnosisFeePaise = 29900 }) {
  return RepairBooking.create({
    reference: `ZR${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    vertical: 'mobile',
    userId: USER,
    workerId: WORKER,
    status,
    paymentMethod: 'cash',
    paymentStatus,
    brandCode: 'samsung',
    modelCode: 'samsung-galaxy-s24',
    problemCodes: ['screen_cracked'],
    serviceMode: 'doorstep',
    location: { address: 'Somewhere', coordinates: [78.44, 17.43] },
    priceSnapshot: {
      subtotalPaise: totalPaise,
      totalPaise,
      diagnosisFeePaise,
    },
  });
}

describe('what cancelling costs', () => {
  it('is free before anyone has been sent', async () => {
    const booking = await makeBooking({ status: 'CONFIRMED' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.allowed).toBe(true);
    expect(quote.stage).toBe('created');
    expect(quote.feePaise).toBe(0);
    expect(quote.message).toMatch(/free of charge/i);
  });

  it('charges once a technician is travelling', async () => {
    const booking = await makeBooking({ status: 'ON_THE_WAY' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.stage).toBe('on_the_way');
    expect(quote.feePaise).toBeGreaterThan(0);
  });

  it('charges more once they have arrived than while they were driving', async () => {
    const driving = await cancellationService.quoteCancellation(
      await makeBooking({ status: 'ON_THE_WAY' }), { userId: USER },
    );
    const arrived = await cancellationService.quoteCancellation(
      await makeBooking({ status: 'ARRIVED' }), { userId: USER },
    );

    expect(arrived.feePaise).toBeGreaterThan(driving.feePaise);
  });

  /**
   * The distinction that matters most: an inspection that happened is income,
   * not a punishment, and must not be dressed up as a cancellation fee.
   */
  it('separates the inspection already done from the cancellation penalty', async () => {
    const booking = await makeBooking({ status: 'DIAGNOSING' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.earnedPaise).toBe(29900);
    expect(quote.feePaise).toBeGreaterThan(0);
    expect(quote.earnedPaise).not.toBe(quote.feePaise);
    expect(quote.message).toMatch(/inspection already done/i);
  });

  it('does not charge for an inspection that never happened', async () => {
    const booking = await makeBooking({ status: 'WORKER_ACCEPTED' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.earnedPaise).toBe(0);
  });

  it('refuses to cancel once the device is open', async () => {
    const booking = await makeBooking({ status: 'REPAIR_IN_PROGRESS' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.allowed).toBe(false);
    expect(quote.reason).toBe('work_started');
    expect(quote.message).toMatch(/support/i);
  });

  it('refuses a booking that is already closed', async () => {
    const booking = await makeBooking({ status: 'COMPLETED' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.allowed).toBe(false);
    expect(quote.reason).toBe('already_closed');
  });
});

describe('refunds', () => {
  it('returns what was paid, less the fee and the work already done', async () => {
    const booking = await makeBooking({ status: 'DIAGNOSING', paymentStatus: 'paid', totalPaise: 250000 });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    expect(quote.paidPaise).toBe(250000);
    expect(quote.refundPaise).toBe(250000 - quote.feePaise - quote.earnedPaise);
    expect(quote.message).toMatch(/refund/i);
  });

  it('never refunds more than was actually paid', async () => {
    const booking = await makeBooking({ status: 'ARRIVED', paymentStatus: 'unpaid' });
    const quote = await cancellationService.quoteCancellation(booking, { userId: USER });

    // Nothing was handed over on a cash job, so there is nothing to give back —
    // but the fee still stands and is collected on the next booking.
    expect(quote.paidPaise).toBe(0);
    expect(quote.refundPaise).toBe(0);
    expect(quote.feePaise).toBeGreaterThan(0);
  });
});

describe('recording it', () => {
  it('writes one fee record against the booking', async () => {
    const booking = await makeBooking({ status: 'ON_THE_WAY' });
    const result = await cancellationService.assess(booking, { userId: USER });

    expect(result.feeRecord).toBeTruthy();
    const row = await CancellationFeeRecord.findOne({ repairBookingId: booking._id }).lean();
    expect(row.kind).toBe('repair');
    expect(row.cancelledAtStage).toBe('on_the_way');
    expect(row.workerId.toString()).toBe(WORKER.toString());
    // The order id must be absent, not null — the sparse index depends on it.
    expect(row.orderId).toBeUndefined();
  });

  it('cannot charge the same booking twice', async () => {
    const booking = await makeBooking({ status: 'ARRIVED' });

    await cancellationService.assess(booking, { userId: USER });
    const second = await cancellationService.assess(booking, { userId: USER });

    expect(second.alreadyAssessed).toBe(true);
    expect(await CancellationFeeRecord.countDocuments({ repairBookingId: booking._id })).toBe(1);
  });

  /**
   * Repeat cancellers are priced by how often they cancel, and a repair
   * cancellation has to count towards that — otherwise someone could cancel on
   * a technician every week and be treated as a first-timer each time.
   */
  it('counts a repair cancellation towards the next one', async () => {
    const shield = require('../src/modules/order/shield.service');

    expect(await shield.countRecentUserCancels(USER)).toBe(0);
    await cancellationService.assess(await makeBooking({ status: 'ARRIVED' }), { userId: USER });
    expect(await shield.countRecentUserCancels(USER)).toBe(1);
  });
});

/**
 * Online payment must not be offered, or accepted, without a gateway.
 *
 * The flag existed on RepairConfig from the start but nothing read it, so a
 * client could request `online` and receive a booking the platform had no means
 * of charging: completed work, no money, and no error anywhere explaining it.
 */
describe('paying without a gateway', () => {
  const bookingService = require('../src/modules/repair/services/booking.service');

  it('refuses an online booking while no gateway is configured', async () => {
    await expect(bookingService.createBooking({
      vertical: 'mobile',
      userId: USER,
      brandCode: 'samsung',
      modelCode: 'samsung-galaxy-s24',
      problemCodes: ['screen_cracked'],
      serviceMode: 'doorstep',
      paymentMethod: 'online',
      location: { address: 'Somewhere', coordinates: [78.44, 17.43] },
      idempotencyKey: 'pay-gate-1',
    })).rejects.toMatchObject({ code: 'ONLINE_PAYMENTS_DISABLED' });
  });

  it('says cash is the way to pay, rather than failing silently', async () => {
    await expect(bookingService.createBooking({
      vertical: 'mobile',
      userId: USER,
      brandCode: 'samsung',
      modelCode: 'samsung-galaxy-s24',
      problemCodes: ['screen_cracked'],
      serviceMode: 'doorstep',
      paymentMethod: 'online',
      location: { address: 'Somewhere', coordinates: [78.44, 17.43] },
      idempotencyKey: 'pay-gate-2',
    })).rejects.toThrow(/cash/i);
  });
});

/**
 * The provider's price is the whole price, and logistics scale with distance.
 *
 * Two things this protects:
 *   - A shop that quotes ₹750 for a screen means ₹750 all-in. Inventing a "part"
 *     and a "labour" line from a national band describes a price nobody set, and
 *     showed customers ₹1,638 against that shop's ₹750.
 *   - Collection was a flat ₹99 whether the device was two streets or thirty
 *     kilometres away, which robs the near customer or the far technician.
 */
describe('pricing shape', () => {
  const pricingSvc = require('../src/modules/repair/services/pricing.service');
  const { RepairConfig: Cfg } = require('../src/modules/repair/models/config.model');
  const { Repair: Rep } = require('../src/modules/repair/models/repair.model');

  beforeAll(async () => {
    await Cfg.updateMany({ vertical: 'mobile' }, {
      $set: {
        pickupBaseFeePaise: 3000, pickupPerKmPaise: 800, pickupFreeKm: 2, pickupMaxFeePaise: 25000,
        taxPct: 0, platformFeePaise: 0, commissionPct: 15,
      },
    });
    await Rep.updateOne(
      { code: 'battery_replacement', vertical: 'mobile' },
      { $set: { pricingMode: 'fixed' } },
    );
    pricingSvc.invalidateConfigCache();
  });

  const provider = { totalPaise: 75000, partPaise: 0, labourPaise: 0, resolutionPath: 'provider:test' };
  const reference = {
    minPaise: 70000, recommendedPaise: 130000, maxPaise: 260000,
    // The reference row's own field names — `partCostPaise`, not `partPaise`.
    partCostPaise: 70000, labourPaise: 60000, resolutionPath: 'reference:default',
  };

  it("uses the provider's number whole, with no invented breakdown", async () => {
    const snap = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference, serviceMode: 'workshop',
    });

    expect(snap.totalPaise).toBe(75000);
    expect(snap.partPaise).toBe(0);
    expect(snap.labourPaise).toBe(0);
    expect(snap.resolutionPath).toBe('provider:test');
  });

  it('keeps the part/labour split when the price came from the reference band', async () => {
    const snap = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: null, referencePrice: reference, serviceMode: 'workshop',
    });

    expect(snap.partPaise).toBeGreaterThan(0);
    expect(snap.labourPaise).toBeGreaterThan(0);
  });

  it('charges nothing extra for collection inside the free radius', async () => {
    const snap = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference,
      serviceMode: 'pickup_repair', distanceKm: 1,
    });
    // Base only — no per-km charge within the free radius.
    expect(snap.pickupPaise).toBe(3000);
  });

  it('scales collection with distance', async () => {
    const near = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference, serviceMode: 'pickup_repair', distanceKm: 3,
    });
    const far = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference, serviceMode: 'pickup_repair', distanceKm: 20,
    });

    expect(far.pickupPaise).toBeGreaterThan(near.pickupPaise);
    // ₹30 base + ₹8 × (20 - 2) free km.
    expect(far.pickupPaise).toBe(3000 + 18 * 800);
  });

  it('caps collection so nobody is shocked', async () => {
    const snap = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference, serviceMode: 'pickup_repair', distanceKm: 500,
    });
    expect(snap.pickupPaise).toBe(25000);
  });

  it('adds nothing for collection when the device is not being collected', async () => {
    const snap = await pricingSvc.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: provider, referencePrice: reference, serviceMode: 'doorstep', distanceKm: 40,
    });
    expect(snap.pickupPaise).toBe(0);
    expect(snap.returnPaise).toBe(0);
    expect(snap.totalPaise).toBe(75000);
  });
});
