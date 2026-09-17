/**
 * Deep catalog + "I don't know my model" — over HTTP, both verticals live.
 *
 * Three things are being protected here:
 *
 *   1. THE LAPTOP PICKER RESOLVES TO AN EXACT UNIT. Brand → type → family →
 *      model → configuration exists because "HP Pavilion" is not a machine, and
 *      ordering a panel against a family name is how the wrong screen ships.
 *
 *   2. MOBILE IS UNTOUCHED (§91). Mobile models predate the `vertical` field,
 *      so the filter has to tolerate rows that simply do not carry it — a strict
 *      match would silently empty the phone catalog in production.
 *
 *   3. CODES ARE ONLY UNIQUE PER VERTICAL. Both verticals own a QA checklist
 *      coded `display`. Every lookup by code must therefore be scoped, or a
 *      laptop job gets a phone's checklist.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const buildApp = require('../src/app');
const { signAccessToken } = require('../src/modules/auth/token.service');

const User = require('../src/modules/user/user.model');
const Brand = require('../src/modules/service/brand.model');
const DeviceModel = require('../src/modules/service/device-model.model');
const {
  ProductType, ProductFamily, ProductSeries, DeviceConfiguration, ModelIdentificationRequest,
} = require('../src/modules/repair/models/catalog.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { QAChecklist, RepairConfig } = require('../src/modules/repair/models/config.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const bookingService = require('../src/modules/repair/services/booking.service');

jest.setTimeout(90000);

let app;
const ctx = {};

beforeAll(async () => {
  await startMongo();
  app = buildApp();

  await RepairConfig.insertMany([{ vertical: 'mobile' }, { vertical: 'laptop' }]);

  /* ── Laptop side: a full chain down to two incompatible builds ── */
  const lenovo = await Brand.create({ code: 'lenovo', name: 'Lenovo', category: 'laptop' });
  await ProductType.insertMany([
    { code: 'business_laptop', name: 'Business Laptop', vertical: 'laptop', displayOrder: 1, isPopular: true },
    { code: 'gaming_laptop', name: 'Gaming Laptop', vertical: 'laptop', displayOrder: 2 },
  ]);
  await ProductFamily.create({
    code: 'thinkpad', name: 'ThinkPad', vertical: 'laptop',
    brandCode: 'lenovo', productTypeCode: 'business_laptop', isPopular: true,
  });
  await ProductFamily.create({
    code: 'legion', name: 'Legion', vertical: 'laptop',
    brandCode: 'lenovo', productTypeCode: 'gaming_laptop',
  });
  await ProductSeries.create({
    code: 'thinkpad-e', name: 'ThinkPad E Series', vertical: 'laptop',
    brandCode: 'lenovo', familyCode: 'thinkpad',
  });

  const laptopModel = await DeviceModel.create({
    brandId: lenovo._id, brandCode: 'lenovo', vertical: 'laptop',
    name: 'ThinkPad E14 Gen 5', code: 'lenovo-thinkpad-e14-g5',
    productTypeCode: 'business_laptop', familyCode: 'thinkpad', seriesCode: 'thinkpad-e',
    productNumbers: ['21JK0005IN'],
  });
  ctx.laptopModelCode = laptopModel.code;

  await DeviceModel.create({
    brandId: lenovo._id, brandCode: 'lenovo', vertical: 'laptop',
    name: 'Legion 5 Pro', code: 'lenovo-legion-5-pro',
    productTypeCode: 'gaming_laptop', familyCode: 'legion',
  });

  ctx.fhd = await DeviceConfiguration.create({
    code: 'e14-g5-fhd', name: 'i5 / 16GB / 512GB / FHD', vertical: 'laptop',
    modelId: laptopModel._id, modelCode: laptopModel.code,
    displaySize: '14', displayResolution: '1920x1080', displayPanel: 'IPS', isTouch: false,
  });
  ctx.touch = await DeviceConfiguration.create({
    code: 'e14-g5-touch', name: 'i7 / 16GB / 1TB / FHD Touch', vertical: 'laptop',
    modelId: laptopModel._id, modelCode: laptopModel.code,
    displaySize: '14', displayResolution: '1920x1080', displayPanel: 'IPS', isTouch: true,
  });

  /* ── A configuration belonging to a DIFFERENT model ── */
  const legion = await DeviceModel.findOne({ code: 'lenovo-legion-5-pro' });
  ctx.legionConfig = await DeviceConfiguration.create({
    code: 'legion-5-qhd', name: 'i7 / 16GB / RTX 4060 / QHD 165Hz', vertical: 'laptop',
    modelId: legion._id, modelCode: legion.code,
  });

  /* ── Mobile side: a legacy row written before `vertical` existed ── */
  const samsung = await Brand.create({ code: 'samsung', name: 'Samsung', category: 'mobile' });
  const legacy = await DeviceModel.create({
    brandId: samsung._id, brandCode: 'samsung',
    name: 'Galaxy S23 Ultra', code: 'samsung-s23-ultra',
  });
  // Strip the field entirely — this is what production rows actually look like.
  await DeviceModel.collection.updateOne({ _id: legacy._id }, { $unset: { vertical: '' } });

  /* ── The same checklist code in both verticals ── */
  await QAChecklist.insertMany([
    {
      code: 'display', name: 'Mobile display QA', vertical: 'mobile',
      items: [{ code: 'touch', label: 'Touch responds across the panel', required: true }],
    },
    {
      code: 'display', name: 'Laptop display QA', vertical: 'laptop',
      items: [{ code: 'hinge', label: 'Image stable through the full lid arc', required: true }],
    },
  ]);
  await Repair.create({
    code: 'screen_replacement', name: 'Screen replacement', vertical: 'laptop',
    pricingMode: 'fixed', allowedServiceModes: ['doorstep', 'pickup_repair'],
    qaChecklistCodes: ['display'],
  });

  // A reference band so the booking below is priceable without a provider.
  await ZappyReferencePricing.create({
    vertical: 'laptop', repairCode: 'screen_replacement',
    minPaise: 450000, recommendedPaise: 620000, maxPaise: 900000,
    partCostPaise: 480000, labourPaise: 140000, warrantyDays: 90,
  });

  /* ── Actors ── */
  const customer = await User.create({ phone: '9800000001', name: 'Laptop Owner' });
  const other = await User.create({ phone: '9800000002', name: 'Someone Else' });
  ctx.customerId = customer._id;
  ctx.customerToken = signAccessToken({ sub: customer._id.toString(), role: 'user', phone: customer.phone });
  ctx.otherToken = signAccessToken({ sub: other._id.toString(), role: 'user', phone: other.phone });
  ctx.adminToken = signAccessToken({ sub: new mongoose.Types.ObjectId().toString(), role: 'admin' });
});

afterAll(async () => { await stopMongo(); });

const auth = (token) => ({ Authorization: `Bearer ${token}` });
// The slug comes from the environment, not a literal — .env supplies the real
// one and a hardcoded guess silently 404s every admin assertion.
const ADMIN = `/api/${process.env.ADMIN_LOGIN_SLUG}`;

/* ─── The picker ───────────────────────────────────────────────────────── */

describe('deep catalog', () => {
  it('lists laptop product types, and none for mobile', async () => {
    const laptop = await request(app)
      .get('/api/repair/product-types?vertical=laptop')
      .set(auth(ctx.customerToken));
    expect(laptop.status).toBe(200);
    expect(laptop.body.productTypes.map((t) => t.code)).toEqual(['business_laptop', 'gaming_laptop']);
    expect(laptop.body.popular.map((t) => t.code)).toEqual(['business_laptop']);

    // Mobile identifies at model level, so it has no product types at all —
    // and must not inherit the laptop ones.
    const mobile = await request(app)
      .get('/api/repair/product-types')
      .set(auth(ctx.customerToken));
    expect(mobile.body.productTypes).toHaveLength(0);
  });

  it('narrows families by product type', async () => {
    const res = await request(app)
      .get('/api/repair/brands/lenovo/families?vertical=laptop&productTypeCode=gaming_laptop')
      .set(auth(ctx.customerToken));
    expect(res.status).toBe(200);
    expect(res.body.families.map((f) => f.code)).toEqual(['legion']);
  });

  it('narrows series by family', async () => {
    const res = await request(app)
      .get('/api/repair/brands/lenovo/series?vertical=laptop&familyCode=thinkpad')
      .set(auth(ctx.customerToken));
    expect(res.body.series.map((s) => s.code)).toEqual(['thinkpad-e']);
  });

  it('narrows models by family, and finds one by the number on the sticker', async () => {
    const byFamily = await request(app)
      .get('/api/repair/brands/lenovo/models?vertical=laptop&familyCode=thinkpad')
      .set(auth(ctx.customerToken));
    expect(byFamily.body.models.map((m) => m.code)).toEqual(['lenovo-thinkpad-e14-g5']);

    // Owners read "21JK0005IN" off the base far more reliably than they recall
    // "ThinkPad E14 Gen 5", so the search has to cover it.
    const byNumber = await request(app)
      .get('/api/repair/brands/lenovo/models?vertical=laptop&q=21JK0005')
      .set(auth(ctx.customerToken));
    expect(byNumber.body.models.map((m) => m.code)).toEqual(['lenovo-thinkpad-e14-g5']);
  });

  it('still lists legacy mobile models that carry no vertical field', async () => {
    const stored = await DeviceModel.collection.findOne({ code: 'samsung-s23-ultra' });
    expect(stored.vertical).toBeUndefined();   // the production shape

    const res = await request(app)
      .get('/api/repair/brands/samsung/models')
      .set(auth(ctx.customerToken));
    expect(res.body.models.map((m) => m.code)).toEqual(['samsung-s23-ultra']);
  });

  it('returns the exact builds of one model', async () => {
    const res = await request(app)
      .get(`/api/repair/models/${ctx.laptopModelCode}/configurations?vertical=laptop`)
      .set(auth(ctx.customerToken));
    expect(res.body.configurations.map((c) => c.code).sort())
      .toEqual(['e14-g5-fhd', 'e14-g5-touch']);
    // Touch vs non-touch is the whole reason this layer exists.
    expect(res.body.configurations.find((c) => c.code === 'e14-g5-touch').isTouch).toBe(true);
  });

  it('rejects an unrecognised vertical instead of quietly serving mobile', async () => {
    const res = await request(app)
      .get('/api/repair/product-types?vertical=tractor')
      .set(auth(ctx.customerToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_VERTICAL');
  });
});

/* ─── "I don't know my model" ──────────────────────────────────────────── */

describe('model identification', () => {
  it('refuses an empty request — there is nothing for a human to work from', async () => {
    const res = await request(app)
      .post('/api/repair/identify')
      .set(auth(ctx.customerToken))
      .send({ vertical: 'laptop', brandCode: 'lenovo' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDENTIFICATION_EMPTY');
  });

  it('accepts whatever the customer can give and shows it back to them only', async () => {
    const created = await request(app)
      .post('/api/repair/identify')
      .set(auth(ctx.customerToken))
      .send({ vertical: 'laptop', brandCode: 'lenovo', productNumber: '21JK0005IN' });
    expect(created.status).toBe(201);
    expect(created.body.request.status).toBe('pending');
    ctx.requestId = created.body.request._id;

    const mine = await request(app)
      .get('/api/repair/identify/mine?vertical=laptop')
      .set(auth(ctx.customerToken));
    expect(mine.body.requests).toHaveLength(1);

    // Scoped by token, not by anything the caller sends.
    const theirs = await request(app)
      .get('/api/repair/identify/mine?vertical=laptop')
      .set(auth(ctx.otherToken));
    expect(theirs.body.requests).toHaveLength(0);
  });

  it('will not resolve a laptop enquiry to a phone', async () => {
    const res = await request(app)
      .post(`${ADMIN}/repair/identification-requests/${ctx.requestId}/resolve`)
      .set(auth(ctx.adminToken))
      .send({ status: 'identified', modelCode: 'samsung-s23-ultra' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_MODEL');
  });

  it('will not attach a configuration from a different model', async () => {
    const res = await request(app)
      .post(`${ADMIN}/repair/identification-requests/${ctx.requestId}/resolve`)
      .set(auth(ctx.adminToken))
      .send({
        status: 'identified',
        modelCode: ctx.laptopModelCode,
        configurationCode: ctx.legionConfig.code,
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_CONFIGURATION');
  });

  it('resolves to an exact build and hands it back to the customer', async () => {
    const res = await request(app)
      .post(`${ADMIN}/repair/identification-requests/${ctx.requestId}/resolve`)
      .set(auth(ctx.adminToken))
      .send({
        status: 'identified',
        modelCode: ctx.laptopModelCode,
        configurationCode: 'e14-g5-touch',
        note: 'Product number matches the touch build.',
      });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('identified');

    const mine = await request(app)
      .get('/api/repair/identify/mine?vertical=laptop')
      .set(auth(ctx.customerToken));
    const [row] = mine.body.requests;
    expect(row.status).toBe('identified');
    expect(row.resolvedModelId.code).toBe(ctx.laptopModelCode);
    expect(row.resolvedConfigurationId.code).toBe('e14-g5-touch');
  });

  it('shows the queue to admin scoped to the vertical being worked', async () => {
    const laptop = await request(app)
      .get(`${ADMIN}/repair/identification-requests?vertical=laptop`)
      .set(auth(ctx.adminToken));
    expect(laptop.body.items).toHaveLength(1);

    const mobile = await request(app)
      .get(`${ADMIN}/repair/identification-requests`)
      .set(auth(ctx.adminToken));
    expect(mobile.body.items).toHaveLength(0);
  });

  it('is admin-only', async () => {
    const res = await request(app)
      .get(`${ADMIN}/repair/identification-requests?vertical=laptop`)
      .set(auth(ctx.customerToken));
    expect(res.status).toBe(403);
  });
});

/* ─── Configuration on the booking ─────────────────────────────────────── */

describe('booking with an exact build', () => {
  const base = {
    userId: null,
    vertical: 'laptop',
    brandCode: 'lenovo',
    serviceMode: 'doorstep',
    location: { coordinates: [78.34, 17.44], address: 'Test address', cityCode: 'hyderabad' },
  };

  it('refuses a configuration that belongs to another model', async () => {
    await expect(bookingService.createBooking({
      ...base,
      userId: ctx.customerId,
      modelCode: 'lenovo-thinkpad-e14-g5',
      configurationCode: 'legion-5-qhd',
      problemCodes: [],
    })).rejects.toMatchObject({ code: 'UNKNOWN_CONFIGURATION' });
  });

  it('freezes the build onto the booking as text, not a join', async () => {
    const { booking } = await bookingService.createBooking({
      ...base,
      userId: ctx.customerId,
      modelCode: 'lenovo-thinkpad-e14-g5',
      configurationCode: 'e14-g5-touch',
    });

    expect(booking.configurationCode).toBe('e14-g5-touch');
    expect(booking.configurationLabel).toBe('i7 / 16GB / 1TB / FHD Touch');

    // Renaming the catalog row must not rewrite what the customer was told.
    await DeviceConfiguration.updateOne({ code: 'e14-g5-touch' }, { $set: { name: 'Renamed build' } });
    const stored = await RepairBooking.findById(booking._id).lean();
    expect(stored.configurationLabel).toBe('i7 / 16GB / 1TB / FHD Touch');
  });
});

/* ─── Per-vertical codes ───────────────────────────────────────────────── */

describe('codes are scoped to their vertical', () => {
  it('gives a laptop booking the laptop QA checklist, not the phone one', async () => {
    const { booking } = await bookingService.createBooking({
      userId: ctx.customerId,
      vertical: 'laptop',
      brandCode: 'lenovo',
      modelCode: 'lenovo-thinkpad-e14-g5',
      repairCode: 'screen_replacement',
      serviceMode: 'doorstep',
      location: { coordinates: [78.34, 17.44], address: 'Test address' },
    });

    const res = await request(app)
      .get(`/api/repair/bookings/${booking._id}/qa-checklist`)
      .set(auth(ctx.customerToken));

    expect(res.status).toBe(200);
    // Both verticals own a checklist coded `display`; only one is correct here.
    expect(res.body.checklist.name).toBe('Laptop display QA');
    expect(res.body.checklist.vertical).toBe('laptop');
  });
});
