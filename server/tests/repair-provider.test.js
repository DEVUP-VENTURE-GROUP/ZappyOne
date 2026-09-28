/**
 * Provider onboarding + pricing submission + warranty issuance.
 *
 * The pricing path is the sharp one: a provider must never be able to publish
 * their own price unchecked, and the price they submit must be scored against
 * the Zappy reference band at the moment of submission — not judged later
 * against a band that has since moved.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { SkillLevel, ProviderCapability } = require('../src/modules/repair/models/capability.model');
const { ProviderPricing, ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { ApprovalRequest } = require('../src/modules/repair/models/governance.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const Warranty = require('../src/modules/service/warranty.model');
const pricingService = require('../src/modules/repair/services/pricing.service');
const bookingService = require('../src/modules/repair/services/booking.service');
const providerCtrl = require('../src/modules/repair/repair-provider.controller');

jest.setTimeout(60000);

const workerId = new mongoose.Types.ObjectId();

/** Minimal express-shaped req/res so controllers can be driven directly. */
function mockReq(body = {}, query = {}) {
  return { auth: { sub: workerId.toString(), role: 'worker' }, body, query, params: {} };
}
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const passthru = (err) => { if (err) throw err; };

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });

  await SkillLevel.insertMany([
    { level: 2, name: 'Component', vertical: 'mobile', requiresVerification: false },
    { level: 3, name: 'Advanced', vertical: 'mobile', requiresVerification: true },
  ]);

  await Repair.insertMany([
    {
      code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile',
      pricingMode: 'fixed', minSkillLevel: 2, warrantyDays: 180,
      allowedServiceModes: ['doorstep', 'workshop'],
    },
    {
      code: 'display_assembly_replacement', name: 'Display Assembly Replacement', vertical: 'mobile',
      pricingMode: 'range', minSkillLevel: 3, warrantyDays: 180,
      allowedServiceModes: ['doorstep', 'workshop'],
    },
  ]);

  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement',
    minPaise: 90000, recommendedPaise: 100000, maxPaise: 120000,
  });
});

afterAll(async () => { await stopMongo(); });

describe('capabilities', () => {
  it('refuses a repair above the provider’s claimed skill level', async () => {
    const res = mockRes();
    await providerCtrl.upsertCapability(
      mockReq({ repairCode: 'display_assembly_replacement', skillLevel: 2 }), res, passthru,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SKILL_TOO_LOW');
  });

  it('accepts a capability at or above the repair’s floor', async () => {
    const res = mockRes();
    await providerCtrl.upsertCapability(
      mockReq({ repairCode: 'battery_replacement', skillLevel: 2, serviceModes: ['doorstep'] }), res, passthru,
    );
    expect(res.body.capability.repairCode).toBe('battery_replacement');
    expect(res.body.pendingVerification).toBe(false);
  });

  it('holds a verification-gated level pending and queues it for admin', async () => {
    const res = mockRes();
    await providerCtrl.upsertCapability(
      mockReq({ repairCode: 'display_assembly_replacement', skillLevel: 3 }), res, passthru,
    );
    expect(res.body.pendingVerification).toBe(true);

    const cap = await ProviderCapability.findOne({ workerId, repairCode: 'display_assembly_replacement' });
    // A pending capability must not match in dispatch.
    expect(cap.covers({ serviceMode: 'doorstep' })).toBe(false);

    const approval = await ApprovalRequest.findOne({ kind: 'skill_level', entityId: cap._id });
    expect(approval).toBeTruthy();
  });
});

describe('pricing submission', () => {
  afterEach(async () => {
    await ProviderPricing.deleteMany({});
    await ApprovalRequest.deleteMany({ kind: { $in: ['provider_pricing', 'abnormal_price'] } });
    pricingService.invalidateConfigCache();
  });

  it('auto-approves a price inside the green band', async () => {
    const res = mockRes();
    await providerCtrl.submitPricing(
      mockReq({ repairCode: 'battery_replacement', totalPaise: 105000, warrantyDays: 180 }), res, passthru,
    );
    expect(res.body.band).toBe('green');
    expect(res.body.autoApproved).toBe(true);
    expect(res.body.pricing.approvalStatus).toBe('auto_approved');
  });

  it('publishes a yellow-band price immediately — no price limit', async () => {
    // The provider's price is final: an above-benchmark figure still goes live.
    const res = mockRes();
    await providerCtrl.submitPricing(
      mockReq({ repairCode: 'battery_replacement', totalPaise: 130000 }), res, passthru,
    );
    expect(res.body.band).toBe('yellow');
    expect(res.body.autoApproved).toBe(true);
    expect(res.body.pricing.approvalStatus).toBe('auto_approved');

    const doc = await ProviderPricing.findById(res.body.pricing._id);
    expect(doc.isBookable()).toBe(true);   // live and sellable
  });

  it('publishes even an abnormal red-band price, and flags it for a glance', async () => {
    // Never blocked. The price is live; ops just gets a non-blocking heads-up so
    // a missing zero can be caught by a human.
    const res = mockRes();
    await providerCtrl.submitPricing(
      mockReq({ repairCode: 'battery_replacement', totalPaise: 500000 }), res, passthru,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.band).toBe('red');
    expect(res.body.pricing.approvalStatus).toBe('auto_approved');
    expect(await ProviderPricing.countDocuments({})).toBe(1);

    // Flagged for review, but NOT blocking.
    const flag = await ApprovalRequest.findOne({ kind: 'abnormal_price' });
    expect(flag).toBeTruthy();
  });

  it('freezes the deviation as judged at submission time', async () => {
    const res = mockRes();
    await providerCtrl.submitPricing(
      mockReq({ repairCode: 'battery_replacement', totalPaise: 110000 }), res, passthru,
    );
    const id = res.body.pricing._id;

    // Reference moves afterwards — the recorded judgement must not move with it.
    await ZappyReferencePricing.updateMany({ repairCode: 'battery_replacement' }, { $set: { recommendedPaise: 200000 } });

    const doc = await ProviderPricing.findById(id).lean();
    expect(doc.referenceRecommendedPaise).toBe(100000);
    expect(doc.deviationPct).toBe(10);

    // Put the benchmark back. Leaving it at 200000 silently re-banded every
    // test that ran afterwards — a ₹1,300 price reads yellow against ₹1,000 and
    // green against ₹2,000, so later assertions were passing against a
    // reference no test had asked for.
    await ZappyReferencePricing.updateMany(
      { repairCode: 'battery_replacement' }, { $set: { recommendedPaise: 100000 } },
    );
  });

  it('supersedes rather than overwrites when a price is changed', async () => {
    const first = mockRes();
    await providerCtrl.submitPricing(mockReq({ repairCode: 'battery_replacement', totalPaise: 100000 }), first, passthru);
    const second = mockRes();
    await providerCtrl.submitPricing(mockReq({ repairCode: 'battery_replacement', totalPaise: 108000 }), second, passthru);

    const old = await ProviderPricing.findById(first.body.pricing._id).lean();
    const now = await ProviderPricing.findById(second.body.pricing._id).lean();

    expect(old.supersededAt).toBeTruthy();
    expect(old.totalPaise).toBe(100000);      // history intact
    expect(now.version).toBe(2);
    expect(String(now.supersedesId)).toBe(String(old._id));
  });

  it('publishes even with no reference band to judge against — no price limit', async () => {
    const res = mockRes();
    await providerCtrl.submitPricing(
      mockReq({ repairCode: 'display_assembly_replacement', totalPaise: 2000000 }), res, passthru,
    );
    // Live regardless: the provider's price is final, benchmark or not.
    expect(res.body.autoApproved).toBe(true);
    expect(res.body.pricing.approvalStatus).toBe('auto_approved');
    expect(res.body.reference).toBeNull();
  });
});

/**
 * A model's whole price sheet in one request.
 *
 * This is how the provider screen now saves: they open one model, type a figure
 * for each job at each part grade, and press save once. Sending a request per
 * cell would leave them half-priced when a basement workshop's connection drops
 * mid-way, which is the normal working condition, not an edge case.
 */
describe('bulk pricing', () => {
  afterEach(async () => {
    await ProviderPricing.deleteMany({});
    await ApprovalRequest.deleteMany({ kind: { $in: ['provider_pricing', 'abnormal_price'] } });
    pricingService.invalidateConfigCache();
  });

  it('saves one model priced at several part grades in a single request', async () => {
    const res = mockRes();
    await providerCtrl.bulkPricing(mockReq({
      rows: [
        { repairCode: 'battery_replacement', brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'oem', totalPaise: 110000 },
        { repairCode: 'battery_replacement', brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'premium', totalPaise: 100000 },
        { repairCode: 'battery_replacement', brandCode: 'samsung', modelCode: 'samsung-s23-ultra', qualityCode: 'standard', totalPaise: 95000 },
      ],
    }), res, passthru);

    expect(res.statusCode).toBe(201);
    expect(res.body.savedCount).toBe(3);
    expect(res.body.rejectedCount).toBe(0);
    expect(await ProviderPricing.countDocuments({ supersededAt: null })).toBe(3);
  });

  /**
   * The whole point of applying rows independently: nine good prices typed
   * alongside one bad one must not be thrown away with it.
   */
  it('saves every row now that there is no price limit', async () => {
    const res = mockRes();
    await providerCtrl.bulkPricing(mockReq({
      rows: [
        { repairCode: 'battery_replacement', qualityCode: 'standard', totalPaise: 105000 },
        { repairCode: 'battery_replacement', qualityCode: 'oem', totalPaise: 500000 },
        { repairCode: 'battery_replacement', qualityCode: 'premium', totalPaise: 108000 },
      ],
    }), res, passthru);

    // All three go live, including the outlier — it is flagged, not rejected.
    expect(res.body.savedCount).toBe(3);
    expect(res.body.rejectedCount).toBe(0);
    expect(await ProviderPricing.countDocuments({ supersededAt: null })).toBe(3);
  });

  it('supersedes rather than overwrites when a price is edited (§69)', async () => {
    const first = mockRes();
    await providerCtrl.bulkPricing(mockReq({
      rows: [{ repairCode: 'battery_replacement', qualityCode: 'premium', totalPaise: 105000 }],
    }), first, passthru);

    const second = mockRes();
    await providerCtrl.bulkPricing(mockReq({
      rows: [{ repairCode: 'battery_replacement', qualityCode: 'premium', totalPaise: 108000 }],
    }), second, passthru);

    const live = await ProviderPricing.find({ supersededAt: null }).lean();
    expect(live).toHaveLength(1);
    expect(live[0].totalPaise).toBe(108000);
    expect(live[0].version).toBe(2);
    // The old figure is still on record — a booking quoted on it stays honest.
    expect(await ProviderPricing.countDocuments({ supersededAt: { $ne: null } })).toBe(1);
  });

  it('publishes a bulk price immediately, exactly as the single path does', async () => {
    const res = mockRes();
    await providerCtrl.bulkPricing(mockReq({
      rows: [{ repairCode: 'battery_replacement', totalPaise: 130000 }],
    }), res, passthru);

    expect(res.body.pendingReview).toBe(0);
    expect(res.body.saved[0].approvalStatus).toBe('auto_approved');
    // No gating request is created — nothing is held for approval any more.
    expect(await ApprovalRequest.countDocuments({ kind: 'provider_pricing' })).toBe(0);
  });
});

describe('onboarding readiness', () => {
  it('reports exactly what is still missing', async () => {
    const res = mockRes();
    await providerCtrl.onboardingStatus(mockReq(), res, passthru);

    const byKey = Object.fromEntries(res.body.steps.map((s) => [s.key, s]));
    expect(byKey.capabilities.done).toBe(true);   // added above
    expect(byKey.serviceArea.done).toBe(false);   // never set
    expect(res.body.complete).toBe(false);
    expect(res.body.pending.skillVerifications).toBeGreaterThan(0);
  });
});

describe('warranty issuance', () => {
  it('issues a warranty card on completion using the agreed term', async () => {
    const booking = await RepairBooking.create({
      reference: 'ZRWARR001',
      userId: new mongoose.Types.ObjectId(),
      vertical: 'mobile',
      brandCode: 'samsung', modelCode: 'samsung-s23',
      serviceMode: 'doorstep', status: 'QA_PENDING',
      workerId,
      location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
      priceSnapshot: { subtotalPaise: 100000, totalPaise: 118000, warrantyDays: 180 },
    });

    const warranty = await bookingService.issueWarranty(booking);
    expect(warranty).toBeTruthy();
    expect(warranty.warrantyDays).toBe(180);

    const days = Math.round((warranty.expiresAt - warranty.issuedAt) / 86400000);
    expect(days).toBe(180);

    const updated = await RepairBooking.findById(booking._id).lean();
    expect(String(updated.warrantyId)).toBe(String(warranty._id));
  });

  it('issues nothing when the repair carries no warranty', async () => {
    const booking = await RepairBooking.create({
      reference: 'ZRWARR002',
      userId: new mongoose.Types.ObjectId(),
      vertical: 'mobile',
      brandCode: 'samsung', modelCode: 'samsung-s23',
      serviceMode: 'doorstep', status: 'QA_PENDING',
      workerId,
      location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
      priceSnapshot: { subtotalPaise: 50000, totalPaise: 59000, warrantyDays: 0 },
    });

    expect(await bookingService.issueWarranty(booking)).toBeNull();
    expect(await Warranty.countDocuments({ orderId: booking._id })).toBe(0);
  });

  it('does not issue a second warranty for the same booking', async () => {
    const booking = await RepairBooking.findOne({ reference: 'ZRWARR001' });
    expect(await bookingService.issueWarranty(booking)).toBeNull();
    expect(await Warranty.countDocuments({ orderId: booking._id })).toBe(1);
  });
});

/* One provider, two verticals */

/**
 * A provider approved for both phones and laptops has TWO separate setups.
 *
 * Mixing them is not cosmetic: a checklist that counts a phone price as laptop
 * progress tells the provider they are ready for laptop jobs they have no
 * price for, and a skills list that shows phone repairs invites them to claim
 * work they were never verified to do.
 */
describe('provider setup is scoped per vertical', () => {
  beforeAll(async () => {
    await RepairConfig.create({ vertical: 'laptop' });
    await SkillLevel.create({ level: 2, name: 'Component', vertical: 'laptop', requiresVerification: false });
    await Repair.create({
      code: 'screen_replacement', name: 'Screen replacement', vertical: 'laptop',
      pricingMode: 'fixed', minSkillLevel: 2, warrantyDays: 90,
      allowedServiceModes: ['doorstep', 'pickup_repair'],
    });
  });

  it('keeps each vertical\'s capabilities on its own screen', async () => {
    // The provider already has mobile capabilities from the tests above.
    const res = mockRes();
    await providerCtrl.upsertCapability(
      mockReq(
        { repairCode: 'screen_replacement', serviceModes: ['doorstep'], skillLevel: 2, vertical: 'laptop' },
        { vertical: 'laptop' },
      ),
      res, passthru,
    );
    expect(res.statusCode).toBe(200);

    const laptop = mockRes();
    await providerCtrl.listCapabilities(mockReq({}, { vertical: 'laptop' }), laptop, passthru);
    expect(laptop.body.capabilities.map((c) => c.repairCode)).toEqual(['screen_replacement']);

    const mobile = mockRes();
    await providerCtrl.listCapabilities(mockReq({}, {}), mobile, passthru);
    expect(mobile.body.capabilities.map((c) => c.repairCode)).not.toContain('screen_replacement');
  });

  it('does not count phone progress as laptop progress', async () => {
    // An approved MOBILE price, stated outright rather than inherited from the
    // pricing tests above, whose rows they supersede as they go.
    await ProviderPricing.create({
      workerId, vertical: 'mobile', repairCode: 'battery_replacement',
      totalPaise: 250000, approvalStatus: 'approved', supersededAt: null,
    });

    const laptop = mockRes();
    await providerCtrl.onboardingStatus(mockReq({}, { vertical: 'laptop' }), laptop, passthru);

    const step = (key) => laptop.body.steps.find((s) => s.key === key);
    expect(step('capabilities').done).toBe(true);      // just added above
    expect(step('pricing').done).toBe(false);          // approved mobile prices do not carry over

    const mobile = mockRes();
    await providerCtrl.onboardingStatus(mockReq({}, {}), mobile, passthru);
    expect(mobile.body.steps.find((s) => s.key === 'pricing').done).toBe(true);
  });

  it('shares the service area, because where you work does not change', async () => {
    // Areas are deliberately NOT per vertical — a shop does not move house
    // because it started repairing laptops.
    const laptop = mockRes();
    await providerCtrl.onboardingStatus(mockReq({}, { vertical: 'laptop' }), laptop, passthru);
    const mobile = mockRes();
    await providerCtrl.onboardingStatus(mockReq({}, {}), mobile, passthru);

    expect(laptop.body.steps.find((s) => s.key === 'serviceArea').count)
      .toBe(mobile.body.steps.find((s) => s.key === 'serviceArea').count);
  });
});
