/**
 * Price requests, end to end: nobody nearby has priced the repair, so the
 * customer asks; the shops around are told; one answers; its answer becomes its
 * price and a bookable card for the customer; booking closes the request.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

const LAT = 17.44; const LNG = 78.39;
let svc; let Shop; let RepairPriceRequest; let ProviderPricing; let ProviderCapability;
const userId = new mongoose.Types.ObjectId();
const shops = [];

beforeAll(async () => {
  await startMongo();
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const { ProviderServiceArea, RepairConfig } = require('../src/modules/repair/models/config.model');
  const { ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  ({ ProviderPricing } = require('../src/modules/repair/models/pricing.model'));
  ({ ProviderCapability } = require('../src/modules/repair/models/capability.model'));
  ({ RepairPriceRequest } = require('../src/modules/repair/models/price-request.model'));
  Shop = require('../src/modules/shop/shop.model');
  svc = require('../src/modules/repair/services/price-request.service');

  await RepairConfig.create({ vertical: 'mobile' });
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics', repairVertical: 'mobile', status: 'live', providerKinds: ['shop', 'individual'] });
  await Repair.create({
    code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile', pricingMode: 'fixed', minSkillLevel: 2,
    allowedServiceModes: ['doorstep', 'workshop', 'pickup_repair'], partRequirements: [{ componentCode: 'battery', required: true, quantity: 1 }],
    warrantyDays: 90,
  });
  for (const [i, name] of ['Near Shop', 'Other Shop'].entries()) {
    const shop = await Shop.create({
      businessName: name, ownerName: 'Owner', phone: `90000000${50 + i}`, isActive: true,
      kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: [LNG, LAT] } }, services: ['mobile_repair'],
    });
    await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
    await ProviderServiceArea.create({ shopId: shop._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 10, serviceModes: ['doorstep', 'pickup_repair'] });
    shops.push(shop);
  }
});
afterAll(stopMongo);

const ask = () => svc.create({
  userId: String(userId),
  body: { vertical: 'mobile', brandCode: 'samsung', modelCode: 'galaxy-s23', repairCode: 'battery_replacement', serviceMode: 'doorstep', location: { coordinates: [LNG, LAT], address: 'Madhapur' } },
});

test('asking tells every approved shop around; asking again returns the same request', async () => {
  const first = await ask();
  expect(first.shopsAsked).toBe(2);
  const again = await ask();
  expect(again.reused).toBe(true);
  expect(String(again.request._id)).toBe(String(first.request._id));
});

test('a shop answers: it becomes its price and it does the repair; the customer sees one bookable card', async () => {
  const req = await RepairPriceRequest.findOne({ userId });
  await expect(svc.offer({ shopId: String(shops[0]._id), id: req._id, totalPaise: 145000, requestedById: String(shops[0]._id) }))
    .rejects.toMatchObject({ code: 'GRADE_REQUIRED' });
  await svc.offer({ shopId: String(shops[0]._id), id: req._id, totalPaise: 145000, qualityCode: 'premium', warrantyDays: 90, requestedById: String(shops[0]._id) });

  expect(await ProviderPricing.countDocuments({ shopId: shops[0]._id, repairCode: 'battery_replacement', modelCode: 'galaxy-s23', qualityCode: 'premium' })).toBe(1);
  expect(await ProviderCapability.countDocuments({ shopId: shops[0]._id, repairCode: 'battery_replacement', isActive: true })).toBe(1);

  const view = await svc.viewForCustomer({ id: req._id, userId });
  expect(view.request.offers).toHaveLength(1);
  expect(view.providers.map((p) => String(p.shopId))).toEqual([String(shops[0]._id)]);

  // The other shop sees the request, never the first shop's price.
  const list = await svc.listForShop({ shopId: String(shops[1]._id) });
  expect(list).toHaveLength(1);
  expect(list[0].myOffer).toBeNull();
  expect(JSON.stringify(list[0])).not.toContain('145000');
});

test('booking closes it; nobody can answer a closed request', async () => {
  const req = await RepairPriceRequest.findOne({ userId });
  await svc.markBooked({ priceRequestId: req._id, userId, bookingId: new mongoose.Types.ObjectId(), shopId: shops[0]._id });
  expect((await RepairPriceRequest.findById(req._id)).status).toBe('booked');
  await expect(svc.offer({ shopId: String(shops[1]._id), id: req._id, totalPaise: 120000, qualityCode: 'standard', requestedById: String(shops[1]._id) }))
    .rejects.toMatchObject({ code: 'CLOSED' });
});
