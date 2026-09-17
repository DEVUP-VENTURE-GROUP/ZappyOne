/**
 * Provider matching + ranking tests.
 *
 * The distinction under test is eligibility vs ranking: a provider who cannot
 * do the job must be REMOVED (with a reason), never merely scored lower. The
 * cheapest-but-unstocked case is the one that matters commercially — ranking it
 * first would hand the customer a booking that cannot be fulfilled.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { Repair } = require('../src/modules/repair/models/repair.model');
const { Part, PartQuality } = require('../src/modules/repair/models/part.model');
const { ProviderInventory } = require('../src/modules/repair/models/inventory.model');
const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
const { ProviderServiceArea, RepairConfig } = require('../src/modules/repair/models/config.model');
const { ProviderPricing } = require('../src/modules/repair/models/pricing.model');
const Worker = require('../src/modules/worker/worker.model');
const matching = require('../src/modules/repair/services/matching.service');
const pricingService = require('../src/modules/repair/services/pricing.service');

jest.setTimeout(60000);

// Hyderabad-ish reference point used for all geo assertions.
const LAT = 17.4400;
const LNG = 78.3489;

const ids = {};

/** A fully eligible provider; individual tests break one thing at a time. */
async function makeProvider({
  name, priceP, distanceKm = 1, rating = 4.5, stock = 5, skill = 3,
  warrantyDays = 180, qualityCode = 'premium', completedJobs = 50,
}) {
  const worker = await Worker.create({
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    name,
    rating,
    completedJobs,
    skills: ['display_assembly_replacement'],
    kyc: { status: 'approved' },
    isBlocked: false,
  });

  // Offset latitude so each provider sits a predictable distance away.
  const dLat = distanceKm / 111;
  await ProviderServiceArea.create({
    workerId: worker._id,
    cityCode: 'hyderabad',
    center: { type: 'Point', coordinates: [LNG, LAT + dLat] },
    radiusKm: 15,
    serviceModes: ['doorstep', 'workshop'],
  });

  await ProviderCapability.create({
    workerId: worker._id,
    vertical: 'mobile',
    repairCode: 'display_assembly_replacement',
    qualityCodes: [qualityCode],
    serviceModes: ['doorstep', 'workshop'],
    skillLevel: skill,
    verificationStatus: 'approved',
  });

  await ProviderPricing.create({
    workerId: worker._id,
    vertical: 'mobile',
    repairCode: 'display_assembly_replacement',
    modelCode: 'samsung-s23-ultra',
    qualityCode,
    totalPaise: priceP,
    warrantyDays,
    approvalStatus: 'approved',
  });

  // null is deliberately NOT zero: it means this provider keeps no stock list
  // at all, which is now the normal case since they quote a part-inclusive
  // price instead of tracking inventory.
  if (stock !== null) {
    await ProviderInventory.create({
      workerId: worker._id,
      partId: ids.partId,
      partSku: 'SCR-S23U-PREM',
      quantity: stock,
      costPaise: 1500000,
    });
  }

  return worker;
}

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });
  await PartQuality.create({ code: 'premium', name: 'Premium Compatible', rank: 20, isGenuine: false });
  await Repair.create({
    code: 'display_assembly_replacement',
    name: 'Display Assembly Replacement',
    vertical: 'mobile',
    pricingMode: 'range',
    minSkillLevel: 3,
    allowedServiceModes: ['doorstep', 'workshop', 'pickup_repair'],
    partRequirements: [{ componentCode: 'display_assembly', required: true, quantity: 1 }],
    warrantyDays: 180,
    estimatedDurationMin: 60,
  });
  const part = await Part.create({
    sku: 'SCR-S23U-PREM',
    name: 'S23 Ultra Display (Premium)',
    componentCode: 'display_assembly',
    brandCode: 'samsung',
    compatibleModelCodes: ['samsung-s23-ultra'],
    qualityCode: 'premium',
  });
  ids.partId = part._id;
});

afterAll(async () => { await stopMongo(); });

const baseQuery = {
  vertical: 'mobile',
  repairCode: 'display_assembly_replacement',
  brandCode: 'samsung',
  modelCode: 'samsung-s23-ultra',
  qualityCode: 'premium',
  serviceMode: 'doorstep',
  lat: LAT,
  lng: LNG,
  cityCode: 'hyderabad',
};

describe('eligibility gates', () => {
  afterEach(async () => {
    await Promise.all([
      Worker.deleteMany({}), ProviderServiceArea.deleteMany({}),
      ProviderCapability.deleteMany({}), ProviderPricing.deleteMany({}),
      ProviderInventory.deleteMany({}),
    ]);
    pricingService.invalidateConfigCache();
  });

  it('excludes a provider with no stock, however cheap', async () => {
    await makeProvider({ name: 'Cheap But Empty', priceP: 1000000, stock: 0 });
    await makeProvider({ name: 'Stocked', priceP: 2000000, stock: 3 });

    const res = await matching.findProviders(baseQuery);
    expect(res.providers.map((p) => p.name)).toEqual(['Stocked']);
    expect(res.rejected.some((r) => r.reason === 'out_of_stock')).toBe(true);
  });

  /**
   * Providers are no longer asked to keep a stock list — they quote one final
   * price with the part included. If silence were read as "out of stock", every
   * screen and battery job would match nobody, which is most of the business.
   */
  it('keeps a provider who tracks no stock at all — silence is not out-of-stock', async () => {
    await makeProvider({ name: 'Sources Their Own', priceP: 1000000, stock: null });

    const res = await matching.findProviders(baseQuery);
    expect(res.providers.map((p) => p.name)).toEqual(['Sources Their Own']);
    expect(res.rejected.some((r) => r.reason === 'out_of_stock')).toBe(false);
  });

  it('ranks a provider holding the part above one who does not track stock', async () => {
    await makeProvider({ name: 'Has It On The Shelf', priceP: 1000000, stock: 4 });
    await makeProvider({ name: 'Will Source It', priceP: 1000000, stock: null });

    const res = await matching.findProviders(baseQuery);
    expect(res.providers[0].name).toBe('Has It On The Shelf');
    expect(res.providers).toHaveLength(2);
  });

  /**
   * A provider who prices per part grade has NO grade-agnostic row. Asking for a
   * price with no grade would match none of their rows, and they would be thrown
   * out as unpriced — the exact shape of provider the pricing screen now
   * encourages. The customer has not chosen a grade yet at this point, so this
   * is the common path, not an edge case.
   */
  it('finds a provider who only priced per part grade, and offers every grade', async () => {
    const worker = await makeProvider({ name: 'Grades Only', priceP: 1500000, qualityCode: 'premium' });
    await ProviderPricing.create({
      workerId: worker._id,
      vertical: 'mobile',
      repairCode: 'display_assembly_replacement',
      modelCode: 'samsung-s23-ultra',
      qualityCode: 'standard',
      totalPaise: 900000,
      warrantyDays: 30,
      approvalStatus: 'approved',
    });
    await ProviderCapability.updateOne(
      { workerId: worker._id },
      { $set: { qualityCodes: ['premium', 'standard'] } },
    );

    const res = await matching.findProviders({ ...baseQuery, qualityCode: null });

    expect(res.providers).toHaveLength(1);
    const [p] = res.providers;
    expect(p.priceOptions.map((o) => o.qualityCode)).toEqual(['standard', 'premium']);
    // Cheapest first, and that is the figure the card leads with.
    expect(p.priceOptions[0].totalPaise).toBe(900000);
    expect(p.totalPaise).toBe(900000);
    // Each grade carries its own warranty, because they are not the same job.
    expect(p.priceOptions[0].warrantyDays).toBe(30);
    expect(p.priceOptions[1].warrantyDays).toBe(180);
  });

  it('still prices a single grade exactly when the customer has chosen one', async () => {
    await makeProvider({ name: 'Premium Only', priceP: 1500000, qualityCode: 'premium' });

    const res = await matching.findProviders({ ...baseQuery, qualityCode: 'premium' });
    expect(res.providers).toHaveLength(1);
    expect(res.providers[0].totalPaise).toBe(1500000);
  });

  it('excludes a provider whose skill level is below the repair', async () => {
    await makeProvider({ name: 'Underskilled', priceP: 1000000, skill: 2 });
    const res = await matching.findProviders(baseQuery);
    expect(res.providers).toHaveLength(0);
    expect(res.rejected[0].reason).toBe('insufficient_skill');
  });

  it('excludes a provider with no approved price', async () => {
    const w = await makeProvider({ name: 'Unpriced', priceP: 1500000 });
    await ProviderPricing.updateMany({ workerId: w._id }, { $set: { approvalStatus: 'pending' } });
    const res = await matching.findProviders(baseQuery);
    expect(res.providers).toHaveLength(0);
    expect(res.rejected[0].reason).toBe('no_approved_price');
  });

  it('excludes a provider whose KYC is not approved', async () => {
    const w = await makeProvider({ name: 'Unverified', priceP: 1500000 });
    await Worker.updateOne({ _id: w._id }, { $set: { 'kyc.status': 'pending_review' } });
    const res = await matching.findProviders(baseQuery);
    expect(res.rejected[0].reason).toBe('kyc_not_approved');
  });

  it('excludes a provider outside their own service radius', async () => {
    await makeProvider({ name: 'Too Far', priceP: 1500000, distanceKm: 400 });
    const res = await matching.findProviders(baseQuery);
    expect(res.providers).toHaveLength(0);
    expect(res.reason).toBe('no_provider_in_area');
  });

  it('refuses a service mode the repair does not allow', async () => {
    await makeProvider({ name: 'Anyone', priceP: 1500000 });
    const res = await matching.findProviders({ ...baseQuery, serviceMode: 'diagnosis_only' });
    expect(res.reason).toBe('service_mode_not_allowed');
  });

  it('reports why nothing matched rather than returning a silent empty list', async () => {
    const res = await matching.findProviders(baseQuery);
    expect(res.providers).toHaveLength(0);
    expect(res.reason).toBeTruthy();
  });
});

describe('ranking', () => {
  afterEach(async () => {
    await Promise.all([
      Worker.deleteMany({}), ProviderServiceArea.deleteMany({}),
      ProviderCapability.deleteMany({}), ProviderPricing.deleteMany({}),
      ProviderInventory.deleteMany({}),
    ]);
    pricingService.invalidateConfigCache();
  });

  it('does not simply pick the cheapest (§20)', async () => {
    // Cheapest, but far, poorly rated and a short warranty.
    await makeProvider({ name: 'Cheapest', priceP: 1200000, distanceKm: 12, rating: 3.2, warrantyDays: 30, completedJobs: 2 });
    // Slightly pricier, but close, well rated and a long warranty.
    await makeProvider({ name: 'Balanced', priceP: 1500000, distanceKm: 1, rating: 4.9, warrantyDays: 365, completedJobs: 90 });

    const res = await matching.findProviders(baseQuery);
    expect(res.recommended.name).toBe('Balanced');
    expect(res.recommended.zappyRecommended).toBe(true);
  });

  it('follows configured weights — price-only weighting picks the cheapest', async () => {
    await RepairConfig.updateOne(
      { vertical: 'mobile' },
      {
        $set: {
          rankingWeights: {
            price: 10, partQuality: 0, warranty: 0, eta: 0, distance: 0, rating: 0,
            completionRate: 0, cancellationRate: 0, responseTime: 0, skillLevel: 0, inventory: 0,
          },
        },
      },
    );
    pricingService.invalidateConfigCache();

    await makeProvider({ name: 'Cheapest', priceP: 1200000, distanceKm: 12, rating: 3.2, warrantyDays: 30 });
    await makeProvider({ name: 'Balanced', priceP: 1500000, distanceKm: 1, rating: 4.9, warrantyDays: 365 });

    const res = await matching.findProviders(baseQuery);
    expect(res.recommended.name).toBe('Cheapest');

    await RepairConfig.updateOne({ vertical: 'mobile' }, { $set: { rankingWeights: {} } });
    pricingService.invalidateConfigCache();
  });

  it('returns real per-provider differences for the customer to compare', async () => {
    await makeProvider({ name: 'A', priceP: 1950000, distanceKm: 2, warrantyDays: 180 });
    await makeProvider({ name: 'B', priceP: 2050000, distanceKm: 3, warrantyDays: 365 });
    await makeProvider({ name: 'C', priceP: 1850000, distanceKm: 5, warrantyDays: 90 });

    const res = await matching.findProviders(baseQuery);
    expect(res.providers).toHaveLength(3);
    const totals = res.providers.map((p) => p.totalPaise);
    expect(new Set(totals).size).toBe(3);
    expect(res.providers.every((p) => p.warrantyDays > 0)).toBe(true);
  });

  it('never leaks internal scoring weights to the customer payload', async () => {
    await makeProvider({ name: 'A', priceP: 1950000 });
    const res = await matching.findProviders(baseQuery);
    const pub = matching.toPublic(res.recommended);
    expect(pub._scoreParts).toBeUndefined();
    expect(pub.score).toBeUndefined();
    expect(pub.name).toBe('A');
  });
});

/**
 * A released job must find its way to somebody else.
 *
 * Both ways a job comes loose — the provider passes on it, or never answers and
 * the watchdog reclaims it — used to leave the booking at CONFIRMED with nobody
 * assigned and nothing looking for a replacement. "We'll find someone else" was
 * not true: no code ever looked.
 */
describe('re-dispatch after release', () => {
  const bookingService = require('../src/modules/repair/services/booking.service');
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const mongooseLib = require('mongoose');

  afterEach(async () => {
    await Promise.all([
      Worker.deleteMany({}), ProviderServiceArea.deleteMany({}),
      ProviderCapability.deleteMany({}), ProviderPricing.deleteMany({}),
      ProviderInventory.deleteMany({}), RepairBooking.deleteMany({}),
    ]);
    pricingService.invalidateConfigCache();
  });

  async function unassignedBooking(declinedIds = []) {
    return RepairBooking.create({
      reference: `ZR${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      vertical: 'mobile',
      userId: new mongooseLib.Types.ObjectId(),
      status: 'CONFIRMED',
      brandCode: 'samsung',
      modelCode: 'samsung-s23-ultra',
      repairCode: 'display_assembly_replacement',
      qualityCode: 'premium',
      serviceMode: 'doorstep',
      problemCodes: ['screen_cracked'],
      location: { address: 'Somewhere', coordinates: [LNG, LAT], cityCode: 'hyderabad' },
      priceSnapshot: { subtotalPaise: 1000000, totalPaise: 1000000 },
      declines: declinedIds.map((id) => ({ providerKind: 'worker', providerId: id, reason: 'no_response', at: new Date() })),
    });
  }

  it('hands a released job to the next available provider', async () => {
    await makeProvider({ name: 'Second Choice', priceP: 1200000 });
    const booking = await unassignedBooking();

    const res = await bookingService.redispatch(booking._id);

    expect(res.assigned).toBe(true);
    const after = await RepairBooking.findById(booking._id).lean();
    expect(after.status).toBe('PROVIDER_ASSIGNED');
    expect(after.workerId).toBeTruthy();
    // A fresh clock, so the new provider gets their own full window.
    expect(after.stageDeadlineAt).toBeTruthy();
  });

  it('never re-offers to a provider who already passed', async () => {
    const passed = await makeProvider({ name: 'Already Passed', priceP: 1000000 });
    const booking = await unassignedBooking([passed._id]);

    const res = await bookingService.redispatch(booking._id);

    expect(res.assigned).toBe(false);
    expect(res.reason).toBe('no_one_left');
    const after = await RepairBooking.findById(booking._id).lean();
    expect(after.status).toBe('CONFIRMED');
  });

  it('skips the one who passed and takes the next', async () => {
    const passed = await makeProvider({ name: 'Passed', priceP: 1000000 });
    await makeProvider({ name: 'Available', priceP: 1100000 });
    const booking = await unassignedBooking([passed._id]);

    const res = await bookingService.redispatch(booking._id);

    expect(res.assigned).toBe(true);
    const after = await RepairBooking.findById(booking._id).lean();
    expect(String(after.workerId)).not.toBe(String(passed._id));
  });

  it('leaves a job that already has a provider alone', async () => {
    await makeProvider({ name: 'Someone', priceP: 1000000 });
    const booking = await unassignedBooking();
    await RepairBooking.updateOne({ _id: booking._id }, { $set: { status: 'WORKER_ACCEPTED' } });

    const res = await bookingService.redispatch(booking._id);
    expect(res.assigned).toBe(false);
    expect(res.reason).toBe('not_awaiting_provider');
  });
});
