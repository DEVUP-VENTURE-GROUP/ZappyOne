/**
 * "Nearby shops" lists only shops verified for a live service, with what each
 * can be booked for — and a shop's public page never carries its documents.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { findNearbyShops, getShopProfile } = require('../src/modules/shop/shop.service');

jest.setTimeout(60000);
const HERE = { lat: 17.4483, lng: 78.3915 };
const at = (lng, lat) => ({ text: 'Madhapur', location: { type: 'Point', coordinates: [lng, lat] } });

let verified;
let unverified;
beforeAll(async () => {
  await startMongo();
  await Shop.syncIndexes();
  await ServiceDomain.create({ code: 'electronics', name: 'Electronics', isActive: true });
  await ServiceLine.create({ code: 'mobile_repair', name: 'Phone Repair', domainCode: 'electronics', status: 'live', isActive: true, customerPath: '/repair' });
  verified = await Shop.create({ phone: '9000000601', businessName: 'Verified Mobiles', ownerName: 'Owner', isActive: true, address: at(HERE.lng, HERE.lat), kyc: { status: 'approved', aadhaarUrl: 'secret/aadhaar.jpg' } });
  unverified = await Shop.create({ phone: '9000000602', businessName: 'Not Yet', ownerName: 'Owner', isActive: true, address: at(HERE.lng, HERE.lat) });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: verified._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
});
afterAll(stopMongo);

test('lists only shops verified for a live service, with how to book it', async () => {
  const { shops, services } = await findNearbyShops({ ...HERE, radiusKm: 5 });
  expect(shops.map((s) => s.businessName)).toEqual(['Verified Mobiles']);
  expect(shops[0].services).toEqual([{ code: 'mobile_repair', name: 'Phone Repair', icon: '', path: '/repair' }]);
  expect(services).toEqual([{ code: 'mobile_repair', name: 'Phone Repair' }]);
  expect((await findNearbyShops({ ...HERE, service: 'laptop_repair' })).shops).toHaveLength(0);
});

test('a shop page shows public fields only, and only for a verified shop', async () => {
  const page = await getShopProfile(verified._id);
  expect(page.businessName).toBe('Verified Mobiles');
  expect(page.kyc).toBeUndefined();
  expect(page.phone).toBeUndefined();
  expect(await getShopProfile(unverified._id)).toBeNull();
  expect(await getShopProfile(new mongoose.Types.ObjectId())).toBeNull();
});
