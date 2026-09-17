jest.setTimeout(60000);

/**
 * A GeoJSON point is complete or it is absent. Never half.
 *
 * This bug has shipped twice — provider service areas, then shop registration —
 * from the same three lines: a `type` field that defaults to 'Point' beside a
 * `coordinates` field that defaults to nothing. Saving without coordinates then
 * writes `{ type: 'Point' }`, and the 2dsphere index refuses the document:
 *
 *   Can't extract geo keys … Point must be an array or object,
 *   instead got type missing
 *
 * Every model below is indexed with 2dsphere and can legitimately be saved with
 * no location at all, so each one is checked directly rather than trusting the
 * shared helper in isolation.
 */

const { startMongo, stopMongo } = require('./helpers');

const Shop = require('../src/modules/shop/shop.model');
const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
const ServiceMemory = require('../src/modules/service/service-memory.model');

beforeAll(async () => {
  await startMongo();
  // Wait for the 2dsphere indexes to actually exist. The original bug was an
  // INDEX-time rejection, so a test that runs before the index is built would
  // pass for the wrong reason.
  await Promise.all([Shop.init(), ProviderServiceArea.init(), ServiceMemory.init()]);
});
afterAll(async () => { await stopMongo(); });

afterEach(async () => {
  await Promise.all([
    Shop.deleteMany({}),
    ProviderServiceArea.deleteMany({}),
    ServiceMemory.deleteMany({}),
  ]);
});

describe('a shop that has not pinned itself yet', () => {
  /**
   * Reproduces the exact registration that failed: name, owner and phone from
   * the OTP signup, and no address at all — which is every shop, at the moment
   * it is created.
   */
  it('registers without an address', async () => {
    const shop = await Shop.create({
      businessName: 'Metro Groups',
      ownerName: 'Md.Faizan',
      phone: '6302079376',
    });

    expect(shop._id).toBeTruthy();
    // Absent, not an empty fragment — that distinction is the whole bug.
    expect(shop.address?.location?.type).toBeUndefined();
  });

  it('is queryable by geo once it does pin itself', async () => {
    await Shop.create({
      businessName: 'Pinned Shop',
      ownerName: 'Owner',
      phone: '6302079377',
      address: { text: 'Ameerpet', location: { coordinates: [78.4483, 17.4375] } },
    });

    const found = await Shop.findOne({
      'address.location': {
        $near: { $geometry: { type: 'Point', coordinates: [78.4483, 17.4375] }, $maxDistance: 5000 },
      },
    });

    expect(found.businessName).toBe('Pinned Shop');
    // `type` is filled in for the caller, who passed bare coordinates.
    expect(found.address.location.type).toBe('Point');
  });

  it('drops a location whose coordinates are incomplete rather than storing it', async () => {
    const shop = await Shop.create({
      businessName: 'Half Pin',
      ownerName: 'Owner',
      phone: '6302079378',
      address: { text: 'Nowhere', location: { coordinates: [78.4483] } },
    });

    expect(shop.address.location?.coordinates).toBeUndefined();
  });
});

describe('other 2dsphere-indexed models with optional locations', () => {
  it('saves a service area with no pin and no workshop location', async () => {
    const area = await ProviderServiceArea.create({
      workerId: new (require('mongoose').Types.ObjectId)(),
      cityCode: 'hyderabad',
      radiusKm: 20,
      serviceModes: ['doorstep'],
    });

    expect(area._id).toBeTruthy();
    expect(area.center?.type).toBeUndefined();
    expect(area.workshopLocation?.type).toBeUndefined();
  });

  it('saves service memory with no location', async () => {
    const memory = await ServiceMemory.create({
      userId: new (require('mongoose').Types.ObjectId)(),
      service: 'ac_repair',
      label: 'Living Room AC',
    });

    expect(memory._id).toBeTruthy();
    expect(memory.location?.type).toBeUndefined();
  });
});

describe('updates', () => {
  /**
   * The mirror-image shape: coordinates with no `type`.
   *
   * It appears the moment you stop defaulting `type` to fix the first bug, and
   * the index rejects it just as hard — "unknown GeoJSON type". It arrives when
   * a screen sends a whole `address` object rather than the point's own path,
   * which is the natural thing for a profile form to do.
   */
  it('completes a point sent with coordinates but no type', async () => {
    const shop = await Shop.create({
      businessName: 'Untyped', ownerName: 'Owner', phone: '6302079380',
    });

    await Shop.findOneAndUpdate(
      { _id: shop._id },
      { $set: { address: { text: 'Ameerpet', location: { coordinates: [78.4483, 17.4375] } } } },
    );

    const after = await Shop.findById(shop._id).lean();
    expect(after.address.location.type).toBe('Point');
    expect(after.address.location.coordinates).toEqual([78.4483, 17.4375]);
  });

  it('drops a nested point that has no usable coordinates', async () => {
    const shop = await Shop.create({
      businessName: 'Nested Empty', ownerName: 'Owner', phone: '6302079381',
    });

    await Shop.findOneAndUpdate(
      { _id: shop._id },
      { $set: { address: { text: 'Somewhere', location: { coordinates: [] } } } },
    );

    const after = await Shop.findById(shop._id).lean();
    expect(after.address.text).toBe('Somewhere');
    expect(after.address.location?.type).toBeUndefined();
  });

  it('does not write a fragment through findOneAndUpdate either', async () => {
    const shop = await Shop.create({
      businessName: 'Update Me', ownerName: 'Owner', phone: '6302079379',
    });

    await Shop.findOneAndUpdate(
      { _id: shop._id },
      { $set: { 'address.location': { coordinates: [] } } },
    );

    const after = await Shop.findById(shop._id).lean();
    expect(after.address?.location?.type).toBeUndefined();
  });
});
