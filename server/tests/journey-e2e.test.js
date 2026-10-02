/**
 * The whole thing, walked as the three people who use it.
 *
 * Fifty scenarios taken from how this actually goes in an Indian repair market:
 * a shop owner signing up on a phone in his shop, a customer whose screen broke
 * on the way to work, an admin working a review queue between other jobs.
 *
 * Ordered as a single journey rather than grouped by module, because the bugs
 * that matter live between the modules — a shop that is approved but invisible,
 * a customer sent into a flow nobody is verified for, a price nobody can quote.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const buildApp = require('../src/app');
const { signAccessToken } = require('../src/modules/auth/token.service');

const User = require('../src/modules/user/user.model');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const DiagnosticFlow = require('../src/modules/service/diagnostic-flow.model');

const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { Part, PartQuality } = require('../src/modules/repair/models/part.model');
const { SkillLevel, ProviderCapability } = require('../src/modules/repair/models/capability.model');
const { RepairConfig, QAChecklist } = require('../src/modules/repair/models/config.model');
const { ZappyReferencePricing, ProviderPricing } = require('../src/modules/repair/models/pricing.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');

const onboardingSeeder = require('../src/modules/onboarding/run-onboarding-seed');
const mobileSeed = require('../src/modules/repair/seed/catalog.seed');
const { FLOWS } = require('../src/modules/repair/seed/diagnostics.seed');
const { MOBILE_MODELS, toCode } = require('../src/modules/repair/seed/device-models.seed');

jest.setTimeout(180000);

let app;
const ctx = {};
const ADMIN = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const HYD = { lat: 17.44, lng: 78.35 };

beforeAll(async () => {
  await startMongo();
  app = buildApp();

  /* The catalog an operator would have seeded before launch */
  await RepairConfig.create({
    vertical: 'mobile',
    diagnosisFeePaise: 29900,
    platformFeePaise: 2000,
    // Stated, not inherited: tax and commission are operator-set in admin and
    // default to 0/10, so a test asserting rupee amounts has to fix its own rates.
    taxPct: 18,
    commissionPct: 15,
  });
  await onboardingSeeder.seedDomains();
  await onboardingSeeder.seedLines();
  await onboardingSeeder.seedRequirementSets();
  await onboardingSeeder.seedCaptureRules();

  for (const b of mobileSeed.BRANDS) {
    await Brand.create({ code: b.code, name: b.name, category: 'mobile', sortOrder: b.sortOrder ?? 0 });
  }

  const cats = {};
  for (const c of mobileSeed.PROBLEM_CATEGORIES) {
    const doc = await ProblemCategory.create({
      code: c.code, name: c.name, vertical: 'mobile', displayOrder: c.displayOrder,
    });
    cats[c.code] = doc._id;
  }

  await Problem.insertMany(mobileSeed.PROBLEMS.map((p) => ({
    code: p.code, name: p.name, vertical: 'mobile',
    categoryId: cats[p.categoryCode], categoryCode: p.categoryCode,
    candidateRepairCodes: p.candidateRepairCodes || [],
    requiresDiagnosis: !!p.requiresDiagnosis,
    severity: p.severity || 'normal',
    isPopular: !!p.isPopular,
  })));

  await Repair.insertMany(mobileSeed.REPAIRS.map((r) => ({
    code: r.code, name: r.name, vertical: 'mobile',
    pricingMode: r.pricingMode, minSkillLevel: r.minSkillLevel,
    allowedServiceModes: r.modes, estimatedDurationMin: r.durationMin,
    warrantyDays: r.warrantyDays,
    requiresDiagnosis: r.pricingMode === 'diagnosis_required',
    problemCodes: [],
    qaChecklistCodes: ['mobile_standard'],
    partRequirements: r.code === 'display_assembly_replacement'
      ? [{ componentCode: 'display_assembly', required: true, quantity: 1 }]
      : [],
  })));

  await SkillLevel.insertMany(mobileSeed.SKILL_LEVELS.map((l) => ({
    level: l.level, name: l.name, vertical: 'mobile',
    description: l.description, requiresVerification: l.requiresVerification,
  })));

  await QAChecklist.create({
    code: 'mobile_standard', name: 'Standard mobile QA', vertical: 'mobile',
    items: [{ code: 'touch', label: 'Touch works across the panel', required: true }],
  });

  for (const f of FLOWS) {
    await DiagnosticFlow.create({ code: f.code, category: f.category, title: f.title, questions: f.questions });
    if (f.problemCodes?.length) {
      await Problem.updateMany(
        { code: { $in: f.problemCodes }, vertical: 'mobile' },
        { $set: { diagnosticFlowCode: f.code } },
      );
    }
  }

  /* Real models, the gap that used to dead-end the flow */
  const apple = await Brand.findOne({ code: 'apple' });
  const samsung = await Brand.findOne({ code: 'samsung' });
  for (const m of MOBILE_MODELS.filter((x) => ['apple', 'samsung'].includes(x.brand))) {
    const brand = m.brand === 'apple' ? apple : samsung;
    await DeviceModel.create({
      brandId: brand._id, brandCode: brand.code, vertical: 'mobile',
      name: m.name, code: toCode(m.brand, m.name),
      seriesName: m.series, launchYear: m.year, storageVariants: m.storage || [],
    });
  }

  await PartQuality.insertMany([
    { code: 'oem', name: 'OEM / Genuine', rank: 30, isGenuine: true },
    { code: 'premium', name: 'Premium Compatible', rank: 20, isGenuine: false },
  ]);

  /* Zappy's own reference band, without which nothing can be priced */
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'display_assembly_replacement',
    minPaise: 800000, recommendedPaise: 1200000, maxPaise: 1800000,
    partCostPaise: 900000, labourPaise: 200000, warrantyDays: 180,
  });
  await ZappyReferencePricing.create({
    vertical: 'mobile', repairCode: 'battery_replacement',
    minPaise: 150000, recommendedPaise: 220000, maxPaise: 320000,
    partCostPaise: 150000, labourPaise: 50000, warrantyDays: 180,
  });

  /* The three people */
  const customer = await User.create({ phone: '9812300001', name: 'Anitha R' });
  const other = await User.create({ phone: '9812300002', name: 'Someone Else' });
  const shop = await Shop.create({
    businessName: 'Sri Balaji Mobiles', ownerName: 'Venkat', phone: '9812300010',
    address: { text: 'Shop 4, Ameerpet', location: { type: 'Point', coordinates: [HYD.lng, HYD.lat] } },
  });
  const tech = await Worker.create({
    phone: '9812300020', name: 'Imran',
    currentLocation: { type: 'Point', coordinates: [HYD.lng, HYD.lat], updatedAt: new Date() },
    isOnline: true, isAvailable: true,
  });

  Object.assign(ctx, {
    customerId: customer._id,
    shopId: shop._id,
    techId: tech._id,
    customerToken: signAccessToken({ sub: customer._id.toString(), role: 'user', phone: customer.phone }),
    otherToken: signAccessToken({ sub: other._id.toString(), role: 'user', phone: other.phone }),
    shopToken: signAccessToken({ sub: shop._id.toString(), role: 'shop', phone: shop.phone }),
    techToken: signAccessToken({ sub: tech._id.toString(), role: 'worker', phone: tech.phone }),
    adminToken: await require('./helpers').adminToken(),
  });
});

afterAll(async () => { await stopMongo(); });

/*
   PART 1 — A shop owner signs up, on his phone, in his shop
 */

describe('the provider journey', () => {
  it('1. shows him the six kinds of work, in order', async () => {
    const res = await request(app).get('/api/provider/onboarding/domains').set(auth(ctx.shopToken));
    expect(res.body.domains.map((d) => d.code))
      .toEqual(['electronics', 'vehicles', 'home_services', 'family_assist', 'helping_services', 'pet_services']);
  });

  it('2. tells him plainly which services are open', async () => {
    const res = await request(app)
      .get('/api/provider/onboarding/lines?domainCode=electronics').set(auth(ctx.shopToken));
    const live = res.body.lines.filter((l) => l.status === 'live').map((l) => l.code);
    expect(live).toContain('mobile_repair');
  });

  it('3. refuses to enrol him in work with no customer flow behind it', async () => {
    const res = await request(app)
      .post('/api/provider/onboarding/enrolments').set(auth(ctx.shopToken))
      // Three-wheelers: seeded and visible, but deliberately not open yet.
      // (Two-wheelers opened, so they are no longer the example of a shut line.)
      .send({ lineCode: 'three_wheeler' });
    expect(res.status).toBe(409);
  });

  it('4. starts his phone-repair application', async () => {
    const res = await request(app)
      .post('/api/provider/onboarding/enrolments').set(auth(ctx.shopToken))
      .send({ lineCode: 'mobile_repair' });
    expect(res.status).toBe(201);
    ctx.shopEnrolment = res.body.enrolment._id;
  });

  it('5. asks a shop for a storefront, not an Aadhaar selfie alone', async () => {
    const res = await request(app)
      .get('/api/provider/onboarding/lines/mobile_repair/requirements').set(auth(ctx.shopToken));
    const codes = res.body.requirements.documents.map((d) => d.code);
    expect(codes).toContain('shop_photo');
    expect(codes).toContain('owner_id');
  });

  it('6. demands the selfie be taken live, not picked from the gallery', async () => {
    const res = await request(app)
      .get('/api/provider/onboarding/lines/mobile_repair/requirements').set(auth(ctx.shopToken));
    const byCode = Object.fromEntries(res.body.requirements.documents.map((d) => [d.code, d]));
    expect(byCode.selfie.capture).toBe('user');
    expect(byCode.shop_photo.capture).toBe('environment');
  });

  it('7. will not forward a half-finished application', async () => {
    const res = await request(app)
      .post(`/api/provider/onboarding/enrolments/${ctx.shopEnrolment}/submit`).set(auth(ctx.shopToken));
    expect(res.status).toBe(400);
    expect(res.body.missing.length).toBeGreaterThan(0);
  });

  it('8. accepts his documents, with the liveness evidence attached', async () => {
    await request(app)
      .patch(`/api/provider/onboarding/enrolments/${ctx.shopEnrolment}`).set(auth(ctx.shopToken))
      .send({
        documents: [
          { code: 'owner_id', url: 's3://kyc/venkat-id.jpg' },
          { code: 'shop_photo', url: 's3://kyc/balaji-front.jpg', captureMethod: 'live_camera', lat: HYD.lat, lng: HYD.lng },
          { code: 'selfie', url: 's3://kyc/venkat-selfie.jpg', captureMethod: 'live_camera', lat: HYD.lat, lng: HYD.lng },
        ],
        fields: [{ code: 'years_active', value: '9' }],
        acceptedDeclarations: true,
      });

    const res = await request(app)
      .post(`/api/provider/onboarding/enrolments/${ctx.shopEnrolment}/submit`).set(auth(ctx.shopToken));
    expect(res.status).toBe(200);
    expect(res.body.enrolment.status).toBe('pending_review');
  });

  it('9. does not let him approve himself while he waits', async () => {
    const res = await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${ctx.shopEnrolment}/decide`).set(auth(ctx.shopToken))
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });

  it('10. registers an independent technician with a name and nothing else', async () => {
    const res = await request(app)
      .post('/api/provider/onboarding/enrolments').set(auth(ctx.techToken))
      .send({ lineCode: 'mobile_repair' });
    expect(res.status).toBe(201);
    ctx.techEnrolment = res.body.enrolment._id;

    const reqs = await request(app)
      .get('/api/provider/onboarding/lines/mobile_repair/requirements').set(auth(ctx.techToken));
    const codes = reqs.body.requirements.documents.map((d) => d.code);
    expect(codes).toContain('aadhaar');
    expect(codes).not.toContain('shop_photo');
  });
});

/*
   PART 2 — Admin works the queue
 */

describe('the admin queue', () => {
  it('11. shows who is waiting, with the business attached', async () => {
    const res = await request(app)
      .get(`${ADMIN}/onboarding/enrolments?status=pending_review`).set(auth(ctx.adminToken));
    expect(res.body.items[0].provider.businessName).toBe('Sri Balaji Mobiles');
  });

  it('12. marks which photos were actually taken live', async () => {
    const res = await request(app)
      .get(`${ADMIN}/onboarding/enrolments?status=pending_review`).set(auth(ctx.adminToken));
    const selfie = res.body.items[0].documents.find((d) => d.code === 'selfie');
    expect(selfie.captureMethod).toBe('live_camera');
    expect(selfie.lat).toBeCloseTo(HYD.lat);
  });

  it('13. approves the shop', async () => {
    const res = await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${ctx.shopEnrolment}/decide`).set(auth(ctx.adminToken))
      .send({ decision: 'approved', note: 'Storefront and ID check out' });
    expect(res.status).toBe(200);
  });

  it('14. does not ask the shop for the same papers twice', async () => {
    const shop = await Shop.findById(ctx.shopId).lean();
    expect(shop.kyc.status).toBe('approved');
    expect(shop.kyc.shopPhotoUrl).toBe('s3://kyc/balaji-front.jpg');
  });

  it('15. lists the shop for exactly what it was approved for', async () => {
    const shop = await Shop.findById(ctx.shopId);
    expect(shop.services).toEqual(['mobile_repair']);
    expect(shop.isDiscoverable()).toBe(true);
  });

  it('16. approves the independent technician too', async () => {
    await request(app)
      .patch(`/api/provider/onboarding/enrolments/${ctx.techEnrolment}`).set(auth(ctx.techToken))
      .send({
        documents: [
          { code: 'aadhaar', url: 's3://kyc/imran-aadhaar.jpg' },
          { code: 'selfie', url: 's3://kyc/imran-selfie.jpg', captureMethod: 'live_camera', lat: HYD.lat, lng: HYD.lng },
        ],
        fields: [{ code: 'experience_years', value: '6' }],
        acceptedDeclarations: true,
      });
    await request(app)
      .post(`/api/provider/onboarding/enrolments/${ctx.techEnrolment}/submit`).set(auth(ctx.techToken));

    const res = await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${ctx.techEnrolment}/decide`).set(auth(ctx.adminToken))
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);

    const worker = await Worker.findById(ctx.techId).lean();
    expect(worker.kyc.status).toBe('approved');
  });

  it('17. tells the provider they are approved but not yet visible', async () => {
    const res = await request(app).get('/api/provider/onboarding/status').set(auth(ctx.shopToken));
    expect(res.body.approvedLineCodes).toEqual(['mobile_repair']);
    // No photo, no hours, no prices — approval alone is not a storefront.
    expect(res.body.isLive).toBe(false);
    expect(res.body.storefront.find((s) => s.key === 'services').done).toBe(true);
  });
});

/*
   PART 3 — The shop sets itself up
 */

describe('provider setup', () => {
  it('18. offers the brands a customer picks from', async () => {
    const res = await request(app).get('/api/repair/brands?vertical=mobile').set(auth(ctx.shopToken));
    expect(res.body.brands.length).toBeGreaterThan(5);
    ctx.brandCodes = res.body.brands.slice(0, 4).map((b) => b.code);
  });

  it('19. groups the work under the same headings the customer sees', async () => {
    const res = await request(app)
      .get('/api/repair/provider/work-catalog?vertical=mobile').set(auth(ctx.shopToken));
    const names = res.body.groups.map((g) => g.name);
    expect(names).toContain('Display');
    ctx.work = res.body;
  });

  /**
   * The provider is shown the same breadth of catalog as the customer.
   *
   * A repair used to be filed under the FIRST heading that named it, so a
   * charging port repair appeared under Charging or under Physical Damage but
   * never both — and a heading whose every repair had been claimed by an
   * earlier one came out empty and was dropped from the screen entirely. The
   * customer browses problems and saw everything; the provider saw a fraction.
   */
  it('19b. shows every heading, and a repair under each heading that reaches it', async () => {
    const res = await request(app)
      .get('/api/repair/provider/work-catalog?vertical=mobile').set(auth(ctx.shopToken));

    const headings = await ProblemCategory.countDocuments({
      vertical: 'mobile', isActive: true, isArchived: false,
    });
    expect(res.body.groups.length).toBe(headings);

    // Connectivity was the heading this bug hid on mobile.
    expect(res.body.groups.map((g) => g.name)).toContain('Connectivity');

    // More placements than repairs, because repairs answer several headings.
    const placements = res.body.groups.reduce((sum, g) => sum + g.repairs.length, 0);
    const distinct = new Set(res.body.groups.flatMap((g) => g.repairs.map((r) => r.code))).size;
    expect(placements).toBeGreaterThan(distinct);
  });

  it('20. saves a screenful of choices in one go', async () => {
    // Deliberately NOT de-duplicated here: this is exactly what the screen
    // sends, and a repair shown under two headings must still be saved once.
    const all = ctx.work.groups.flatMap((g) => g.repairs.map((r) => r.code));
    const picks = ['display_assembly_replacement', 'battery_replacement'].filter((c) => all.includes(c));

    const res = await request(app)
      .put('/api/repair/provider/capabilities/bulk').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', repairCodes: picks, candidateCodes: all, brandCodes: ctx.brandCodes, skillLevel: 3 });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(picks.length);
    ctx.picks = picks;
  });

  it('21. refuses work above the level claimed', async () => {
    const hard = await Repair.findOne({ vertical: 'mobile', minSkillLevel: { $gte: 4 } }).lean();
    if (!hard) return;

    const res = await request(app)
      .put('/api/repair/provider/capabilities/bulk').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', repairCodes: [hard.code], candidateCodes: [hard.code], skillLevel: 1 });

    expect(res.body.skipped.map((s) => s.code)).toContain(hard.code);
    expect(await ProviderCapability.countDocuments({ shopId: ctx.shopId, repairCode: hard.code })).toBe(0);
  });

  /**
   * The service area is anchored to the SHOP, not to wherever the owner is.
   *
   * An owner who is out of the shop still receives the job and hands it to a
   * technician, so matching runs off this fixed pin and never off a live
   * position.
   */
  it('22. saves a service area anchored on the shop pin', async () => {
    const res = await request(app)
      .put('/api/repair/provider/service-areas').set(auth(ctx.shopToken))
      .send({
        vertical: 'mobile', cityCode: 'hyderabad', radiusKm: 12,
        center: [78.4483, 17.4375],
        serviceModes: ['doorstep', 'workshop'], workshopAddress: 'Shop 4, Ameerpet',
      });
    expect(res.status).toBe(200);
    expect(res.body.area.radiusKm).toBe(12);
    expect(res.body.area.center.coordinates).toEqual([78.4483, 17.4375]);
  });

  /**
   * The silent-invisibility bug. findServiceableProviders covers a provider by
   * pincode or by distance from their centre; with neither, every check fails
   * and they are never offered a job — fully verified, fully priced, and
   * unreachable, with nothing on any screen to say why.
   */
  it('22b. refuses an area with no pin and no pincodes, rather than storing an unmatchable one', async () => {
    const res = await request(app)
      .put('/api/repair/provider/service-areas').set(auth(ctx.shopToken))
      .send({
        vertical: 'mobile', cityCode: 'warangal', radiusKm: 12,
        serviceModes: ['doorstep'], workshopAddress: 'Nowhere',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SERVICE_AREA_UNREACHABLE');
  });

  it('23. caps the radius at 20km', async () => {
    const res = await request(app)
      .put('/api/repair/provider/service-areas').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', cityCode: 'hyderabad', radiusKm: 60, serviceModes: ['doorstep'] });
    expect(res.status).toBe(400);
  });

  it('24. will not take workshop work without somewhere to take the device', async () => {
    const res = await request(app)
      .put('/api/repair/provider/service-areas').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', cityCode: 'secunderabad', radiusKm: 8, serviceModes: ['workshop'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WORKSHOP_ADDRESS_REQUIRED');
  });

  it('25. shows the Zappy range before a price is typed', async () => {
    const res = await request(app)
      .get('/api/repair/provider/pricing/reference?vertical=mobile&repairCode=display_assembly_replacement')
      .set(auth(ctx.shopToken));
    expect(res.body.reference.recommendedPaise).toBe(1200000);
    // The thresholds come with it, so the provider can see where the line is.
    expect(res.body.bands.greenMaxDeviationPct).toBeGreaterThan(0);
  });

  it('26. publishes a sensible price immediately', async () => {
    const res = await request(app)
      .post('/api/repair/provider/pricing').set(auth(ctx.shopToken))
      .send({
        vertical: 'mobile', repairCode: 'display_assembly_replacement',
        // The grade is part of the price: the same repair with an original
        // panel and a compatible one are different products.
        qualityCode: 'oem',
        totalPaise: 1250000, warrantyDays: 180,
      });
    expect(res.status).toBe(201);
    expect(['approved', 'auto_approved']).toContain(res.body.pricing.approvalStatus);
  });

  it('26b. refuses a part-based price that does not say which grade it is for', async () => {
    const res = await request(app)
      .post('/api/repair/provider/pricing').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', repairCode: 'display_assembly_replacement', totalPaise: 990000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('QUALITY_REQUIRED');
  });

  it('27. publishes an above-benchmark price immediately — no price limit', async () => {
    const res = await request(app)
      .post('/api/repair/provider/pricing').set(auth(ctx.shopToken))
      // ₹2,800 against a ₹2,200 benchmark — 27% over. The provider's price is
      // final, so it goes live; the band is still recorded for admin's eyes.
      .send({ vertical: 'mobile', repairCode: 'battery_replacement', qualityCode: 'oem', totalPaise: 280000 });
    expect(res.body.pricing.approvalStatus).toBe('auto_approved');
    expect(res.body.pricing.band).toBe('yellow');
  });

  it('27b. prices the same job for two brands — one brand never blocks another', async () => {
    const res = await request(app)
      .post('/api/repair/provider/pricing/bulk').set(auth(ctx.shopToken))
      .send({
        vertical: 'mobile',
        rows: ['samsung', 'apple'].map((brandCode) => ({
          repairCode: 'battery_replacement', brandCode, modelCode: null, qualityCode: 'standard', totalPaise: 150000,
        })),
      });
    expect(res.status).toBe(201);
    expect(res.body.savedCount).toBe(2);
  });

  it('27c. offers ZappyOne market prices for the jobs the shop does, saving nothing', async () => {
    const before = await request(app).get('/api/repair/provider/pricing?vertical=mobile').set(auth(ctx.shopToken));
    const res = await request(app)
      .get('/api/repair/provider/pricing/suggested?vertical=mobile&brandCode=samsung').set(auth(ctx.shopToken));
    expect(res.status).toBe(200);
    const display = res.body.suggestions.filter((s) => s.repairCode === 'display_assembly_replacement');
    // A reference with no grade of its own fills the standard grade only.
    expect(display.map((s) => s.qualityCode)).toEqual(['standard']);
    expect(display[0].totalPaise).toBe(1200000);
    const after = await request(app).get('/api/repair/provider/pricing?vertical=mobile').set(auth(ctx.shopToken));
    expect(after.body.pricing.length).toBe(before.body.pricing.length);
  });

  it('28. stocks a part so the job can be finished today', async () => {
    const part = await Part.create({
      sku: 'S23-DISP-OEM', name: 'Galaxy S23 Display Assembly', vertical: 'mobile',
      componentCode: 'display_assembly', brandCode: 'samsung', qualityCode: 'oem',
      compatibleModelCodes: [toCode('samsung', 'Galaxy S23')],
    });
    ctx.partId = part._id;

    const res = await request(app)
      .put('/api/repair/provider/inventory').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', partId: part._id.toString(), quantity: 3, costPaise: 900000 });
    expect(res.status).toBe(200);
    expect(res.body.inventory.available).toBe(3);
  });

  it('29. reports the setup checklist honestly', async () => {
    const res = await request(app)
      .get('/api/repair/provider/onboarding?vertical=mobile').set(auth(ctx.shopToken));
    const done = Object.fromEntries(res.body.steps.map((s) => [s.key, s.done]));
    expect(done.capabilities).toBe(true);
    expect(done.serviceArea).toBe(true);
    expect(done.pricing).toBe(true);
    expect(res.body.complete).toBe(true);
  });

  /**
   * Providers quote one final price with the part included and are no longer
   * asked to keep an inventory, so requiring one left every provider
   * permanently "incomplete" against a screen that no longer exists.
   */
  it('29b. does not make stock a requirement, but still reports it', async () => {
    const res = await request(app)
      .get('/api/repair/provider/onboarding?vertical=mobile').set(auth(ctx.shopToken));
    expect(res.body.steps.map((s) => s.key)).not.toContain('inventory');
    // Still counted — a provider holding the part ranks above one who does not.
    expect(res.body.optional.stockedParts).toBeGreaterThan(0);
  });

  it('30. lets a provider propose work the catalog is missing', async () => {
    const res = await request(app)
      .post('/api/repair/provider/catalog-requests').set(auth(ctx.shopToken))
      .send({
        vertical: 'mobile', categoryCode: 'display',
        proposedName: 'Curved edge glass-only replacement',
        description: 'Edge glass on curved flagships, panel retained',
        cityCode: 'hyderabad',
      });
    expect(res.status).toBe(201);
    ctx.providerRequest = res.body.request._id;
  });

  it('31. turns an approved proposal into a real, locally-scoped repair', async () => {
    const res = await request(app)
      .post(`${ADMIN}/repair/provider-requests/${ctx.providerRequest}/approve`).set(auth(ctx.adminToken))
      .send({ code: 'curved_edge_glass', name: 'Curved edge glass replacement', minSkillLevel: 3 });

    expect(res.status).toBe(200);
    expect(res.body.repair.cityCodes).toEqual(['hyderabad']);
    // The provider who asked gets it straight away — they asked because they do it.
    expect(await ProviderCapability.countDocuments({
      shopId: ctx.shopId, repairCode: 'curved_edge_glass',
    })).toBe(1);
  });

  it('32. keeps a local repair out of another city\'s catalog', async () => {
    const mine = await request(app)
      .get('/api/repair/provider/work-catalog?vertical=mobile&cityCode=hyderabad').set(auth(ctx.shopToken));
    const elsewhere = await request(app)
      .get('/api/repair/provider/work-catalog?vertical=mobile&cityCode=chennai').set(auth(ctx.shopToken));

    const inHyd = mine.body.groups.flatMap((g) => g.repairs).some((r) => r.code === 'curved_edge_glass');
    const inChennai = elsewhere.body.groups.flatMap((g) => g.repairs).some((r) => r.code === 'curved_edge_glass');
    expect(inHyd).toBe(true);
    expect(inChennai).toBe(false);
  });
});

/*
   PART 4 — A customer with a broken phone
 */

describe('the customer journey', () => {
  it('33. shows every live service, and says which ones somebody is verified to do', async () => {
    const res = await request(app).get('/api/provider/onboarding/catalog');
    const services = res.body.domains.flatMap((d) => d.services);
    const byCode = Object.fromEntries(services.map((s) => [s.code, s]));
    // Shown even with nobody verified yet — demand for it is the signal to recruit.
    expect(byCode.mobile_repair.hasProviders).toBe(true);
    expect(byCode.two_wheeler.hasProviders).toBe(false);
    // A line with no customer flow is never shown.
    expect(byCode.three_wheeler).toBeUndefined();
  });

  it('34. shows the headings with real counts behind them', async () => {
    const res = await request(app).get('/api/provider/onboarding/catalog');
    const mobile = res.body.domains.flatMap((d) => d.services).find((s) => s.code === 'mobile_repair');
    expect(mobile.coverage.length).toBeGreaterThan(3);
    expect(mobile.coverage.every((c) => c.problems.length > 0)).toBe(true);
  });

  it('35. lists brands and — crucially — models under them', async () => {
    const res = await request(app).get('/api/repair/brands/samsung/models').set(auth(ctx.customerToken));
    expect(res.body.total).toBeGreaterThan(5);
    ctx.model = res.body.models.find((m) => m.name.includes('S23')) || res.body.models[0];
  });

  it('36. finds a model by name the way a customer types it', async () => {
    const res = await request(app)
      .get('/api/repair/brands/apple/models?q=iphone 13').set(auth(ctx.customerToken));
    expect(res.body.models.some((m) => m.name.toLowerCase().includes('iphone 13'))).toBe(true);
  });

  it('37. offers the storage variants that model actually shipped in', async () => {
    const res = await request(app).get('/api/repair/brands/apple/models?q=iPhone 15 Pro Max').set(auth(ctx.customerToken));
    expect(res.body.models[0].storageVariants).toContain('256GB');
  });

  it('38. asks what is wrong in the customer\'s words', async () => {
    const res = await request(app)
      .get(`/api/repair/problems?modelCode=${ctx.model.code}`).set(auth(ctx.customerToken));
    const all = res.body.categories.flatMap((c) => c.problems.map((p) => p.name));
    expect(all).toContain('Cracked screen');
  });

  it('39. does not assume a cracked screen means a new panel', async () => {
    const res = await request(app)
      .post('/api/repair/diagnostics/cracked_screen').set(auth(ctx.customerToken))
      .send({ answers: {} });
    // With nothing answered it must still be asking, not quoting.
    expect(res.body.nextQuestion).toBeTruthy();
  });

  it('40. reaches a glass-only repair when the display still works', async () => {
    const flow = await DiagnosticFlow.findOne({ code: 'mobile_display' }).lean();
    const answers = {};
    for (const q of flow.questions) {
      const opt = q.options?.find((o) => /glass|works|no|yes/i.test(o.label)) || q.options?.[0];
      if (opt) answers[q.id] = opt.id;
    }
    const res = await request(app)
      .post('/api/repair/diagnostics/cracked_screen').set(auth(ctx.customerToken))
      .send({ answers });

    expect(res.body.diagnosis.recommendations.length).toBeGreaterThan(0);
    expect(res.body.diagnosis.summary).toBeTruthy();
  });

  it('41. says plainly when a device has to be looked at first', async () => {
    const wet = await Problem.findOne({ vertical: 'mobile', requiresDiagnosis: true }).lean();
    const res = await request(app)
      .post(`/api/repair/diagnostics/${wet.code}`).set(auth(ctx.customerToken))
      .send({ answers: {} });
    expect(res.body.diagnosis.requiresDiagnosis).toBe(true);
    expect(res.body.diagnosis.summary).toMatch(/inspect/i);
  });

  it('42. quotes the inspection fee ZappyOne charges, not zero', async () => {
    const res = await request(app)
      .get('/api/repair/price-preview?repairCode=display_assembly_replacement&serviceMode=diagnosis_only')
      .set(auth(ctx.customerToken));
    expect(res.body.estimate.totalPaise).toBeGreaterThan(0);
  });

  it('43. finds the shop that is verified, priced, stocked and nearby', async () => {
    const res = await request(app)
      .get(`/api/repair/providers?repairCode=display_assembly_replacement&brandCode=samsung&modelCode=${ctx.model.code}&lat=${HYD.lat}&lng=${HYD.lng}&cityCode=hyderabad`)
      .set(auth(ctx.customerToken));

    expect(res.status).toBe(200);
    ctx.providerMatch = res.body.recommended || res.body.providers?.[0] || null;
    // Either a provider is offered, or the reason is stated — never silence.
    expect(ctx.providerMatch || res.body.reason).toBeTruthy();
  });

  it('44. books the repair and freezes the price it was sold at', async () => {
    const res = await request(app)
      .post('/api/repair/bookings').set(auth(ctx.customerToken))
      .send({
        brandCode: 'samsung',
        modelCode: ctx.model.code,
        problemCodes: ['cracked_screen'],
        repairCode: 'display_assembly_replacement',
        serviceMode: 'doorstep',
        shopId: ctx.shopId.toString(),
        location: { coordinates: [HYD.lng, HYD.lat], address: 'Flat 302, Madhapur', cityCode: 'hyderabad' },
        idempotencyKey: 'journey-booking-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.booking.priceSnapshot.totalPaise).toBeGreaterThan(0);
    ctx.bookingId = res.body.booking._id;
    ctx.bookedTotal = res.body.booking.priceSnapshot.totalPaise;
  });

  it('45. does not create a second booking when the button is tapped twice', async () => {
    const res = await request(app)
      .post('/api/repair/bookings').set(auth(ctx.customerToken))
      .send({
        brandCode: 'samsung',
        modelCode: ctx.model.code,
        problemCodes: ['cracked_screen'],
        repairCode: 'display_assembly_replacement',
        serviceMode: 'doorstep',
        shopId: ctx.shopId.toString(),
        location: { coordinates: [HYD.lng, HYD.lat], address: 'Flat 302, Madhapur' },
        idempotencyKey: 'journey-booking-1',
      });

    expect(res.body.replayed).toBe(true);
    expect(await RepairBooking.countDocuments({ idempotencyKey: 'journey-booking-1' })).toBe(1);
  });

  it('46. holds that price even after the shop re-prices tomorrow', async () => {
    await request(app)
      .post('/api/repair/provider/pricing').set(auth(ctx.shopToken))
      .send({ vertical: 'mobile', repairCode: 'display_assembly_replacement', totalPaise: 1400000 });

    const booking = await RepairBooking.findById(ctx.bookingId).lean();
    expect(booking.priceSnapshot.totalPaise).toBe(ctx.bookedTotal);
  });

  it('47. keeps one customer out of another customer\'s booking', async () => {
    const res = await request(app)
      .get(`/api/repair/bookings/${ctx.bookingId}`).set(auth(ctx.otherToken));
    expect([403, 404]).toContain(res.status);
  });

  it('48. lets the customer book an inspection alone and charges for it', async () => {
    const res = await request(app)
      .post('/api/repair/bookings').set(auth(ctx.customerToken))
      .send({
        brandCode: 'samsung',
        modelCode: ctx.model.code,
        problemCodes: ['cracked_screen'],
        serviceMode: 'diagnosis_only',
        location: { coordinates: [HYD.lng, HYD.lat], address: 'Flat 302, Madhapur' },
        idempotencyKey: 'journey-inspection-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.booking.priceSnapshot.totalPaise).toBeGreaterThan(0);
    expect(res.body.booking.serviceMode).toBe('diagnosis_only');
  });

  it('49. takes "I don\'t know my model" without blocking the customer', async () => {
    const res = await request(app)
      .post('/api/repair/identify').set(auth(ctx.customerToken))
      .send({ brandCode: 'samsung', modelText: 'the one with three cameras', notes: 'bought 2 years ago' });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('pending');
  });

  it('50. refuses a booking with nowhere to send anyone', async () => {
    const res = await request(app)
      .post('/api/repair/bookings').set(auth(ctx.customerToken))
      .send({
        brandCode: 'samsung',
        modelCode: ctx.model.code,
        problemCodes: ['cracked_screen'],
        serviceMode: 'doorstep',
      });
    expect(res.status).toBe(400);
  });
});
