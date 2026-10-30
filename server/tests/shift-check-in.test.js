// A shop's technician accepts only while checked in for their shift; independent pros are not held to a shop shift.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let assertCheckedIn; let Worker; let Shop;
beforeAll(async () => {
  await startMongo();
  ({ assertCheckedIn } = require('../src/modules/jobs/assignment'));
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
});
afterAll(stopMongo);

test('off duty is refused with a clear code; checked in goes through; an independent pro is never asked', async () => {
  const shop = await Shop.create({ businessName: 'Ravi Repairs', ownerName: 'Ravi', phone: '9000000401' });
  const tech = await Worker.create({ name: 'Arun', phone: '9000000402', shopId: shop._id, isOnline: false });
  await expect(assertCheckedIn(tech._id)).rejects.toMatchObject({ status: 409, code: 'NOT_CHECKED_IN' });
  await Worker.updateOne({ _id: tech._id }, { $set: { isOnline: true } });
  await expect(assertCheckedIn(tech._id)).resolves.toBeUndefined();
  const solo = await Worker.create({ name: 'Imran', phone: '9000000403', isOnline: false });
  await expect(assertCheckedIn(solo._id)).resolves.toBeUndefined();
});
