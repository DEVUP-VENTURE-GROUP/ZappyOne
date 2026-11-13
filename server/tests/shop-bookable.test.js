// The owner's dashboard says Live only when a customer could really book: every check customers' search makes, plus one approved price.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let svc; let ProviderPricing;
beforeAll(async () => {
  await startMongo();
  svc = require('../src/modules/shop/shop.service');
  ({ ProviderPricing } = require('../src/modules/repair/models/pricing.model'));
});
afterAll(stopMongo);

const ready = (extra = {}) => ({
  _id: new mongoose.Types.ObjectId(), isActive: true, isBlocked: false, kyc: { status: 'approved' },
  address: { location: { coordinates: [78.38, 17.44] } }, services: ['bike_wash'], takingOrders: true, ...extra,
});
const price = (shopId, approvalStatus) => ProviderPricing.create({ shopId, vertical: 'bike_wash', repairCode: 'foam_wash', totalPaise: 20900, approvalStatus, isActive: true, supersededAt: null });

test('each missing step is named, in the order the owner fixes them', async () => {
  expect(await svc.bookableState(ready({ isBlocked: true }))).toMatchObject({ live: false, reason: expect.stringMatching(/on hold/) });
  expect(await svc.bookableState(ready({ kyc: { status: 'pending_review' } }))).toMatchObject({ live: false, reason: 'Documents not approved yet' });
  expect(await svc.bookableState(ready({ address: {} }))).toMatchObject({ live: false, reason: 'Pin your shop address' });
  expect(await svc.bookableState(ready({ services: [] }))).toMatchObject({ live: false, reason: expect.stringMatching(/approve your services/) });
  expect(await svc.bookableState(ready({ takingOrders: false }))).toMatchObject({ live: false, reason: 'Your Live switch is off' });
});

test('approved documents and services but no approved price is not Live', async () => {
  const shop = ready();
  expect(await svc.bookableState(shop)).toMatchObject({ live: false, reason: expect.stringMatching(/prices/) });
  await price(shop._id, 'pending');
  expect((await svc.bookableState(shop)).live).toBe(false);
  await ProviderPricing.updateOne({ shopId: shop._id }, { $set: { approvalStatus: 'approved' } });
  expect(await svc.bookableState(shop)).toEqual({ live: true, reason: null });
});
