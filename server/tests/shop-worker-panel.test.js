/**
 * The shop technician's panel on servicepro.
 *   - passing a job hands it back to the SHOP (the owner reassigns); it must
 *     never be released to the open market, which lost shops their customers
 *   - the summary shows who they work for and the value of jobs they finished
 *   - a shop technician never gets coverage of their own
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
const bookingService = require('../src/modules/repair/services/booking.service');
const shopService = require('../src/modules/shop/shop.service');
const { provisionCoverage } = require('../src/modules/onboarding/auto-provision.service');

jest.setTimeout(60000);

let shop, tech;
beforeAll(async () => {
  await startMongo();
  shop = await Shop.create({ phone: '9000000301', businessName: 'Ravi Mobiles', ownerName: 'Ravi' });
  tech = await Worker.create({ phone: '9000000302', name: 'Suresh', shopId: shop._id });
});
afterAll(stopMongo);

const booking = (extra) => RepairBooking.create({
  reference: `SW${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  vertical: 'mobile',
  userId: new mongoose.Types.ObjectId(),
  shopId: shop._id,
  workerId: tech._id,
  status: 'PROVIDER_ASSIGNED',
  paymentMethod: 'cash',
  brandCode: 'samsung',
  modelCode: 'samsung-galaxy-s24',
  problemCodes: ['screen_cracked'],
  serviceMode: 'doorstep',
  location: { address: 'Madhapur', coordinates: [78.39, 17.45] },
  priceSnapshot: { subtotalPaise: 150000, totalPaise: 150000 },
  ...extra,
});

test('a shop technician passing a job hands it back to the shop, not the market', async () => {
  const b = await booking({ status: 'WORKER_ACCEPTED' });
  const out = await bookingService.declineBooking({
    bookingId: b._id, actorRole: 'worker', actorId: tech._id, reason: 'Bike broke down',
  });
  expect(String(out.shopId)).toBe(String(shop._id));
  expect(out.workerId).toBeNull();
  expect(out.status).toBe('PROVIDER_ASSIGNED');
  expect(out.declines.at(-1)).toMatchObject({ providerKind: 'worker', reason: 'Bike broke down' });
});

test('passing back needs a reason, and is refused once they have set out', async () => {
  const b = await booking();
  await expect(bookingService.declineBooking({ bookingId: b._id, actorRole: 'worker', actorId: tech._id, reason: ' ' }))
    .rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  const onTheWay = await booking({ status: 'ON_THE_WAY' });
  await expect(bookingService.declineBooking({ bookingId: onTheWay._id, actorRole: 'worker', actorId: tech._id, reason: 'x' }))
    .rejects.toMatchObject({ code: 'TOO_LATE_TO_DECLINE' });
});

test('the summary names the shop and totals finished job value, today and this week', async () => {
  await booking({ status: 'COMPLETED', completedAt: new Date(), priceSnapshot: { subtotalPaise: 80000, totalPaise: 80000 } });
  const s = await shopService.shopWorkerSummary(tech._id);
  expect(s.shop).toMatchObject({ name: 'Ravi Mobiles', ownerName: 'Ravi', phone: '9000000301' });
  expect(s.today).toEqual({ jobs: 1, valuePaise: 80000 });
  expect(s.week.jobs).toBeGreaterThanOrEqual(1);
});

test('an independent worker has no shop summary', async () => {
  const solo = await Worker.create({ phone: '9000000303', name: 'Anil' });
  await expect(shopService.shopWorkerSummary(solo._id)).rejects.toMatchObject({ code: 'NOT_A_SHOP_WORKER' });
});

test('a shop technician never gets coverage of their own, even with old enrolments', async () => {
  await ProviderEnrolment.create({
    providerKind: 'individual', workerId: tech._id, domainCode: 'repair', lineCode: 'mobile_repair', status: 'approved',
  });
  await provisionCoverage({ workerId: tech._id, coordinates: [78.39, 17.45] });
  expect(await ProviderServiceArea.countDocuments({ workerId: tech._id })).toBe(0);
});
