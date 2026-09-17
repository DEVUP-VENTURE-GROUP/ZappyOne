/**
 * Core repair-engine tests: booking state machine + pricing resolution.
 *
 * These two pieces carry the most business risk in the module — an illegal
 * state transition corrupts an order's history, and a wrong pricing resolution
 * charges a real customer the wrong amount. Both are therefore tested against
 * their failure cases, not just their happy paths.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { RepairBooking, TRANSITIONS, TERMINAL_STATUSES } = require('../src/modules/repair/models/booking.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const pricingService = require('../src/modules/repair/services/pricing.service');

jest.setTimeout(60000);

beforeAll(async () => { await startMongo(); });
afterAll(async () => { await stopMongo(); });

/** A booking shaped just enough to exercise transitions. */
function makeBooking(status = 'PENDING') {
  return new RepairBooking({
    reference: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: new mongoose.Types.ObjectId(),
    vertical: 'mobile',
    brandCode: 'samsung',
    modelCode: 'samsung-s23-ultra',
    serviceMode: 'doorstep',
    status,
    location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test address' },
    priceSnapshot: { subtotalPaise: 100000, totalPaise: 118000 },
  });
}

describe('booking state machine', () => {
  it('allows a legal forward transition and records history', () => {
    const b = makeBooking('PENDING');
    expect(b.applyTransition('CONFIRMED', { actorRole: 'system' })).toBe(true);
    expect(b.status).toBe('CONFIRMED');
    expect(b.statusHistory).toHaveLength(1);
    expect(b.statusHistory[0].status).toBe('CONFIRMED');
  });

  it('refuses an illegal jump and leaves state untouched', () => {
    const b = makeBooking('PENDING');
    // Skipping straight to completion must never be possible.
    expect(b.applyTransition('COMPLETED')).toBe(false);
    expect(b.status).toBe('PENDING');
    expect(b.statusHistory).toHaveLength(0);
  });

  it('refuses any transition out of a terminal state', () => {
    for (const terminal of TERMINAL_STATUSES) {
      const b = makeBooking(terminal);
      expect(b.applyTransition('REPAIR_IN_PROGRESS')).toBe(false);
      expect(b.status).toBe(terminal);
    }
  });

  it('permits cancellation only before work begins', () => {
    const early = makeBooking('CONFIRMED');
    expect(early.applyTransition('CANCELLED', { reason: 'changed mind' })).toBe(true);
    expect(early.cancelReason).toBe('changed mind');
    expect(early.cancelledAt).toBeInstanceOf(Date);

    // Once the device is open, cancelling is not a state change — it is a
    // refund/return problem, so the machine must refuse it.
    const midRepair = makeBooking('REPAIR_IN_PROGRESS');
    expect(midRepair.applyTransition('CANCELLED')).toBe(false);
    expect(midRepair.status).toBe('REPAIR_IN_PROGRESS');
  });

  it('stamps completedAt exactly once on completion', () => {
    const b = makeBooking('QA_PENDING');
    expect(b.applyTransition('COMPLETED')).toBe(true);
    expect(b.completedAt).toBeInstanceOf(Date);
  });

  it('routes the full pickup-and-repair path end to end', () => {
    const b = makeBooking('WORKER_ACCEPTED');
    const path = [
      'PICKUP_SCHEDULED', 'DEVICE_PICKED_UP', 'AT_WORKSHOP',
      'REPAIR_IN_PROGRESS', 'QA_PENDING', 'READY_FOR_RETURN',
      'OUT_FOR_RETURN', 'COMPLETED',
    ];
    for (const step of path) {
      expect({ step, ok: b.applyTransition(step) }).toEqual({ step, ok: true });
    }
    expect(b.status).toBe('COMPLETED');
    expect(b.statusHistory).toHaveLength(path.length);
  });

  it('declares no transition target that is not a real status', () => {
    const all = Object.keys(TRANSITIONS);
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const t of targets) {
        expect({ from, t, known: all.includes(t) }).toEqual({ from, t, known: true });
      }
    }
  });
});

describe('pricing resolution', () => {
  beforeAll(async () => {
    await RepairConfig.create({
      vertical: 'mobile',
    // Stated, not inherited: tax and commission are operator-set in admin and
    // default to 0/10, so a test asserting rupee amounts has to fix its own rates.
    taxPct: 18,
    commissionPct: 15,
    });
    await Repair.create({
      code: 'display_assembly_replacement',
      name: 'Display Assembly Replacement',
      vertical: 'mobile',
      pricingMode: 'range',
      warrantyDays: 180,
    });
    await Repair.create({
      code: 'motherboard_repair',
      name: 'Motherboard Repair',
      vertical: 'mobile',
      pricingMode: 'diagnosis_required',
      requiresDiagnosis: true,
    });

    // Three bands of increasing specificity for the same repair.
    await ZappyReferencePricing.create([
      { vertical: 'mobile', repairCode: 'display_assembly_replacement', minPaise: 100000, recommendedPaise: 120000, maxPaise: 150000 },
      { vertical: 'mobile', repairCode: 'display_assembly_replacement', brandCode: 'samsung', minPaise: 150000, recommendedPaise: 180000, maxPaise: 210000 },
      { vertical: 'mobile', repairCode: 'display_assembly_replacement', brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'premium', minPaise: 1800000, recommendedPaise: 2000000, maxPaise: 2300000 },
    ]);
  });

  it('prefers the narrowest matching band', async () => {
    const ref = await pricingService.resolveReferencePrice({
      repairCode: 'display_assembly_replacement',
      brandCode: 'samsung',
      modelCode: 'samsung-s23-ultra',
      qualityCode: 'premium',
      serviceMode: 'doorstep',
      cityCode: null,
    });
    expect(ref.recommendedPaise).toBe(2000000);
    expect(ref.resolutionPath).toContain('modelCode');
  });

  it('falls back to the brand band when the model is unknown', async () => {
    const ref = await pricingService.resolveReferencePrice({
      repairCode: 'display_assembly_replacement',
      brandCode: 'samsung',
      modelCode: 'samsung-a-something-unlisted',
      qualityCode: 'premium',
    });
    expect(ref.recommendedPaise).toBe(180000);
  });

  it('falls back to the national default for an unknown brand', async () => {
    const ref = await pricingService.resolveReferencePrice({
      repairCode: 'display_assembly_replacement',
      brandCode: 'nothing',
      modelCode: 'nothing-phone-2',
    });
    expect(ref.recommendedPaise).toBe(120000);
  });

  it('returns null rather than guessing when nothing is configured', async () => {
    const ref = await pricingService.resolveReferencePrice({ repairCode: 'no_such_repair' });
    expect(ref).toBeNull();
  });

  it('bands provider deviation green / yellow / red from config', async () => {
    const base = { vertical: 'mobile', referenceRecommendedPaise: 100000 };
    // defaults: green <= 15%, yellow <= 35%
    expect((await pricingService.evaluateDeviation({ ...base, totalPaise: 110000 })).band).toBe('green');
    expect((await pricingService.evaluateDeviation({ ...base, totalPaise: 130000 })).band).toBe('yellow');
    expect((await pricingService.evaluateDeviation({ ...base, totalPaise: 200000 })).band).toBe('red');
  });

  it('treats undercutting as green, never as an anomaly', async () => {
    const r = await pricingService.evaluateDeviation({
      vertical: 'mobile', referenceRecommendedPaise: 100000, totalPaise: 60000,
    });
    expect(r.band).toBe('green');
    expect(r.deviationPct).toBeLessThan(0);
  });

  it('never auto-approves when there is no reference to judge against', async () => {
    const r = await pricingService.evaluateDeviation({
      vertical: 'mobile', referenceRecommendedPaise: null, totalPaise: 500000,
    });
    expect(r.autoApprove).toBe(false);
    expect(r.reason).toBe('no_reference');
  });

  it('charges only the diagnosis fee for diagnosis-required repairs', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile',
      repairCode: 'motherboard_repair',
      referencePrice: { recommendedPaise: 900000, referencePricingId: null },
    });
    expect(snap.pricingMode).toBe('diagnosis_required');
    expect(snap.isEstimate).toBe(true);
    // The repair price must NOT leak into the up-front total.
    expect(snap.totalPaise).toBeLessThan(900000);
  });

  it('freezes tax, commission and fees into the snapshot', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: 'mobile',
      repairCode: 'display_assembly_replacement',
      providerPrice: { totalPaise: 200000, partPaise: 150000, labourPaise: 50000, warrantyDays: 180, providerPricingId: null, version: 1, resolutionPath: 'provider:modelCode' },
      serviceMode: 'doorstep',
    });
    expect(snap.subtotalPaise).toBe(200000);
    expect(snap.taxPaise).toBe(36000);      // 18% default
    expect(snap.totalPaise).toBe(236000);
    expect(snap.commissionPaise).toBe(30000); // 15% default
    expect(snap.isEstimate).toBe(false);
    expect(snap.snapshotAt).toBeInstanceOf(Date);
  });

  it('adds pickup and return legs only for pickup_repair', async () => {
    const doorstep = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'display_assembly_replacement',
      providerPrice: { totalPaise: 200000, pickupPaise: 5000, returnPaise: 5000 },
      serviceMode: 'doorstep',
    });
    const pickup = await pricingService.buildPriceSnapshot({
      vertical: 'mobile', repairCode: 'display_assembly_replacement',
      providerPrice: { totalPaise: 200000, pickupPaise: 5000, returnPaise: 5000 },
      serviceMode: 'pickup_repair',
    });
    expect(doorstep.pickupPaise).toBe(0);
    expect(pickup.pickupPaise).toBe(5000);
    expect(pickup.subtotalPaise).toBeGreaterThan(doorstep.subtotalPaise);
  });
});
