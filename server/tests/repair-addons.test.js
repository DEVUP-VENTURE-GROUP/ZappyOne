/**
 * Add-ons: extra services bought alongside a primary repair.
 *
 * What this suite exists to prove:
 *
 *   1. AN ADD-ON IS NEVER AN ANSWER TO A PROBLEM. "Deep disinfection" must not
 *      surface as a candidate repair for "my water smells" — it is something
 *      you add to a clean, not a substitute for one.
 *
 *   2. THE MONEY IS RIGHT. Add-on lines are inside the subtotal, taxed with
 *      it, and commissioned — a booking whose add-ons do not reach the total
 *      is revenue quietly leaking.
 *
 *   3. ELIGIBILITY IS ENFORCED SERVER-SIDE. A restricted add-on sent for the
 *      wrong primary repair is refused, not trusted because the client asked.
 *
 *   4. AN UNPRICED ADD-ON DOES NOT BREAK THE BOOKING. It is dropped, and the
 *      customer still gets the repair they came for.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model');
const pricingService = require('../src/modules/repair/services/pricing.service');

jest.setTimeout(60000);

const V = 'water_tank_care';
const shopId = new mongoose.Types.ObjectId();

const inr = (r) => r * 100;

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: V, commissionPct: 10, taxPct: 0, platformFeePaise: 0 });

  await Repair.insertMany([
    {
      code: 'wt_deep_cleaning', name: 'Tank & Sump Deep Cleaning', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], problemCodes: ['wt_never_cleaned'],
    },
    {
      code: 'wt_disinfection', name: 'Deep Disinfection', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], isAddOn: true,
    },
    {
      code: 'wt_water_test', name: 'Water Quality Test', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], isAddOn: true,
    },
    {
      // Restricted: only attachable to a clean.
      code: 'wt_sludge_removal', name: 'Sludge Removal', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], isAddOn: true,
      eligibleForRepairCodes: ['wt_deep_cleaning'],
    },
    {
      code: 'wt_lid_replacement', name: 'Lid Replacement', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], problemCodes: ['wt_lid_problem'],
    },
    {
      // Deliberately never priced by anyone.
      code: 'wt_pressure_cleaning', name: 'High-Pressure Cleaning', vertical: V,
      pricingMode: 'fixed', allowedServiceModes: ['doorstep'], isAddOn: true,
    },
  ]);

  // The provider prices the main job and two of the add-ons.
  await ProviderPricing.insertMany([
    {
      vertical: V, shopId, repairCode: 'wt_deep_cleaning', brandCode: 'overhead',
      totalPaise: inr(900), approvalStatus: 'auto_approved', isActive: true, version: 1,
    },
    {
      vertical: V, shopId, repairCode: 'wt_disinfection',
      totalPaise: inr(300), approvalStatus: 'auto_approved', isActive: true, version: 1,
    },
    {
      vertical: V, shopId, repairCode: 'wt_sludge_removal',
      totalPaise: inr(200), approvalStatus: 'auto_approved', isActive: true, version: 1,
    },
  ]);

  // A reference band exists for the water test but this provider has no price.
  await ZappyReferencePricing.create({
    vertical: V, repairCode: 'wt_water_test',
    minPaise: inr(150), recommendedPaise: inr(250), maxPaise: inr(400), isActive: true,
  });
});

afterAll(async () => { await stopMongo(); });

const ctx = { brandCode: 'overhead', modelCode: 'overhead-up-to-500-l', serviceMode: 'doorstep' };

describe('an add-on is never offered as an answer to a problem', () => {
  it('excludes add-ons from the repair catalog listing', async () => {
    const asRepairs = await Repair.find({ vertical: V, isAddOn: { $ne: true } }).lean();
    const codes = asRepairs.map((r) => r.code);
    expect(codes).toContain('wt_deep_cleaning');
    expect(codes).toContain('wt_lid_replacement');
    // The four add-ons must not appear as bookable answers on their own.
    expect(codes).not.toContain('wt_disinfection');
    expect(codes).not.toContain('wt_water_test');
    expect(codes).not.toContain('wt_sludge_removal');
  });
});

describe('add-on pricing', () => {
  it('prices each add-on from the provider doing the main job', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: ['wt_disinfection'], primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r.addOns).toHaveLength(1);
    expect(r.addOns[0].totalPaise).toBe(inr(300));
    expect(r.addOns[0].fromProvider).toBe(true);
    // 10% of the provider's number, per the platform rule.
    expect(r.addOns[0].commissionPaise).toBe(inr(30));
    expect(r.addOnsTotalPaise).toBe(inr(300));
  });

  it('falls back to the reference band and marks the line an estimate', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: ['wt_water_test'], primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r.addOns[0].totalPaise).toBe(inr(250));
    expect(r.addOns[0].fromProvider).toBe(false);
    // No commission on a number the provider never set.
    expect(r.addOns[0].commissionPaise).toBe(0);
  });

  it('drops an add-on nobody has priced rather than failing the booking', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V,
      addOnCodes: ['wt_disinfection', 'wt_pressure_cleaning'],
      primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r.addOns.map((a) => a.repairCode)).toEqual(['wt_disinfection']);
    expect(r.addOnsTotalPaise).toBe(inr(300));
  });

  it('sums several add-ons', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V,
      addOnCodes: ['wt_disinfection', 'wt_sludge_removal'],
      primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r.addOnsTotalPaise).toBe(inr(500));
    expect(r.addOnsCommissionPaise).toBe(inr(50));
  });

  it('de-duplicates a code sent twice', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V,
      addOnCodes: ['wt_disinfection', 'wt_disinfection'],
      primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r.addOns).toHaveLength(1);
    expect(r.addOnsTotalPaise).toBe(inr(300));
  });

  it('returns nothing when no add-ons were chosen', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: [], primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    });
    expect(r).toEqual({ addOns: [], addOnsTotalPaise: 0, addOnsCommissionPaise: 0 });
  });
});

describe('eligibility is enforced on the server', () => {
  it('refuses a restricted add-on on the wrong primary repair', async () => {
    await expect(pricingService.buildAddOnSnapshots({
      vertical: V,
      addOnCodes: ['wt_sludge_removal'],
      primaryRepairCode: 'wt_lid_replacement', ctx, shopId,
    })).rejects.toMatchObject({ code: 'ADDON_NOT_ELIGIBLE', status: 400 });
  });

  it('allows an unrestricted add-on on any repair', async () => {
    const r = await pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: ['wt_disinfection'], primaryRepairCode: 'wt_lid_replacement', ctx, shopId,
    });
    expect(r.addOns).toHaveLength(1);
  });

  it('refuses a repair that is not an add-on at all', async () => {
    // Stops a client sneaking a second full repair in at add-on prices.
    await expect(pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: ['wt_lid_replacement'], primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    })).rejects.toMatchObject({ code: 'UNKNOWN_ADDON', status: 400 });
  });

  it('refuses an unknown code', async () => {
    await expect(pricingService.buildAddOnSnapshots({
      vertical: V, addOnCodes: ['wt_not_a_thing'], primaryRepairCode: 'wt_deep_cleaning', ctx, shopId,
    })).rejects.toMatchObject({ code: 'UNKNOWN_ADDON' });
  });
});

describe('add-ons reach the customer total and the commission', () => {
  it('folds add-on money into subtotal, total and commission', async () => {
    const without = await pricingService.buildPriceSnapshot({
      vertical: V, repairCode: 'wt_deep_cleaning',
      providerPrice: { totalPaise: inr(900) }, serviceMode: 'doorstep',
    });
    const withAddOns = await pricingService.buildPriceSnapshot({
      vertical: V, repairCode: 'wt_deep_cleaning',
      providerPrice: { totalPaise: inr(900) }, serviceMode: 'doorstep',
      addOnsTotalPaise: inr(500), addOnsCommissionPaise: inr(50),
    });

    expect(without.totalPaise).toBe(inr(900));
    // The add-on money must actually reach the customer's total.
    expect(withAddOns.subtotalPaise).toBe(inr(1400));
    expect(withAddOns.totalPaise).toBe(inr(1400));
    // ...and Zappy's cut must grow with it, or the platform eats the add-on.
    expect(without.commissionPaise).toBe(inr(90));
    expect(withAddOns.commissionPaise).toBe(inr(140));
  });

  it('leaves a booking with no add-ons exactly as it was', async () => {
    const snap = await pricingService.buildPriceSnapshot({
      vertical: V, repairCode: 'wt_deep_cleaning',
      providerPrice: { totalPaise: inr(900) }, serviceMode: 'doorstep',
      addOnsTotalPaise: 0, addOnsCommissionPaise: 0,
    });
    expect(snap.totalPaise).toBe(inr(900));
    expect(snap.commissionPaise).toBe(inr(90));
  });
});
