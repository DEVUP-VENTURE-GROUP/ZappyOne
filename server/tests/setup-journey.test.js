// A shop's home Continue card: each step follows the record its gate reads, review shows as waiting, and the card's next step skips what ZappyOne is doing.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let journey; let Shop; let models;
beforeAll(async () => {
  await startMongo();
  ({ setupJourney: journey } = require('../src/modules/onboarding/profile-check'));
  Shop = require('../src/modules/shop/shop.model');
  models = {
    ...require('../src/modules/onboarding/onboarding.model'),
    ...require('../src/modules/repair/models/pricing.model'),
    ...require('../src/modules/repair/models/config.model'),
  };
});
afterAll(stopMongo);

test('a new shop starts at its profile, then waits on review, then sets prices and area', async () => {
  const shop = await Shop.create({ businessName: 'Ravi Repairs', ownerName: 'Ravi', phone: '9000000301', isActive: true, kyc: { status: 'not_submitted' } });
  let j = await journey(shop._id);
  expect(j).toMatchObject({ live: false, done: 0, total: 5, next: { key: 'profile' } });

  await Shop.updateOne({ _id: shop._id }, { $set: { email: 'ravi@example.com', bio: 'Phone and laptop repairs for twelve years in Kondapur.', yearsActive: 12, coverImageUrl: 'shop-covers/r.jpg', hours: [{ day: 1, opensAt: '10:00', closesAt: '21:00' }], address: { text: 'Kondapur Main Road', location: { type: 'Point', coordinates: [78.39, 17.44] } }, 'kyc.status': 'pending_review' } });
  await models.ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'pending_review' });
  j = await journey(shop._id);
  expect(j.steps.find((s) => s.key === 'approved')).toMatchObject({ done: false, waiting: true });
  expect(j.next.key).toBe('prices');

  await models.ProviderPricing.create({ shopId: shop._id, vertical: 'mobile', repairCode: 'screen', brandCode: 'apple', totalPaise: 250000, approvalStatus: 'approved' });
  await models.ProviderServiceArea.create({ shopId: shop._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [78.39, 17.44] }, radiusKm: 8, serviceModes: ['doorstep'] });
  j = await journey(shop._id);
  expect(j.next).toBeNull();
  expect(j.done).toBe(4);
});
