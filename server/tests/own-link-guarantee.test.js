// Two differentiators and their abuse guards: a partner's own storefront link (secret code, own-link commission for their first months, reviews kept off the public rating) and the redo guarantee every ZappyOne booking carries.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let Shop; let link; let commission;

beforeAll(async () => {
  await startMongo();
  Shop = require('../src/modules/shop/shop.model');
  link = require('../src/modules/shop/share-link');
  commission = require('../src/modules/shop/partner-commission');
});
afterAll(stopMongo);

test('a partner gets one secret link; only their own code on their own booking counts', async () => {
  const shop = await Shop.create({ businessName: 'Ravi Electricals', ownerName: 'Ravi', phone: '9000000301', isActive: true });
  const other = await Shop.create({ businessName: 'Other Shop', ownerName: 'O', phone: '9000000302', isActive: true });
  const a = await link.linkFor({ kind: 'shop', id: shop._id }, { webBase: 'https://zappyone.com', vertical: 'electrician' });
  const again = await link.linkFor({ kind: 'shop', id: shop._id }, { webBase: 'https://zappyone.com' });
  expect(a.code).toMatch(/^[a-z0-9]{12}$/);
  expect(again.code).toBe(a.code);
  expect(a.url).toBe(`https://zappyone.com/storefront/shop/${shop._id}?via=${a.code}&service=electrician`);
  expect(a).toMatchObject({ ownLinkPct: 0, active: true });
  expect(await link.matches({ via: a.code, shopId: shop._id })).toBe(true);
  expect(await link.matches({ via: a.code, shopId: other._id })).toBe(false);
  expect(await link.matches({ via: 'guessedcode1', shopId: shop._id })).toBe(false);
  expect(await link.matches({ via: null, shopId: shop._id })).toBe(false);
});

test('own-link bookings pay the own-link rate only in the partner\'s first months', async () => {
  const fresh = await Shop.create({ businessName: 'New Shop', ownerName: 'N', phone: '9000000303', isActive: true, partnerType: 'shop' });
  const old = await Shop.create({ businessName: 'Old Shop', ownerName: 'O', phone: '9000000304', isActive: true, partnerType: 'shop' });
  await Shop.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 400 * 86400000) } });
  expect(await commission.pctFor({ shopId: fresh._id, viaOwnLink: true })).toBe(0);
  expect(await commission.pctFor({ shopId: fresh._id, viaOwnLink: false })).toBe(5);
  expect(await commission.pctFor({ shopId: old._id, viaOwnLink: true })).toBe(5);
});

test('a review from an own-link booking is kept but never counts in the public rating', async () => {
  const reviews = require('../src/modules/review/review.service');
  const Review = require('../src/modules/review/review.model');
  const shopId = new mongoose.Types.ObjectId();
  await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), shopId, rating: 5, excluded: true });
  await reviews.recordReview({ kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), shopId, rating: 3 });
  expect(await Review.countDocuments({ shopId })).toBe(2);
  const summary = await reviews.publicSummary({ shopId });
  expect(summary.breakdown).toMatchObject({ 3: 1, 5: 0 });
});

test('every booked job carries at least the redo guarantee, whatever the provider set', async () => {
  const { RepairConfig } = require('../src/modules/repair/models/config.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const pricing = require('../src/modules/repair/services/pricing.service');
  await RepairConfig.create({ vertical: 'electrician' });
  await Repair.create({ code: 'el_fan', name: 'Fan install', vertical: 'electrician', pricingMode: 'fixed', minSkillLevel: 1, allowedServiceModes: ['doorstep'], warrantyDays: 0 });
  pricing.invalidateConfigCache('electrician');
  const snap = await pricing.buildPriceSnapshot({ vertical: 'electrician', repairCode: 'el_fan', providerPrice: { totalPaise: 24900, warrantyDays: 0 }, serviceMode: 'doorstep' });
  expect(snap.warrantyDays).toBe(7);
  const long = await pricing.buildPriceSnapshot({ vertical: 'electrician', repairCode: 'el_fan', providerPrice: { totalPaise: 24900, warrantyDays: 30 }, serviceMode: 'doorstep' });
  expect(long.warrantyDays).toBe(30);
});
