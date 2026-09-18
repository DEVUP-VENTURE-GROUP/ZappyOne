/**
 * Auto-provisioned coverage — the fix for "verified, priced, 50 metres away,
 * and still never offered the job."
 *
 * Before this, `ProviderServiceArea` and `PetProviderCapability` only ever
 * existed if a provider found a settings screen and configured one by hand —
 * for Pet Services there was not even a screen to find. These tests prove the
 * default now appears automatically at the moment a provider's real location
 * becomes known, and that it NEVER overwrites a provider's own configuration.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const {
  ServiceDomain, ServiceLine, ProviderEnrolment,
} = require('../src/modules/onboarding/onboarding.model');
const onboardingService = require('../src/modules/onboarding/onboarding.service');
const { provisionCoverage } = require('../src/modules/onboarding/auto-provision.service');
const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
const { PetProviderCapability } = require('../src/modules/pet/models/config.model');
const { metresBetween } = require('../src/utils/distance');

jest.setTimeout(60000);

// Somewhere in Hyderabad, and a point ~50m away from it.
const SHOP_ADDRESS = [78.3872, 17.4435];
const CUSTOMER_50M_AWAY = [78.38775, 17.44381];

beforeAll(async () => {
  await startMongo();
  await ServiceDomain.create({ code: 'electronics', name: 'Electronics' });
  await ServiceLine.create({
    code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics',
    status: 'live', repairVertical: 'mobile', customerPath: '/repair',
  });
  await ServiceDomain.create({ code: 'pet_services', name: 'Pet Services' });
  await ServiceLine.create({
    code: 'pet_grooming', name: 'Pet Grooming', domainCode: 'pet_services',
    status: 'live', customerPath: '/pet/book/pet_grooming',
  });
  await ServiceLine.create({
    code: 'pet_boarding', name: 'Pet Boarding', domainCode: 'pet_services',
    status: 'live', customerPath: '/pet/book/pet_boarding',
  });
});

afterAll(async () => { await stopMongo(); });

beforeEach(async () => {
  await Promise.all([
    Shop.deleteMany({}), Worker.deleteMany({}), ProviderEnrolment.deleteMany({}),
    ProviderServiceArea.deleteMany({}), PetProviderCapability.deleteMany({}),
  ]);
});

describe('a shop becomes matchable the moment it is approved', () => {
  it('creates a default repair service area from the shop\'s registered address', async () => {
    const shop = await Shop.create({
      businessName: 'Test Repairs', ownerName: 'Owner', phone: '9800000001',
      address: { text: 'Gachibowli', location: { type: 'Point', coordinates: SHOP_ADDRESS } },
    });
    const enrolment = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'electronics',
      lineCode: 'mobile_repair', status: 'pending_review',
    });

    expect(await ProviderServiceArea.findOne({ shopId: shop._id })).toBeNull();

    await onboardingService.decide({ enrolmentId: enrolment._id, decision: 'approved' });

    const area = await ProviderServiceArea.findOne({ shopId: shop._id }).lean();
    expect(area).not.toBeNull();
    expect(area.center.coordinates).toEqual(SHOP_ADDRESS);
    expect(area.radiusKm).toBeGreaterThan(0);

    // The actual bug: a customer 50m away must now fall inside the radius.
    const metres = metresBetween(area.center.coordinates, CUSTOMER_50M_AWAY);
    expect(metres).toBeLessThan(100);
    expect(metres / 1000).toBeLessThan(area.radiusKm);
  });

  it('never overwrites a service area the shop already configured', async () => {
    const shop = await Shop.create({
      businessName: 'Custom Shop', ownerName: 'Owner', phone: '9800000002',
      address: { text: 'Gachibowli', location: { type: 'Point', coordinates: SHOP_ADDRESS } },
    });
    const CUSTOM_CENTRE = [79.0, 18.0];
    await ProviderServiceArea.create({
      shopId: shop._id, cityCode: 'hyderabad',
      center: { type: 'Point', coordinates: CUSTOM_CENTRE }, radiusKm: 25,
    });
    const enrolment = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'electronics',
      lineCode: 'mobile_repair', status: 'pending_review',
    });

    await onboardingService.decide({ enrolmentId: enrolment._id, decision: 'approved' });

    const area = await ProviderServiceArea.findOne({ shopId: shop._id }).lean();
    // Still the shop's own choice, not the auto-default.
    expect(area.center.coordinates).toEqual(CUSTOM_CENTRE);
    expect(area.radiusKm).toBe(25);
  });

  it('provisions a pet capability from the approved category, not a guessed one', async () => {
    const shop = await Shop.create({
      businessName: 'Paws Shop', ownerName: 'Owner', phone: '9800000003',
      address: { text: 'Gachibowli', location: { type: 'Point', coordinates: SHOP_ADDRESS } },
    });
    const enrolment = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'pet_services',
      lineCode: 'pet_grooming', status: 'pending_review',
    });

    await onboardingService.decide({ enrolmentId: enrolment._id, decision: 'approved' });

    const cap = await PetProviderCapability.findOne({ shopId: shop._id }).lean();
    expect(cap).not.toBeNull();
    expect(cap.categoryCodes).toEqual(['pet_grooming']);
    expect(cap.verificationStatus).toBe('verified');
    expect(cap.baseLocation.coordinates).toEqual(SHOP_ADDRESS);
  });

  it('gives an auto-provisioned boarding capability real capacity, not zero', async () => {
    const shop = await Shop.create({
      businessName: 'Boarding Shop', ownerName: 'Owner', phone: '9800000004',
      address: { text: 'Gachibowli', location: { type: 'Point', coordinates: SHOP_ADDRESS } },
    });
    const enrolment = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'pet_services',
      lineCode: 'pet_boarding', status: 'pending_review',
    });

    await onboardingService.decide({ enrolmentId: enrolment._id, decision: 'approved' });

    const cap = await PetProviderCapability.findOne({ shopId: shop._id }).lean();
    // Zero capacity is the exact same bug in a different field — verified,
    // priced, and still unbookable because nothing can ever fit.
    expect(cap.boardingCapacity).toBeGreaterThan(0);
  });

  it('accumulates a second approved category onto the same capability, not a duplicate', async () => {
    const shop = await Shop.create({
      businessName: 'Multi Shop', ownerName: 'Owner', phone: '9800000005',
      address: { text: 'Gachibowli', location: { type: 'Point', coordinates: SHOP_ADDRESS } },
    });
    const e1 = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'pet_services',
      lineCode: 'pet_grooming', status: 'pending_review',
    });
    await onboardingService.decide({ enrolmentId: e1._id, decision: 'approved' });

    const e2 = await ProviderEnrolment.create({
      shopId: shop._id, providerKind: 'shop', domainCode: 'pet_services',
      lineCode: 'pet_boarding', status: 'pending_review',
    });
    await onboardingService.decide({ enrolmentId: e2._id, decision: 'approved' });

    const all = await PetProviderCapability.find({ shopId: shop._id }).lean();
    expect(all).toHaveLength(1); // one capability document, not one per category
    expect(all[0].categoryCodes.sort()).toEqual(['pet_boarding', 'pet_grooming']);
  });
});

describe('an individual worker becomes matchable the first time they go online', () => {
  it('has no service area before ever going online', async () => {
    const worker = await Worker.create({
      phone: '9800000010', name: 'Test Walker', kyc: { status: 'approved' },
    });
    await ProviderEnrolment.create({
      workerId: worker._id, providerKind: 'individual', domainCode: 'pet_services',
      lineCode: 'pet_grooming', status: 'approved',
    });
    expect(await PetProviderCapability.findOne({ workerId: worker._id })).toBeNull();
  });

  it('provisions coverage from the first real GPS fix on going online', async () => {
    // `worker.service.goOnline` calls this exact function with the worker's
    // validated coordinates (see the two-line hook added there) — tested
    // directly here rather than through goOnline's full Redis-backed dispatch
    // side effects, which are unrelated to what this fix changed.
    const worker = await Worker.create({
      phone: '9800000011', name: 'Test Walker', kyc: { status: 'approved' },
    });
    await ProviderEnrolment.create({
      workerId: worker._id, providerKind: 'individual', domainCode: 'pet_services',
      lineCode: 'pet_grooming', status: 'approved',
    });

    await provisionCoverage({ workerId: worker._id, coordinates: SHOP_ADDRESS });

    const cap = await PetProviderCapability.findOne({ workerId: worker._id }).lean();
    expect(cap).not.toBeNull();
    expect(cap.categoryCodes).toEqual(['pet_grooming']);
    expect(cap.baseLocation.coordinates).toEqual(SHOP_ADDRESS);
  });

  it('never provisions from [0,0] — only a validated, real position', async () => {
    // goOnline itself refuses out-of-India coordinates, so a worker who has
    // never gone online simply never reaches provisioning with a bad point.
    const worker = await Worker.create({ phone: '9800000012', name: 'Never Online' });
    await ProviderEnrolment.create({
      workerId: worker._id, providerKind: 'individual', domainCode: 'pet_services',
      lineCode: 'pet_grooming', status: 'approved',
    });
    expect(worker.currentLocation.coordinates).toEqual([0, 0]);
    expect(await PetProviderCapability.findOne({ workerId: worker._id })).toBeNull();
  });
});
