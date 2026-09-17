/**
 * Inspection bookings + service-mode economics.
 *
 * An inspection is a product in its own right: the customer pays ZappyOne for a
 * technician's time and an honest diagnosis, with no obligation to repair. The
 * rules that make that fair — and that stop it reading as a bait charge — are:
 *
 *   - the fee is the platform's, so no provider commission is split from it
 *   - a repair is never assumed; the booking carries no repairCode
 *   - if the customer then goes ahead, the fee they already PAID comes off the
 *     repair bill, so one visit is never billed twice
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairQuote } = require('../src/modules/repair/models/quote.model');
const pricingService = require('../src/modules/repair/services/pricing.service');
const bookingService = require('../src/modules/repair/services/booking.service');

jest.setTimeout(60000);

const userId = new mongoose.Types.ObjectId();
const workerId = new mongoose.Types.ObjectId();
const INSPECTION_FEE = 29900;   // ₹299

const loc = { coordinates: [78.3489, 17.44], address: '12 Test Street', cityCode: 'hyderabad' };

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({
    vertical: 'mobile',
    // Stated, not inherited: tax and commission are operator-set in admin and
    // default to 0/10, so a test asserting rupee amounts has to fix its own rates.
    taxPct: 18,
    commissionPct: 15,
    diagnosisFeePaise: INSPECTION_FEE,
    inspectionFeeCreditedOnRepair: true,
    pickupFeePaise: 10000,
    returnFeePaise: 10000,
  });

  await Repair.insertMany([
    {
      code: 'display_assembly_replacement', name: 'Display Assembly Replacement',
      vertical: 'mobile', pricingMode: 'range', minSkillLevel: 3, warrantyDays: 180,
      // Deliberately NOT doorstep-capable, to prove mode filtering is enforced.
      allowedServiceModes: ['workshop', 'pickup_repair'],
    },
    {
      code: 'battery_replacement', name: 'Battery Replacement',
      vertical: 'mobile', pricingMode: 'fixed', minSkillLevel: 2, warrantyDays: 180,
      allowedServiceModes: ['doorstep', 'workshop', 'pickup_repair'],
    },
  ]);

  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement',
    minPaise: 90000, recommendedPaise: 100000, maxPaise: 120000,
  });
});

afterAll(async () => { await stopMongo(); });

describe('inspection pricing', () => {
  it('charges only the inspection fee, with tax', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement', serviceMode: 'diagnosis_only',
    });
    expect(snap.diagnosisFeePaise).toBe(INSPECTION_FEE);
    expect(snap.subtotalPaise).toBe(INSPECTION_FEE);
    expect(snap.taxPaise).toBe(Math.round(INSPECTION_FEE * 0.18));
    expect(snap.totalPaise).toBe(INSPECTION_FEE + Math.round(INSPECTION_FEE * 0.18));
  });

  it('takes no provider commission from the inspection fee', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement', serviceMode: 'diagnosis_only',
    });
    // The fee is ZappyOne's, not a job the provider is being paid a share of.
    expect(snap.commissionPaise).toBe(0);
  });

  it('is a firm price, not an estimate', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement', serviceMode: 'diagnosis_only',
    });
    // The customer knows exactly what an inspection costs before booking.
    expect(snap.isEstimate).toBe(false);
    expect(snap.resolutionPath).toBe('inspection_only');
  });

  it('prices an inspection even when no repair has been chosen', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: null, serviceMode: 'diagnosis_only',
    });
    expect(snap.totalPaise).toBeGreaterThan(0);
  });
});

describe('service mode rules', () => {
  it('refuses a mode the repair does not support', async () => {
    await expect(bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      repairCode: 'display_assembly_replacement',
      serviceMode: 'doorstep',            // repair is workshop/pickup only
      location: loc, idempotencyKey: 'insp-mode-1',
    })).rejects.toMatchObject({ code: 'SERVICE_MODE_NOT_ALLOWED' });
  });

  it('allows an inspection regardless of the repair’s own modes', async () => {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      problemCodes: [],
      serviceMode: 'diagnosis_only',
      location: loc, idempotencyKey: 'insp-mode-2',
    });
    // Looking at a device is always possible, whatever the repair needs.
    expect(booking.serviceMode).toBe('diagnosis_only');
    expect(booking.repairCode).toBeNull();
    expect(booking.priceSnapshot.totalPaise).toBeGreaterThan(0);
  });

  it('adds pickup and return legs only for pickup_repair', async () => {
    const workshop = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: { totalPaise: 100000 }, serviceMode: 'workshop',
    });
    const pickup = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'battery_replacement',
      providerPrice: { totalPaise: 100000 }, serviceMode: 'pickup_repair',
    });

    expect(workshop.pickupPaise).toBe(0);
    expect(pickup.pickupPaise).toBe(10000);
    expect(pickup.returnPaise).toBe(10000);
    expect(pickup.subtotalPaise).toBe(workshop.subtotalPaise + 20000);
  });
});

describe('inspection → repair conversion', () => {
  /** Drive an inspection booking to the point where a quote can be raised. */
  async function inspectionAtQuoteStage(key, { paid }) {
    const { booking } = await bookingService.createBooking({
      userId, brandCode: 'samsung', modelCode: 'samsung-s23-ultra',
      serviceMode: 'diagnosis_only', workerId,
      location: loc, idempotencyKey: key,
    });

    if (paid) {
      await RepairBooking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'paid' } });
    }

    // A booking with a provider is already PROVIDER_ASSIGNED on creation.
    for (const s of ['WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED']) {
      await bookingService.transition(booking._id, s, { actorRole: 'worker', actorId: workerId });
    }
    return booking;
  }

  it('credits a PAID inspection fee against the repair quote', async () => {
    const booking = await inspectionAtQuoteStage('insp-convert-paid', { paid: true });
    const feeCharged = booking.priceSnapshot.totalPaise;

    const { quote } = await bookingService.submitQuote({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
      diagnosisSummary: 'Battery health at 62%, replacement recommended.',
      repairCode: 'battery_replacement', warrantyDays: 180,
      items: [{ kind: 'part', label: 'Battery', unitPricePaise: 100000, quantity: 1 }],
    });

    const { booking: after } = await bookingService.respondToQuote({
      quoteId: quote._id, userId, decision: 'approve',
    });

    expect(after.priceSnapshot.inspectionCreditPaise).toBe(feeCharged);
    expect(after.priceSnapshot.totalPaise).toBe(quote.totalPaise - feeCharged);
    // The credit means the earlier payment no longer settles the booking.
    expect(after.paymentStatus).toBe('unpaid');
  });

  it('does not credit an inspection fee that was never paid', async () => {
    const booking = await inspectionAtQuoteStage('insp-convert-unpaid', { paid: false });

    const { quote } = await bookingService.submitQuote({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
      diagnosisSummary: 'Battery replacement recommended.',
      repairCode: 'battery_replacement',
      items: [{ kind: 'part', label: 'Battery', unitPricePaise: 100000, quantity: 1 }],
    });
    const { booking: after } = await bookingService.respondToQuote({
      quoteId: quote._id, userId, decision: 'approve',
    });

    expect(after.priceSnapshot.inspectionCreditPaise).toBe(0);
    expect(after.priceSnapshot.totalPaise).toBe(quote.totalPaise);
  });

  it('honours the admin switch that turns crediting off', async () => {
    await RepairConfig.updateMany({ vertical: 'mobile' }, { $set: { inspectionFeeCreditedOnRepair: false } });
    pricingService.invalidateConfigCache();

    const booking = await inspectionAtQuoteStage('insp-convert-nocredit', { paid: true });
    const { quote } = await bookingService.submitQuote({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
      diagnosisSummary: 'Battery replacement recommended.',
      repairCode: 'battery_replacement',
      items: [{ kind: 'part', label: 'Battery', unitPricePaise: 100000, quantity: 1 }],
    });
    const { booking: after } = await bookingService.respondToQuote({
      quoteId: quote._id, userId, decision: 'approve',
    });

    expect(after.priceSnapshot.inspectionCreditPaise).toBe(0);
    expect(after.priceSnapshot.totalPaise).toBe(quote.totalPaise);

    await RepairConfig.updateMany({ vertical: 'mobile' }, { $set: { inspectionFeeCreditedOnRepair: true } });
    pricingService.invalidateConfigCache();
  });

  it('never credits more than the repair itself costs', async () => {
    const booking = await inspectionAtQuoteStage('insp-convert-tiny', { paid: true });

    // A repair cheaper than the inspection fee must not produce a negative bill.
    const { quote } = await bookingService.submitQuote({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
      diagnosisSummary: 'Only a port clean needed.',
      repairCode: 'battery_replacement',
      items: [{ kind: 'labour', label: 'Port cleaning', unitPricePaise: 5000, quantity: 1 }],
    });
    const { booking: after } = await bookingService.respondToQuote({
      quoteId: quote._id, userId, decision: 'approve',
    });

    expect(after.priceSnapshot.totalPaise).toBe(0);
    expect(after.priceSnapshot.totalPaise).toBeGreaterThanOrEqual(0);
  });

  it('leaves the inspection booking complete if the customer declines', async () => {
    const booking = await inspectionAtQuoteStage('insp-convert-decline', { paid: true });
    const { quote } = await bookingService.submitQuote({
      bookingId: booking._id, actorRole: 'worker', actorId: workerId,
      diagnosisSummary: 'Motherboard damage — repair not economical.',
      repairCode: 'battery_replacement',
      items: [{ kind: 'part', label: 'Board', unitPricePaise: 900000, quantity: 1 }],
    });

    const { booking: after } = await bookingService.respondToQuote({
      quoteId: quote._id, userId, decision: 'reject', reason: 'Too expensive',
    });

    expect(after.status).toBe('REJECTED');
    // The customer still received (and paid for) a real diagnosis.
    const stored = await RepairQuote.findById(quote._id).lean();
    expect(stored.diagnosisSummary).toContain('Motherboard damage');
  });
});
