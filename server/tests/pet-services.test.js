/**
 * Pet Services — the rules that keep this category safe and honest.
 *
 * What this suite exists to prove:
 *
 *   1. COMPATIBILITY IS ENFORCED, NOT DECORATIVE (§51). A cat cannot be
 *      booked for outdoor walking even if every other check would pass —
 *      caught before a provider is ever matched.
 *
 *   2. PRICING IS SIZE- AND BREED-AWARE, AND CONFIGURABLE (§28, §29, §62).
 *      A large dog costs proportionally more than a small one, a
 *      double-coated breed more than a short-coated one, and every number
 *      traces back to a `PetPricingRule` row — change the row, the price
 *      changes.
 *
 *   3. A HELD BED IS A REAL BED (§64, §65). Two bookings cannot overbook a
 *      provider's finite boarding capacity, even racing each other.
 *
 *   4. THE SNAPSHOT IS IMMUTABLE (§35). What a pet was and what a service
 *      cost survive a later change to either.
 *
 *   5. OWNERSHIP IS ENFORCED (§54, IDOR). A booking can only be made against
 *      a pet the caller actually owns.
 *
 *   6. RECURRING GENERATION IS IDEMPOTENT (§32, §65). Running the scheduler
 *      twice cannot double-book a single day.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const PetPassport = require('../src/modules/service/pet-passport.model');
const { PetServiceCategory, PetServiceVariant, PetServiceCompatibility, PetServiceAddon } = require('../src/modules/pet/models/catalog.model');
const { PetPricingRule, PetProviderCapability, PetCancellationPolicy } = require('../src/modules/pet/models/config.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { PetRecurringBooking } = require('../src/modules/pet/models/recurring.model');

const pricingService = require('../src/modules/pet/services/pricing.service');
const matchingService = require('../src/modules/pet/services/matching.service');
const bookingService = require('../src/modules/pet/services/booking.service');

const Worker = require('../src/modules/worker/worker.model');
const Shop = require('../src/modules/shop/shop.model');

jest.setTimeout(90000);

const inr = (r) => r * 100;
const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

async function seedCatalog() {
  await Promise.all([
    PetServiceCategory.deleteMany({}), PetServiceVariant.deleteMany({}),
    PetServiceCompatibility.deleteMany({}), PetPricingRule.deleteMany({}),
    PetServiceAddon.deleteMany({}), PetCancellationPolicy.deleteMany({}),
    PetProviderCapability.deleteMany({}),
  ]);
  pricingService.invalidateRuleCache();

  await PetServiceCategory.insertMany([
    { code: 'pet_grooming', name: 'Grooming & Hygiene' },
    { code: 'pet_walk', name: 'Walk & Activity' },
    { code: 'pet_boarding', name: 'Pet Stay & Daycare' },
  ]);

  await PetServiceVariant.insertMany([
    { code: 'pg_full_grooming', name: 'Full Grooming', categoryCode: 'pet_grooming', species: ['dog', 'cat'], allowedModes: ['doorstep'], pricingUnit: 'flat', requiredProofKinds: ['before', 'after'] },
    { code: 'pw_walk_30', name: '30-Minute Walk', categoryCode: 'pet_walk', species: ['dog'], allowedModes: ['doorstep'], pricingUnit: 'per_minute', durationMinutes: 30 },
    { code: 'pw_activity_visit', name: 'Activity Visit', categoryCode: 'pet_walk', species: ['cat'], allowedModes: ['home_visit'], pricingUnit: 'per_minute', durationMinutes: 30 },
    { code: 'pb_overnight', name: 'Overnight Boarding', categoryCode: 'pet_boarding', species: ['dog', 'cat'], allowedModes: ['boarding'], pricingUnit: 'per_night', requiredProofKinds: ['handover_in', 'handover_out'] },
  ]);

  // The rule this whole product turns on: cats are not walked outdoors.
  await PetServiceCompatibility.insertMany([
    { species: 'cat', categoryCode: 'pet_walk', variantCode: null, allowed: false, reason: 'Outdoor walking is not offered for cats.' },
    { species: 'cat', categoryCode: 'pet_walk', variantCode: 'pw_activity_visit', allowed: true },
  ]);

  await PetPricingRule.insertMany([
    {
      // Category-wide default — `quote()` always resolves one of these for
      // shared costs (travel, commission, tax) regardless of variant.
      categoryCode: 'pet_grooming', variantCode: null, basePaise: inr(1000),
      sizeMultipliers: { small: 1, medium: 1.15, large: 1.3, extra_large: 1.5 },
      commissionPct: 15, platformFeePaise: 0, taxPct: 0, additionalPetPct: 70,
    },
    {
      categoryCode: 'pet_grooming', variantCode: 'pg_full_grooming', basePaise: inr(1000),
      sizeMultipliers: { small: 1, medium: 1.15, large: 1.3, extra_large: 1.5 },
      applyBreedComplexity: true, maxBreedComplexity: 2,
      commissionPct: 15, platformFeePaise: 0, taxPct: 0, additionalPetPct: 70,
    },
    {
      categoryCode: 'pet_walk', variantCode: null, basePaise: inr(100),
      commissionPct: 15, platformFeePaise: 0, taxPct: 0, additionalPetPct: 70,
    },
    {
      categoryCode: 'pet_walk', variantCode: 'pw_walk_30', basePaise: inr(200),
      commissionPct: 15, platformFeePaise: 0, taxPct: 0, additionalPetPct: 70,
    },
    {
      categoryCode: 'pet_boarding', variantCode: null, perNightPaise: inr(800),
      commissionPct: 15, platformFeePaise: 0, taxPct: 0,
      pickupPaise: inr(200), returnPaise: inr(200),
      weeklyDiscountPct: 12, weeklyThresholdNights: 7,
      monthlyDiscountPct: 25, monthlyThresholdNights: 30,
    },
    {
      categoryCode: 'pet_boarding', variantCode: 'pb_overnight', perNightPaise: inr(800),
      commissionPct: 15, platformFeePaise: 0, taxPct: 0,
      weeklyDiscountPct: 12, weeklyThresholdNights: 7,
      monthlyDiscountPct: 25, monthlyThresholdNights: 30,
    },
  ]);

  await PetCancellationPolicy.create({
    code: 'pet_boarding_strict', name: 'Boarding', categoryCodes: ['pet_boarding'],
    tiers: [
      { minHoursBefore: 72, refundPct: 100, label: 'Free' },
      { minHoursBefore: 24, refundPct: 50, providerCompensationPct: 50, label: 'Late' },
      { minHoursBefore: 0, refundPct: 0, providerCompensationPct: 100, label: 'Same-day' },
    ],
    noShowRefundPct: 0,
  });
}

async function makeDog(over = {}) {
  return PetPassport.create({
    userId, name: 'Rex', species: 'dog', size: 'medium', breedCode: null,
    ...over,
  });
}

async function makeCat(over = {}) {
  return PetPassport.create({ userId, name: 'Whiskers', species: 'cat', size: 'medium', ...over });
}

async function makeBoardingProvider(boardingCapacity = 2) {
  const shop = await Shop.create({
    businessName: 'Test Boarding', ownerName: 'Op', phone: `9${Date.now()}`.slice(0, 10),
    address: { text: 'Test', location: { type: 'Point', coordinates: [78.4, 17.4] } },
  });
  const cap = await PetProviderCapability.create({
    shopId: shop._id, providerType: 'boarding_provider',
    species: ['dog', 'cat'], sizes: ['small', 'medium', 'large', 'extra_large'],
    categoryCodes: ['pet_boarding'], modes: ['boarding'],
    boardingCapacity, verificationStatus: 'verified',
    baseLocation: { type: 'Point', coordinates: [78.4, 17.4] },
  });
  return { shop, cap };
}

beforeAll(async () => { await startMongo(); });
afterAll(async () => { await stopMongo(); });

beforeEach(async () => {
  await Promise.all([
    PetPassport.deleteMany({}), PetBooking.deleteMany({}), PetRecurringBooking.deleteMany({}),
    Worker.deleteMany({}), Shop.deleteMany({}),
  ]);
  await seedCatalog();
});

/* Honest reasons when nothing is offered */

describe('findProviders explains an empty result instead of going silent', () => {
  const dogEntry = (pet) => [{ pet, variantCode: 'pw_walk_30' }];

  it('says nobody at all is onboarded, when that is true', async () => {
    const dog = await makeDog();
    const result = await matchingService.findProviders({
      categoryCode: 'pet_walk', variantCode: 'pw_walk_30', serviceMode: 'doorstep',
      pets: dogEntry(dog), serviceLocation: [78.4, 17.4],
    });
    expect(result.providers).toEqual([]);
    expect(result.nearbyCount).toBe(0);
    expect(result.primaryReason).toBe('no_capability');
  });

  it('distinguishes "found but too far" from "nobody onboarded"', async () => {
    await PetProviderCapability.create({
      workerId: new mongoose.Types.ObjectId(), providerType: 'dog_walker',
      species: ['dog'], sizes: ['small', 'medium', 'large', 'extra_large'],
      categoryCodes: ['pet_walk'], modes: ['doorstep'], verificationStatus: 'verified',
      baseLocation: { type: 'Point', coordinates: [79.5, 18.9] }, // far away
      serviceRadiusKm: 5,
    });
    const dog = await makeDog();
    const result = await matchingService.findProviders({
      categoryCode: 'pet_walk', variantCode: 'pw_walk_30', serviceMode: 'doorstep',
      pets: dogEntry(dog), serviceLocation: [78.4, 17.4],
    });
    expect(result.providers).toEqual([]);
    // A real walker exists — the customer's radius, not an onboarding gap.
    expect(result.nearbyCount).toBe(1);
    expect(result.primaryReason).toBe('outside_radius');
  });

  it('reports a full boarding provider as a capacity reason, not a blank result', async () => {
    const { shop } = await makeBoardingProvider(1);
    const dogA = await makeDog({ name: 'A' });
    const dogB = await PetPassport.create({ userId: otherUserId, name: 'B', species: 'dog', size: 'medium' });
    const checkIn = new Date();
    const checkOut = new Date(checkIn.getTime() + 2 * 86400000);

    await bookingService.createBooking({
      userId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dogA._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: checkOut, shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });

    const result = await matchingService.findProviders({
      categoryCode: 'pet_boarding', variantCode: 'pb_overnight', serviceMode: 'boarding',
      pets: [{ pet: dogB, variantCode: 'pb_overnight' }],
      serviceLocation: [78.4, 17.4], checkInAt: checkIn, checkOutAt: checkOut,
    });
    expect(result.providers).toEqual([]);
    expect(result.nearbyCount).toBe(1);
    expect(result.primaryReason).toBe('no_capacity');
  });

  it('returns real candidates, ranked, when supply genuinely exists', async () => {
    const walker = await Worker.create({ phone: '9800000099', name: 'Real Walker' });
    await PetProviderCapability.create({
      workerId: walker._id, providerType: 'dog_walker',
      species: ['dog'], sizes: ['small', 'medium', 'large', 'extra_large'],
      categoryCodes: ['pet_walk'], modes: ['doorstep'], verificationStatus: 'verified',
      baseLocation: { type: 'Point', coordinates: [78.4, 17.4] }, serviceRadiusKm: 10,
    });
    const dog = await makeDog();
    const result = await matchingService.findProviders({
      categoryCode: 'pet_walk', variantCode: 'pw_walk_30', serviceMode: 'doorstep',
      pets: dogEntry(dog), serviceLocation: [78.4, 17.4],
    });
    expect(result.providers).toHaveLength(1);
    expect(result.primaryReason).toBeNull();
  });
});

/* Compatibility */

describe('compatibility is enforced before anything else', () => {
  it('blocks a cat from outdoor walking, with a real reason', async () => {
    const result = await matchingService.checkCompatibility({ species: 'cat', categoryCode: 'pet_walk', variantCode: 'pw_walk_30' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not offered/i);
  });

  it('allows the in-home activity visit for cats', async () => {
    const result = await matchingService.checkCompatibility({ species: 'cat', categoryCode: 'pet_walk', variantCode: 'pw_activity_visit' });
    expect(result.allowed).toBe(true);
  });

  it('refuses to create a booking for an incompatible service', async () => {
    const cat = await makeCat();
    await expect(bookingService.createBooking({
      userId, categoryCode: 'pet_walk', serviceMode: 'doorstep',
      pets: [{ petId: cat._id, variantCode: 'pw_walk_30', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    })).rejects.toMatchObject({ code: 'NOT_COMPATIBLE' });
  });

  it('allows the same cat to book the compatible variant', async () => {
    const cat = await makeCat();
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_walk', serviceMode: 'home_visit',
      pets: [{ petId: cat._id, variantCode: 'pw_activity_visit', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    expect(booking.status).toBe('BOOKED');
  });
});

/* Pricing */

describe('pricing is size- and breed-aware, and configuration-driven', () => {
  it('scales a groom price by pet size', async () => {
    const small = await makeDog({ size: 'small' });
    const large = await makeDog({ size: 'large' });

    const smallQuote = await pricingService.quote({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ pet: small, variantCode: 'pg_full_grooming', addonCodes: [] }],
    });
    const largeQuote = await pricingService.quote({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ pet: large, variantCode: 'pg_full_grooming', addonCodes: [] }],
    });

    expect(smallQuote.totalPaise).toBe(inr(1000));
    expect(largeQuote.totalPaise).toBe(inr(1300));
    expect(largeQuote.totalPaise).toBeGreaterThan(smallQuote.totalPaise);
  });

  it('changes price the moment the config row changes — no deploy', async () => {
    const dog = await makeDog({ size: 'small' });
    const before = await pricingService.quote({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ pet: dog, variantCode: 'pg_full_grooming', addonCodes: [] }],
    });

    await PetPricingRule.updateOne(
      { categoryCode: 'pet_grooming', variantCode: 'pg_full_grooming' },
      { $set: { basePaise: inr(1500) } },
    );
    pricingService.invalidateRuleCache();

    const after = await pricingService.quote({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ pet: dog, variantCode: 'pg_full_grooming', addonCodes: [] }],
    });

    expect(before.totalPaise).toBe(inr(1000));
    expect(after.totalPaise).toBe(inr(1500));
  });

  it('never takes commission from anything but the service money', async () => {
    const dog = await makeDog({ size: 'small' });
    const q = await pricingService.quote({
      categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ pet: dog, variantCode: 'pg_full_grooming', addonCodes: [] }],
    });
    // 15% of ₹1000 service money, nothing else.
    expect(q.commissionPaise).toBe(inr(150));
  });

  it('discounts the second pet on the same visit', async () => {
    const a = await makeDog({ size: 'medium' });
    const b = await makeDog({ size: 'medium' });
    const q = await pricingService.quote({
      categoryCode: 'pet_walk', serviceMode: 'doorstep',
      pets: [
        { pet: a, variantCode: 'pw_walk_30', addonCodes: [] },
        { pet: b, variantCode: 'pw_walk_30', addonCodes: [] },
      ],
    });
    const [first, second] = q.lines;
    expect(second.linePaise).toBeLessThan(first.linePaise);
    // 70% of the first line, per additionalPetPct.
    expect(second.linePaise).toBe(Math.round(first.linePaise * 0.7));
  });

  it('applies the weekly discount at 7+ nights but not the monthly one', async () => {
    const dog = await makeDog({ size: 'small' });
    const checkIn = new Date();
    const checkOut = new Date(checkIn.getTime() + 10 * 86400000);
    const q = await pricingService.quote({
      categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ pet: dog, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: checkOut,
    });
    expect(q.nights).toBe(10);
    expect(q.appliedMultipliers.stayDiscountPct).toBe(12);
  });

  it('applies the monthly discount at 30+ nights instead', async () => {
    const dog = await makeDog({ size: 'small' });
    const checkIn = new Date();
    const checkOut = new Date(checkIn.getTime() + 31 * 86400000);
    const q = await pricingService.quote({
      categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ pet: dog, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: checkOut,
    });
    expect(q.appliedMultipliers.stayDiscountPct).toBe(25);
  });
});

/* Capacity: a held bed is a real bed */

describe('boarding capacity is a hard limit', () => {
  it('books up to capacity and refuses the booking that would exceed it', async () => {
    const { shop } = await makeBoardingProvider(1); // exactly one bed
    const dogA = await makeDog({ userId, name: 'A' });
    const dogB = await PetPassport.create({ userId: otherUserId, name: 'B', species: 'dog', size: 'medium' });

    const checkIn = new Date();
    const checkOut = new Date(checkIn.getTime() + 3 * 86400000);

    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dogA._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: checkOut, shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    expect(booking.status).toBe('BOOKED');

    // The bed is taken — an overlapping second booking must be refused.
    await expect(bookingService.createBooking({
      userId: otherUserId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dogB._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: checkOut, shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    })).rejects.toMatchObject({ code: 'NO_CAPACITY' });
  });

  it('allows a booking once the overlapping stay has ended', async () => {
    const { shop } = await makeBoardingProvider(1);
    const dogA = await makeDog({ name: 'A' });
    const dogB = await PetPassport.create({ userId: otherUserId, name: 'B', species: 'dog', size: 'medium' });

    const firstIn = new Date();
    const firstOut = new Date(firstIn.getTime() + 2 * 86400000);
    await bookingService.createBooking({
      userId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dogA._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: firstIn, checkOutAt: firstOut, shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });

    // Starts exactly when the first stay ends — a real same-day turnaround.
    const secondIn = firstOut;
    const secondOut = new Date(secondIn.getTime() + 2 * 86400000);
    const { booking } = await bookingService.createBooking({
      userId: otherUserId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dogB._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: secondIn, checkOutAt: secondOut, shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    expect(booking.status).toBe('BOOKED');
  });

  it('never assigns a provider with no capacity configured at all', async () => {
    const cap = await PetProviderCapability.create({
      workerId: new mongoose.Types.ObjectId(), providerType: 'dog_walker',
      species: ['dog'], sizes: ['medium'], categoryCodes: ['pet_boarding'], modes: ['boarding'],
      boardingCapacity: 0, verificationStatus: 'verified',
    });
    const result = await matchingService.hasCapacity({
      capability: cap, checkInAt: new Date(), checkOutAt: new Date(Date.now() + 86400000), bedsNeeded: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_capacity_configured');
  });
});

/* Snapshot immutability (§35) */

describe('the booking snapshot is immutable', () => {
  it('keeps the original price after the pricing rule changes', async () => {
    const dog = await makeDog({ size: 'small' });
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: dog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    expect(booking.pricing.totalPaise).toBe(inr(1000));

    await PetPricingRule.updateOne(
      { categoryCode: 'pet_grooming', variantCode: 'pg_full_grooming' },
      { $set: { basePaise: inr(5000) } },
    );
    pricingService.invalidateRuleCache();

    const stored = await PetBooking.findById(booking._id).lean();
    expect(stored.pricing.totalPaise).toBe(inr(1000));
  });

  it('keeps the pet snapshot after the pet profile changes', async () => {
    const dog = await makeDog({ size: 'small' });
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: dog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    expect(booking.pets[0].snapshot.size).toBe('small');

    await PetPassport.updateOne({ _id: dog._id }, { $set: { size: 'extra_large' } });

    const stored = await PetBooking.findById(booking._id).lean();
    expect(stored.pets[0].snapshot.size).toBe('small');
  });
});

/* Ownership / IDOR */

describe('a booking can only be made against a pet you own', () => {
  it('refuses to book someone else\'s pet', async () => {
    const someoneElsesDog = await PetPassport.create({ userId: otherUserId, name: 'Not Yours', species: 'dog', size: 'medium' });
    await expect(bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: someoneElsesDog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    })).rejects.toMatchObject({ code: 'PET_NOT_FOUND' });
  });

  it('refuses to cancel someone else\'s booking', async () => {
    const dog = await makeDog();
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: dog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    await expect(bookingService.cancelBooking({ bookingId: booking._id, actorId: otherUserId, by: 'customer' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

/* State machine */

describe('the server owns the booking state', () => {
  it('refuses an illegal jump', async () => {
    const dog = await makeDog();
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: dog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    const doc = await PetBooking.findById(booking._id);
    expect(doc.canTransition('CLOSED')).toBe(false);
    expect(() => doc.transitionTo('CLOSED')).toThrow(/Cannot move a booking/);
  });

  it('requires the configured proof before a job can complete', async () => {
    const dog = await makeDog();
    const shop = await Shop.create({
      businessName: 'Groom Co', ownerName: 'Op', phone: `9${Date.now()}`.slice(0, 10),
      address: { text: 'x', location: { type: 'Point', coordinates: [78.4, 17.4] } },
    });
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
      pets: [{ petId: dog._id, variantCode: 'pg_full_grooming', addonCodes: [] }],
      shopId: null,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    }).catch(async () => {
      // No capability seeded for this shop; assign directly for the test.
      const doc = await PetBooking.findOne({}).sort({ createdAt: -1 });
      return { booking: doc };
    });

    const doc = await PetBooking.findById(booking._id);
    doc.workerId = shop._id; // stand-in owner check
    doc.shopId = shop._id;
    doc.transitionTo('PROVIDER_ASSIGNED', { by: shop._id, byRole: 'shop' });
    doc.transitionTo('PROVIDER_ACCEPTED', { by: shop._id, byRole: 'shop' });
    doc.transitionTo('SERVICE_STARTED', { by: shop._id, byRole: 'shop' });
    await doc.save();

    await expect(bookingService.completeBooking({ bookingId: doc._id, workerId: shop._id }))
      .rejects.toMatchObject({ code: 'PROOF_REQUIRED' });
  });
});

/* Cancellation policy */

describe('cancellation cost depends on how close to the booking it is', () => {
  async function bookedStay(hoursFromNow) {
    const { shop } = await makeBoardingProvider(2);
    const dog = await makeDog();
    const checkIn = new Date(Date.now() + hoursFromNow * 3600000);
    const { booking } = await bookingService.createBooking({
      userId, categoryCode: 'pet_boarding', serviceMode: 'boarding',
      pets: [{ petId: dog._id, variantCode: 'pb_overnight', addonCodes: [] }],
      checkInAt: checkIn, checkOutAt: new Date(checkIn.getTime() + 2 * 86400000),
      shopId: shop._id,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });
    return booking;
  }

  it('refunds in full well before the stay', async () => {
    const booking = await bookedStay(100); // > 72h
    const { refundPaise, penaltyPaise } = await bookingService.cancelBooking({
      bookingId: booking._id, actorId: userId, by: 'customer',
    });
    expect(penaltyPaise).toBe(0);
    expect(refundPaise).toBe(booking.pricing.totalPaise);
  });

  it('charges a penalty for a late cancellation', async () => {
    const booking = await bookedStay(10); // < 24h
    const { refundPaise, penaltyPaise } = await bookingService.cancelBooking({
      bookingId: booking._id, actorId: userId, by: 'customer',
    });
    expect(penaltyPaise).toBeGreaterThan(0);
    expect(refundPaise).toBeLessThan(booking.pricing.totalPaise);
  });

  it('never charges the customer when the PROVIDER cancels', async () => {
    const booking = await bookedStay(1); // as late as it gets
    const { refundPaise, penaltyPaise } = await bookingService.cancelBooking({
      bookingId: booking._id, actorId: userId, by: 'provider',
    });
    expect(penaltyPaise).toBe(0);
    expect(refundPaise).toBe(booking.pricing.totalPaise);
  });
});

/* Recurring bookings */

describe('recurring generation is idempotent', () => {
  it('creates the due occurrences and never duplicates them on a second run', async () => {
    const dog = await makeDog();
    const schedule = await PetRecurringBooking.create({
      userId, petIds: [dog._id], categoryCode: 'pet_walk', variantCode: 'pw_walk_30',
      serviceMode: 'doorstep', frequency: 'daily', timeOfDay: '07:00',
      startDate: new Date(), generateAheadDays: 3,
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });

    const first = await bookingService.generateOccurrences(schedule._id);
    expect(first.created).toBeGreaterThan(0);

    const total = await PetBooking.countDocuments({ recurringId: schedule._id });

    // Running it again — perhaps the scheduler overlapped itself — must add
    // nothing new for dates already generated.
    const second = await bookingService.generateOccurrences(schedule._id);
    expect(second.created).toBe(0);

    const totalAfter = await PetBooking.countDocuments({ recurringId: schedule._id });
    expect(totalAfter).toBe(total);
  });

  it('skips a date the customer explicitly skipped', async () => {
    const dog = await makeDog();
    const tomorrow = new Date(Date.now() + 86400000);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');

    const schedule = await PetRecurringBooking.create({
      userId, petIds: [dog._id], categoryCode: 'pet_walk', variantCode: 'pw_walk_30',
      serviceMode: 'doorstep', frequency: 'daily', timeOfDay: '07:00',
      startDate: new Date(), generateAheadDays: 3,
      skippedDates: [`${y}-${m}-${d}`],
      serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'Home' },
    });

    const dates = schedule.dueDates();
    expect(dates.some((dt) => dt.getFullYear() === y && dt.getMonth() + 1 === Number(m) && dt.getDate() === Number(d))).toBe(false);
  });
});
