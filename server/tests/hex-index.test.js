// Providers are found by hexagon (core/geo/hex): every way a pin is saved keeps its cell, searches read the cells around the customer, and records from before the index are still found.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let hex; let Shop; let ProviderServiceArea; let matching;
const VIKARABAD = [77.9044, 17.3381];
const GACHIBOWLI = [78.3489, 17.4401];

beforeAll(async () => {
  await startMongo();
  hex = require('../src/core/geo/hex');
  Shop = require('../src/modules/shop/shop.model');
  ({ ProviderServiceArea } = require('../src/modules/repair/models/config.model'));
  matching = require('../src/modules/repair/services/matching.service');
});
afterAll(stopMongo);

test('the cell follows the pin through create, updateOne, findOneAndUpdate and a whole address', async () => {
  const s = await Shop.create({ businessName: 'Hex One', ownerName: 'A', phone: '9000000931', address: { text: 'x', location: { type: 'Point', coordinates: VIKARABAD } } });
  expect(s.addressHex).toBe(hex.cellOf(VIKARABAD));
  await Shop.updateOne({ _id: s._id }, { $set: { 'address.location': { type: 'Point', coordinates: GACHIBOWLI } } });
  expect((await Shop.findById(s._id).lean()).addressHex).toBe(hex.cellOf(GACHIBOWLI));
  await Shop.findOneAndUpdate({ _id: s._id }, { $set: { address: { text: 'y', location: { type: 'Point', coordinates: VIKARABAD } } } });
  expect((await Shop.findById(s._id).lean()).addressHex).toBe(hex.cellOf(VIKARABAD));
  // Saving something else leaves the cell alone.
  await Shop.updateOne({ _id: s._id }, { $set: { bio: 'hello' } });
  expect((await Shop.findById(s._id).lean()).addressHex).toBe(hex.cellOf(VIKARABAD));

  const a = await ProviderServiceArea.create({ shopId: s._id, cityCode: 'vikarabad', center: { type: 'Point', coordinates: VIKARABAD }, radiusKm: 20 });
  expect(a.centerHex).toBe(hex.cellOf(VIKARABAD));
});

test('found through the cells around the customer; nothing beyond 20 km', async () => {
  const s = await Shop.create({ businessName: 'Hex Two', ownerName: 'B', phone: '9000000932', isActive: true, kyc: { status: 'approved' }, address: { text: 'x', location: { type: 'Point', coordinates: VIKARABAD } } });
  await ProviderServiceArea.create({ shopId: s._id, cityCode: 'vikarabad', center: { type: 'Point', coordinates: VIKARABAD }, radiusKm: 20, serviceModes: ['doorstep'] });
  const at = async ([lng, lat]) => (await matching.findServiceableProviders({ lng, lat, serviceMode: 'doorstep' })).some((p) => String(p.shopId) === String(s._id));
  expect(await at([VIKARABAD[0] + 0.05, VIKARABAD[1]])).toBe(true);   // ~5 km
  expect(await at([VIKARABAD[0] + 0.17, VIKARABAD[1]])).toBe(true);   // ~18 km
  expect(await at([VIKARABAD[0] + 0.23, VIKARABAD[1]])).toBe(false);  // ~24 km
  expect(await at(GACHIBOWLI)).toBe(false);                            // ~48 km
});

test('a record from before the index (no cell) is still found, and the backfill gives it one', async () => {
  const id = new mongoose.Types.ObjectId();
  await Shop.collection.insertOne({ _id: id, businessName: 'Old Shop', ownerName: 'C', phone: '9000000933', isActive: true, kyc: { status: 'approved' }, address: { text: 'x', location: { type: 'Point', coordinates: VIKARABAD } } });
  await ProviderServiceArea.collection.insertOne({ shopId: id, cityCode: 'vikarabad', center: { type: 'Point', coordinates: VIKARABAD }, radiusKm: 20, serviceModes: ['doorstep'], isActive: true });
  const found = async () => (await matching.findServiceableProviders({ lng: VIKARABAD[0] + 0.02, lat: VIKARABAD[1], serviceMode: 'doorstep' })).some((p) => String(p.shopId) === String(id));
  expect(await found()).toBe(true);

  await require('../scripts/backfill-hex').run();
  expect((await Shop.collection.findOne({ _id: id })).addressHex).toBe(hex.cellOf(VIKARABAD));
  expect((await ProviderServiceArea.collection.findOne({ shopId: id })).centerHex).toBe(hex.cellOf(VIKARABAD));
  expect(await found()).toBe(true);
});
