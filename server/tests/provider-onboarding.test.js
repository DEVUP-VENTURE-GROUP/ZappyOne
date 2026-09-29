/**
 * Provider onboarding, over HTTP: login → domain → service → verification.
 *
 * What this suite is really protecting:
 *
 *   THE BAR IS PER SERVICE. A shop verified for phones has proven nothing about
 *   laptops or scooters. Approval, and revocation, are scoped to one line.
 *
 *   THE REQUIREMENTS ARE DATA. Shops and individuals are asked for different
 *   documents, and a line can override its domain's defaults — all of it from
 *   rows an admin edits, none of it from code branches.
 *
 *   NOBODY APPROVES THEMSELVES. A provider can submit; only an admin decides.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const buildApp = require('../src/app');
const { signAccessToken } = require('../src/modules/auth/token.service');

const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const {
  ServiceDomain, ServiceLine, KycRequirementSet, ProviderEnrolment, ServiceLineRequest,
} = require('../src/modules/onboarding/onboarding.model');
const runner = require('../src/modules/onboarding/run-onboarding-seed');

jest.setTimeout(90000);

let app;
const ctx = {};
const ADMIN = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
const BASE = '/api/provider/onboarding';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  await startMongo();
  app = buildApp();

  // Seed through the real seeder — if it drifts from the models, this fails
  // here rather than on someone's first deploy.
  await runner.seedDomains();
  await runner.seedLines();
  await runner.seedRequirementSets();

  const shop = await Shop.create({
    businessName: 'City Mobile Care', ownerName: 'Rahul', phone: '9700000001',
    address: { text: '12 MG Road', location: { type: 'Point', coordinates: [78.48, 17.38] } },
  });
  const worker = await Worker.create({ phone: '9700000002', name: 'Imran', skills: ['mobile'] });

  ctx.shopId = shop._id;
  ctx.workerId = worker._id;
  ctx.shopToken = signAccessToken({ sub: shop._id.toString(), role: 'shop', phone: shop.phone });
  ctx.workerToken = signAccessToken({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });
  ctx.customerToken = signAccessToken({ sub: new mongoose.Types.ObjectId().toString(), role: 'user' });
  ctx.adminToken = await require('./helpers').adminToken();
});

afterAll(async () => { await stopMongo(); });

/* What a provider can sign up to */

describe('choosing what you work on', () => {
  it('lists the domains in order', async () => {
    const res = await request(app).get(`${BASE}/domains`).set(auth(ctx.shopToken));
    expect(res.status).toBe(200);
    expect(res.body.domains.map((d) => d.code))
      .toEqual(['electronics', 'vehicles', 'home_services', 'family_assist', 'helping_services', 'pet_services']);
  });

  it('shows which electronics services are actually open', async () => {
    const res = await request(app)
      .get(`${BASE}/lines?domainCode=electronics`)
      .set(auth(ctx.shopToken));

    const byCode = Object.fromEntries(res.body.lines.map((l) => [l.code, l]));
    expect(byCode.mobile_repair.status).toBe('live');
    expect(byCode.laptop_repair.status).toBe('live');
    // The line carries the repair vertical it hands off to.
    expect(byCode.laptop_repair.repairVertical).toBe('laptop');
  });

  it('shows what is coming without pretending it is open', async () => {
    const res = await request(app)
      .get(`${BASE}/lines?domainCode=vehicles`)
      .set(auth(ctx.shopToken));
    expect(res.body.lines.map((l) => l.code)).toEqual(['two_wheeler', 'three_wheeler', 'four_wheeler']);

    // Two-wheelers opened; the larger vehicles have no customer flow yet and
    // must keep saying so rather than quietly accepting applications.
    const byCode = Object.fromEntries(res.body.lines.map((l) => [l.code, l]));
    expect(byCode.two_wheeler.status).toBe('live');
    expect(byCode.two_wheeler.repairVertical).toBe('two_wheeler');
    expect(byCode.four_wheeler.status).toBe('live');
    expect(byCode.four_wheeler.repairVertical).toBe('four_wheeler');
    // Three-wheelers have no customer flow behind them yet, and the list must
    // keep saying so rather than quietly accepting applications.
    expect(byCode.three_wheeler.status).toBe('coming_soon');
    expect(byCode.three_wheeler.repairVertical).toBeFalsy();
  });

  it('hides individual-only work from a shop account', async () => {
    // Elder care is done by a person, not a storefront — a shop should never
    // be offered it in the first place.
    const forShop = await request(app).get(`${BASE}/lines?domainCode=family_assist`).set(auth(ctx.shopToken));
    expect(forShop.body.lines).toHaveLength(0);

    const forWorker = await request(app).get(`${BASE}/lines?domainCode=family_assist`).set(auth(ctx.workerToken));
    expect(forWorker.body.lines.map((l) => l.code)).toContain('elder_care');
  });

  it('refuses enrolment in a service with no customer flow behind it', async () => {
    // three_wheeler is the current example: seeded, visible, deliberately shut.
    const res = await request(app)
      .post(`${BASE}/enrolments`)
      .set(auth(ctx.shopToken))
      .send({ lineCode: 'three_wheeler' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LINE_NOT_LIVE');
  });

  it('enrols once per line, however many times you tap it', async () => {
    const first = await request(app)
      .post(`${BASE}/enrolments`).set(auth(ctx.shopToken)).send({ lineCode: 'mobile_repair' });
    expect(first.status).toBe(201);
    expect(first.body.enrolment.status).toBe('draft');

    const second = await request(app)
      .post(`${BASE}/enrolments`).set(auth(ctx.shopToken)).send({ lineCode: 'mobile_repair' });
    expect(second.body.enrolment._id).toBe(first.body.enrolment._id);

    expect(await ProviderEnrolment.countDocuments({ shopId: ctx.shopId, lineCode: 'mobile_repair' })).toBe(1);
    ctx.shopMobileEnrolment = first.body.enrolment._id;
  });

  it('is closed to customers', async () => {
    const res = await request(app).get(`${BASE}/domains`).set(auth(ctx.customerToken));
    expect(res.status).toBe(403);
  });
});

/* The verification each service demands */

describe('verification requirements', () => {
  it('asks a shop and an individual for different things', async () => {
    const shop = await request(app)
      .get(`${BASE}/lines/mobile_repair/requirements`).set(auth(ctx.shopToken));
    const individual = await request(app)
      .get(`${BASE}/lines/mobile_repair/requirements`).set(auth(ctx.workerToken));

    const shopDocs = shop.body.requirements.documents.map((d) => d.code);
    const soloDocs = individual.body.requirements.documents.map((d) => d.code);

    expect(shopDocs).toContain('shop_photo');      // a storefront exists to be photographed
    expect(soloDocs).toContain('aadhaar');         // a person is identified by their ID
    expect(soloDocs).not.toContain('shop_photo');
  });

  it('lets a line override its domain default', async () => {
    const laptop = await request(app)
      .get(`${BASE}/lines/laptop_repair/requirements`).set(auth(ctx.shopToken));
    const mobile = await request(app)
      .get(`${BASE}/lines/mobile_repair/requirements`).set(auth(ctx.shopToken));

    // Laptops carry customer data, so the laptop set adds a data declaration
    // and a workshop photo that phone repair does not ask for.
    expect(laptop.body.requirements.documents.map((d) => d.code)).toContain('workshop_photo');
    expect(mobile.body.requirements.documents.map((d) => d.code)).not.toContain('workshop_photo');
    expect(laptop.body.requirements.declarations.join(' ')).toMatch(/data/i);
    expect(laptop.body.requirements.minSkillLevel).toBe(2);
  });

  it('applies the strictest set to work done alone in someone\'s home', async () => {
    const res = await request(app)
      .get(`${BASE}/lines/elder_care/requirements`).set(auth(ctx.workerToken));
    const docs = res.body.requirements.documents.map((d) => d.code);
    expect(docs).toContain('police_verification');
    expect(docs).toContain('reference_letter');
  });
});

/* Submitting, and being told exactly what is missing */

describe('submitting for review', () => {
  it('refuses an incomplete application and names every gap', async () => {
    const res = await request(app)
      .post(`${BASE}/enrolments/${ctx.shopMobileEnrolment}/submit`)
      .set(auth(ctx.shopToken));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INCOMPLETE');
    const missing = res.body.missing.map((m) => m.code);
    expect(missing).toEqual(expect.arrayContaining(['owner_id', 'shop_photo', 'selfie', 'years_active']));
    // Optional items are not treated as gaps.
    expect(missing).not.toContain('gst_certificate');
  });

  it('rejects a GST number that is not one', async () => {
    await request(app)
      .patch(`${BASE}/enrolments/${ctx.shopMobileEnrolment}`)
      .set(auth(ctx.shopToken))
      .send({
        documents: [
          { code: 'owner_id', url: 's3://kyc/owner.jpg' },
          { code: 'shop_photo', url: 's3://kyc/shop.jpg' },
          { code: 'selfie', url: 's3://kyc/selfie.jpg' },
        ],
        fields: [{ code: 'years_active', value: '6' }, { code: 'gst_number', value: 'NOT-A-GST' }],
        acceptedDeclarations: true,
      });

    const res = await request(app)
      .post(`${BASE}/enrolments/${ctx.shopMobileEnrolment}/submit`)
      .set(auth(ctx.shopToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_FORMAT');
    expect(res.body.fields.map((f) => f.code)).toEqual(['gst_number']);
  });

  it('accepts a complete application and freezes the rules it was judged by', async () => {
    await request(app)
      .patch(`${BASE}/enrolments/${ctx.shopMobileEnrolment}`)
      .set(auth(ctx.shopToken))
      .send({ fields: [{ code: 'gst_number', value: '36ABCDE1234F1Z5' }] });

    const res = await request(app)
      .post(`${BASE}/enrolments/${ctx.shopMobileEnrolment}/submit`)
      .set(auth(ctx.shopToken));

    expect(res.status).toBe(200);
    expect(res.body.enrolment.status).toBe('pending_review');
    expect(res.body.enrolment.requirementSetId).toBeTruthy();
    expect(res.body.enrolment.submittedAt).toBeTruthy();
  });

  it('does not let a provider approve themselves', async () => {
    const res = await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${ctx.shopMobileEnrolment}/decide`)
      .set(auth(ctx.shopToken))
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);

    const row = await ProviderEnrolment.findById(ctx.shopMobileEnrolment).lean();
    expect(row.status).toBe('pending_review');
  });

  it('keeps one provider out of another\'s application', async () => {
    const res = await request(app)
      .patch(`${BASE}/enrolments/${ctx.shopMobileEnrolment}`)
      .set(auth(ctx.workerToken))
      .send({ fields: [{ code: 'years_active', value: '99' }] });
    expect(res.status).toBe(404);
  });
});

/* Admin review */

describe('admin review', () => {
  it('shows the queue with the business attached', async () => {
    const res = await request(app)
      .get(`${ADMIN}/onboarding/enrolments?status=pending_review`)
      .set(auth(ctx.adminToken));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const [row] = res.body.items;
    expect(row.provider.businessName).toBe('City Mobile Care');
    expect(row.line.name).toBe('Mobile Phones');
  });

  it('approves one line and opens exactly that vertical', async () => {
    const res = await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${ctx.shopMobileEnrolment}/decide`)
      .set(auth(ctx.adminToken))
      .send({ decision: 'approved', note: 'Storefront and ID verified' });
    expect(res.status).toBe(200);

    const status = await request(app).get(`${BASE}/status`).set(auth(ctx.shopToken));
    expect(status.body.approvedLineCodes).toEqual(['mobile_repair']);
    expect(status.body.repairVerticals).toEqual(['mobile']);

    // Approval is not the same as being findable: this shop has no photo and no
    // opening hours, so it is not live and the next step says which gap to close.
    const done = Object.fromEntries(status.body.storefront.map((s) => [s.key, s.done]));
    expect(done.services).toBe(true);
    expect(done.photo).toBe(false);
    expect(status.body.isLive).toBe(false);
    expect(status.body.nextStep.code).toBe('ADD_PHOTO');
  });

  it('suspends one line without touching another', async () => {
    // The same shop also applies for laptops and is approved.
    const created = await request(app)
      .post(`${BASE}/enrolments`).set(auth(ctx.shopToken)).send({ lineCode: 'laptop_repair' });
    const laptopId = created.body.enrolment._id;

    await request(app)
      .patch(`${BASE}/enrolments/${laptopId}`)
      .set(auth(ctx.shopToken))
      .send({
        documents: [
          { code: 'owner_id', url: 's3://kyc/owner.jpg' },
          { code: 'shop_photo', url: 's3://kyc/shop.jpg' },
          { code: 'selfie', url: 's3://kyc/selfie.jpg' },
          { code: 'workshop_photo', url: 's3://kyc/workshop.jpg' },
        ],
        fields: [{ code: 'years_active', value: '6' }],
        acceptedDeclarations: true,
      });
    await request(app).post(`${BASE}/enrolments/${laptopId}/submit`).set(auth(ctx.shopToken));
    await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${laptopId}/decide`)
      .set(auth(ctx.adminToken)).send({ decision: 'approved' });

    let status = await request(app).get(`${BASE}/status`).set(auth(ctx.shopToken));
    expect(status.body.repairVerticals.sort()).toEqual(['laptop', 'mobile']);

    // Something goes wrong with their laptop work specifically.
    await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${laptopId}/decide`)
      .set(auth(ctx.adminToken))
      .send({ decision: 'suspended', note: 'Data handling complaint under investigation' });

    status = await request(app).get(`${BASE}/status`).set(auth(ctx.shopToken));
    expect(status.body.repairVerticals).toEqual(['mobile']);   // phone work continues
    expect(status.body.approvedLineCodes).toEqual(['mobile_repair']);
  });

  it('tells a rejected provider what to fix', async () => {
    const created = await request(app)
      .post(`${BASE}/enrolments`).set(auth(ctx.workerToken)).send({ lineCode: 'mobile_repair' });
    const id = created.body.enrolment._id;

    await request(app)
      .patch(`${BASE}/enrolments/${id}`)
      .set(auth(ctx.workerToken))
      .send({
        documents: [
          { code: 'aadhaar', url: 's3://kyc/aadhaar.jpg' },
          { code: 'selfie', url: 's3://kyc/selfie.jpg' },
        ],
        fields: [{ code: 'experience_years', value: '3' }],
        acceptedDeclarations: true,
      });
    await request(app).post(`${BASE}/enrolments/${id}/submit`).set(auth(ctx.workerToken));

    await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${id}/decide`)
      .set(auth(ctx.adminToken))
      .send({ decision: 'rejected', note: 'Aadhaar photo is cut off — please re-upload' });

    const status = await request(app).get(`${BASE}/status`).set(auth(ctx.workerToken));
    expect(status.body.nextStep.code).toBe('FIX_REJECTED');

    const rows = await request(app).get(`${BASE}/enrolments`).set(auth(ctx.workerToken));
    expect(rows.body.enrolments[0].reviewNote).toMatch(/cut off/);
  });
});

/* "My service isn't listed" */

describe('provider-proposed services', () => {
  it('records the request once, however often it is sent', async () => {
    const first = await request(app)
      .post(`${BASE}/line-requests`)
      .set(auth(ctx.shopToken))
      .send({ domainCode: 'electronics', proposedName: 'Smart Watch Repair', description: 'Screens and batteries' });
    expect(first.status).toBe(201);

    const again = await request(app)
      .post(`${BASE}/line-requests`)
      .set(auth(ctx.shopToken))
      .send({ domainCode: 'electronics', proposedName: 'smart watch repair' });
    expect(again.status).toBe(200);
    expect(again.body.deduped).toBe(true);

    expect(await ServiceLineRequest.countDocuments({ shopId: ctx.shopId })).toBe(1);
  });

  it('creates a real service line when admin approves it', async () => {
    const pending = await request(app)
      .get(`${ADMIN}/onboarding/line-requests?status=pending`)
      .set(auth(ctx.adminToken));
    const id = pending.body.items[0]._id;

    const res = await request(app)
      .post(`${ADMIN}/onboarding/line-requests/${id}/approve`)
      .set(auth(ctx.adminToken))
      .send({ code: 'smartwatch_repair', domainCode: 'electronics', status: 'coming_soon' });

    expect(res.status).toBe(200);
    expect(res.body.line.code).toBe('smartwatch_repair');

    const lines = await request(app)
      .get(`${BASE}/lines?domainCode=electronics`).set(auth(ctx.shopToken));
    expect(lines.body.lines.map((l) => l.code)).toContain('smartwatch_repair');
  });
});

/* Admin can change the rules without a deploy */

describe('the catalog is data', () => {
  it('opens a new service line from the admin panel alone', async () => {
    const domain = await request(app)
      .post(`${ADMIN}/onboarding/domains`)
      .set(auth(ctx.adminToken))
      .send({ code: 'pets', name: 'Pet Care', displayOrder: 9 });
    expect(domain.status).toBe(201);

    await request(app)
      .post(`${ADMIN}/onboarding/lines`)
      .set(auth(ctx.adminToken))
      .send({ code: 'aquarium_care', name: 'Aquarium Care', domainCode: 'pets', status: 'live' });

    await request(app)
      .post(`${ADMIN}/onboarding/requirements`)
      .set(auth(ctx.adminToken))
      .send({
        name: 'Pets — individual',
        domainCode: 'pets',
        providerKind: 'individual',
        documents: [{ code: 'aadhaar', label: 'Aadhaar card', required: true }],
        fields: [],
      });

    const enrol = await request(app)
      .post(`${BASE}/enrolments`).set(auth(ctx.workerToken)).send({ lineCode: 'aquarium_care' });
    expect(enrol.status).toBe(201);

    const reqs = await request(app)
      .get(`${BASE}/lines/aquarium_care/requirements`).set(auth(ctx.workerToken));
    expect(reqs.body.requirements.documents.map((d) => d.code)).toEqual(['aadhaar']);
  });

  it('archives a line instead of deleting it', async () => {
    const line = await ServiceLine.findOne({ code: 'aquarium_care' });
    const res = await request(app)
      .delete(`${ADMIN}/onboarding/lines/${line._id}`)
      .set(auth(ctx.adminToken));

    expect(res.status).toBe(200);
    const after = await ServiceLine.findById(line._id).lean();
    expect(after.isArchived).toBe(true);
    expect(after.isActive).toBe(false);

    // The provider who already enrolled keeps their record — it is not orphaned.
    const rows = await request(app).get(`${BASE}/enrolments`).set(auth(ctx.workerToken));
    expect(rows.body.enrolments.some((e) => e.lineCode === 'aquarium_care')).toBe(true);
  });
});

/* The customer-facing catalog */

/**
 * Customers see the same rows providers are verified against, plus the jobs
 * they actually arrive with.
 *
 * "Phone Repair" is a category, not a reason to open the app. The popular
 * symptoms are what make the list usable — and they are a flag on the problem
 * row, so which ones surface is an admin decision.
 */
describe('customer catalog', () => {
  const { ProblemCategory, Problem } = require('../src/modules/repair/models/problem.model');

  beforeAll(async () => {
    // liveCatalog now requires a real APPROVED enrolment, not just a `live`
    // line — a line can be flipped live before anyone is onboarded, and the
    // catalog must not advertise a service with nobody behind it. ctx.shopId
    // already carries mobile_repair; laptop needs an approved provider too,
    // but ctx.shopId's OWN laptop enrolment is deliberately suspended and
    // restored by a later describe block, so a second, independent shop is
    // used here rather than disturbing that shared fixture.
    const laptopShop = await Shop.create({
      businessName: 'Laptop Fix Co', ownerName: 'Asha', phone: '9700000099',
      address: { text: '1 Test Road', location: { type: 'Point', coordinates: [78.48, 17.38] } },
    });
    await ProviderEnrolment.create({
      shopId: laptopShop._id, providerKind: 'shop',
      lineCode: 'laptop_repair', domainCode: 'electronics', status: 'approved',
    });

    const cat = await ProblemCategory.create({ code: 'display', name: 'Display', vertical: 'mobile' });
    await Problem.insertMany([
      {
        code: 'cracked_screen', name: 'Cracked screen', vertical: 'mobile',
        categoryId: cat._id, categoryCode: 'display', isPopular: true, displayOrder: 1,
      },
      {
        code: 'ghost_touch', name: 'Ghost touch', vertical: 'mobile',
        categoryId: cat._id, categoryCode: 'display', isPopular: false, displayOrder: 2,
      },
    ]);
  });

  it('is public — the home page renders before anyone signs in', async () => {
    const res = await request(app).get(`${BASE}/catalog`);
    expect(res.status).toBe(200);
  });

  it('lists only services that are live and have somewhere to send the customer', async () => {
    const res = await request(app).get(`${BASE}/catalog`);
    const electronics = res.body.domains.find((d) => d.code === 'electronics');

    expect(electronics.services.map((s) => s.code).sort())
      .toEqual(['laptop_repair', 'mobile_repair']);
    expect(electronics.services.every((s) => s.path)).toBe(true);

    // Vehicles are seeded but not live, so the domain is absent entirely rather
    // than shown as an empty category.
    expect(res.body.domains.map((d) => d.code)).not.toContain('vehicles');
  });

  it('groups what a service covers under its headings', async () => {
    const res = await request(app).get(`${BASE}/catalog`);
    const mobile = res.body.domains
      .find((d) => d.code === 'electronics')
      .services.find((s) => s.code === 'mobile_repair');

    const display = mobile.coverage.find((g) => g.code === 'display');
    expect(display.name).toBe('Display');
    // Both problems live under this heading, popular or not — the heading page
    // is the full list, not the shortlist.
    expect(display.problems.map((p) => p.code).sort()).toEqual(['cracked_screen', 'ghost_touch']);
  });

  it('drops a heading with nothing under it', async () => {
    const { ProblemCategory: PC } = require('../src/modules/repair/models/problem.model');
    await PC.create({ code: 'audio', name: 'Audio', vertical: 'mobile' });

    const res = await request(app).get(`${BASE}/catalog`);
    const mobile = res.body.domains
      .find((d) => d.code === 'electronics')
      .services.find((s) => s.code === 'mobile_repair');

    // An empty heading reads as a gap in what we cover, so it is not shown.
    expect(mobile.coverage.map((g) => g.code)).not.toContain('audio');
  });

  it('surfaces the popular symptoms, and only those', async () => {
    const res = await request(app).get(`${BASE}/catalog`);
    const mobile = res.body.domains
      .find((d) => d.code === 'electronics')
      .services.find((s) => s.code === 'mobile_repair');

    const codes = mobile.highlights.map((h) => h.code);
    expect(codes).toContain('cracked_screen');
    expect(codes).not.toContain('ghost_touch');
  });

  it('does not leak one vertical\'s symptoms into another', async () => {
    const res = await request(app).get(`${BASE}/catalog`);
    const laptop = res.body.domains
      .find((d) => d.code === 'electronics')
      .services.find((s) => s.code === 'laptop_repair');

    // The seeded problems above are all mobile — laptop has none of its own yet,
    // and must show an empty list rather than borrowing the phone ones.
    expect(laptop.highlights).toEqual([]);
  });

  it('hides a service the moment an operator takes it off live', async () => {
    await ServiceLine.updateOne({ code: 'laptop_repair' }, { $set: { status: 'coming_soon' } });
    const res = await request(app).get(`${BASE}/catalog`);
    const electronics = res.body.domains.find((d) => d.code === 'electronics');
    expect(electronics.services.map((s) => s.code)).toEqual(['mobile_repair']);

    await ServiceLine.updateOne({ code: 'laptop_repair' }, { $set: { status: 'live' } });
  });
});

/* One verification, not two */

/**
 * A provider who has just had documents reviewed must not be asked for the same
 * documents again under a different name. The service review IS the identity
 * check — it examined the Aadhaar, the selfie, the storefront — so approving it
 * settles the legacy KYC record too.
 */
describe('verification is not asked for twice', () => {
  it('marks the shop verified once a service is approved', async () => {
    // The suite approved this shop's mobile_repair enrolment earlier.
    const shop = await Shop.findById(ctx.shopId).lean();

    expect(shop.kyc.status).toBe('approved');
    expect(shop.kyc.shopPhotoUrl).toBe('s3://kyc/shop.jpg');
    expect(shop.kyc.ownerIdUrl).toBe('s3://kyc/owner.jpg');
    expect(shop.kyc.gstNumber).toBe('36ABCDE1234F1Z5');
  });

  it('does not verify anyone whose application was rejected', async () => {
    // The worker's mobile_repair application was rejected earlier in the suite.
    const worker = await Worker.findById(ctx.workerId).lean();
    expect(worker.kyc?.status).not.toBe('approved');
  });

  it('carries the liveness evidence across, not just the file', async () => {
    const worker = await Worker.create({ phone: '9700000009', name: 'Live Capture Tech' });
    const token = signAccessToken({ sub: worker._id.toString(), role: 'worker', phone: worker.phone });

    const created = await request(app)
      .post(`${BASE}/enrolments`).set(auth(token)).send({ lineCode: 'mobile_repair' });
    const id = created.body.enrolment._id;

    await request(app)
      .patch(`${BASE}/enrolments/${id}`)
      .set(auth(token))
      .send({
        documents: [
          { code: 'aadhaar', url: 's3://kyc/live-aadhaar.jpg' },
          {
            code: 'selfie',
            url: 's3://kyc/live-selfie.jpg',
            captureMethod: 'live_camera',
            capturedAt: new Date().toISOString(),
            lat: 17.44,
            lng: 78.35,
          },
        ],
        fields: [{ code: 'experience_years', value: '5' }],
        acceptedDeclarations: true,
      });
    await request(app).post(`${BASE}/enrolments/${id}/submit`).set(auth(token));
    await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${id}/decide`)
      .set(auth(ctx.adminToken))
      .send({ decision: 'approved' });

    const after = await Worker.findById(worker._id).lean();
    expect(after.kyc.status).toBe('approved');
    expect(after.kyc.selfieUrl).toBe('s3://kyc/live-selfie.jpg');
    // The distinction a reviewer cares about: taken here and now, not uploaded.
    expect(after.kyc.selfieMetadata.captureMethod).toBe('live_camera');
    expect(after.kyc.selfieMetadata.lat).toBeCloseTo(17.44);
  });

  it('records how each document was obtained', async () => {
    const rows = await request(app)
      .get(`${ADMIN}/onboarding/enrolments?status=approved`)
      .set(auth(ctx.adminToken));

    const withSelfie = rows.body.items
      .flatMap((r) => r.documents || [])
      .find((d) => d.code === 'selfie' && d.captureMethod === 'live_camera');

    expect(withSelfie).toBeTruthy();
    expect(withSelfie.lat).toBeCloseTo(17.44);
  });

  it('demands a live capture for the documents that say so', async () => {
    const res = await request(app)
      .get(`${BASE}/lines/mobile_repair/requirements`)
      .set(auth(ctx.shopToken));

    const byCode = Object.fromEntries(res.body.requirements.documents.map((d) => [d.code, d]));
    // A selfie proves the person is here now; a gallery photo proves nothing.
    expect(byCode.selfie.capture).toBe('user');
    // A storefront has to be photographed AT the storefront.
    expect(byCode.shop_photo.capture).toBe('environment');
    // A GST certificate is a document someone already holds — a file is correct.
    expect(byCode.gst_certificate.capture).toBe('');
  });
});

/* The shop's public listing follows its verification */

/**
 * "Nearby Shops" only shows shops whose `services` list is non-empty, and
 * filters customers to shops by that list. Since the owner no longer types it
 * in, verification has to maintain it — otherwise a fully approved shop is
 * invisible, which is the worst possible failure: silent.
 */
describe('shop listing follows verification', () => {
  it('lists the shop for exactly what it is approved for', async () => {
    const shop = await Shop.findById(ctx.shopId);

    // Approved for phones earlier; laptops were approved and then suspended.
    expect(shop.services).toEqual(['mobile_repair']);
    expect(shop.isDiscoverable()).toBe(true);
  });

  it('drops a service from the listing when it is suspended', async () => {
    const laptop = await ProviderEnrolment.findOne({ shopId: ctx.shopId, lineCode: 'laptop_repair' });
    expect(laptop.status).toBe('suspended');

    const shop = await Shop.findById(ctx.shopId).lean();
    expect(shop.services).not.toContain('laptop_repair');
  });

  it('puts it back when the suspension is lifted', async () => {
    const laptop = await ProviderEnrolment.findOne({ shopId: ctx.shopId, lineCode: 'laptop_repair' });

    await request(app)
      .post(`${ADMIN}/onboarding/enrolments/${laptop._id}/decide`)
      .set(auth(ctx.adminToken))
      .send({ decision: 'approved', note: 'Complaint resolved' });

    const shop = await Shop.findById(ctx.shopId).lean();
    expect(shop.services.sort()).toEqual(['laptop_repair', 'mobile_repair']);
  });
});
