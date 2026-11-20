// The old events engine moves onto the store engine: dry run first, then partners become shops, setups menu items, bookings jobs; running it again adds nothing.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let mig; let EventPartner; let EventTheme; let EventBooking; let Shop; let RepairBooking;
beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  mig = require('../src/modules/events/migrate-to-store');
  EventPartner = require('../src/modules/events/event-partner.model');
  EventTheme = require('../src/modules/events/event-theme.model');
  EventBooking = require('../src/modules/events/event-booking.model');
  Shop = require('../src/modules/shop/shop.model');
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
});
afterAll(stopMongo);

async function seedOld() {
  const p = await EventPartner.create({ businessName: 'Balloon Bazaar', ownerName: 'Kiran', phone: '9555500011', kyc: { status: 'approved' }, bio: 'Birthday specialists' });
  const t = await EventTheme.create({ partnerId: p._id, categoryId: new mongoose.Types.ObjectId(), title: 'Pastel birthday arch', coverImage: 'event-photos/arch.jpg',
    startingPricePaise: 349900, includedItems: ['Balloon arch', 'Name banner'], setupDurationMinutes: 90, status: 'approved' });
  const userId = new mongoose.Types.ObjectId();
  const open = await EventBooking.create({ userId, themeId: t._id, partnerId: p._id, eventDate: new Date('2026-12-05T00:00:00Z'), eventTimeSlot: '6:30 PM',
    address: { line1: 'Flat 4B, Kondapur', city: 'Hyderabad', pincode: '500084', lat: 17.46, lng: 78.36 }, guestCount: 25, notes: 'Pink and white',
    pricing: { themePricePaise: 349900, totalPaise: 369900, advancePaise: 0, remainingPaise: 369900 }, status: 'partner_assigned' });
  const noPin = await EventBooking.create({ userId, themeId: t._id, partnerId: p._id, eventDate: new Date(), eventTimeSlot: '10:00 AM',
    address: { line1: 'Somewhere' }, pricing: { totalPaise: 100000, advancePaise: 0, remainingPaise: 100000 }, status: 'confirmed' });
  return { p, t, open, noPin };
}

test('a dry run reports and writes nothing; applying moves partner, setup and booking; a second run adds nothing', async () => {
  const { p, open, noPin } = await seedOld();

  const dry = await mig.migrate();
  expect(dry).toMatchObject({ apply: false, partners: 1, shopsCreated: 1, menuItems: 1, bookings: 1 });
  expect(dry.skipped).toEqual([{ booking: String(noPin._id), why: 'no map point for the venue' }]);
  expect(await Shop.countDocuments({ phone: p.phone })).toBe(0);
  expect(await RepairBooking.countDocuments({})).toBe(0);

  const done = await mig.migrate({ apply: true });
  expect(done.errors).toEqual([]);
  const shop = await Shop.findOne({ phone: p.phone }).lean();
  expect(shop).toMatchObject({ businessName: 'Balloon Bazaar', kyc: { status: 'approved' } });
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  expect(await ProviderEnrolment.findOne({ shopId: shop._id, lineCode: 'event_decoration' }).lean()).toMatchObject({ status: 'approved', domainCode: 'events' });

  const menu = await require('../src/modules/repair/services/provider-menu.service').menu({ shopId: shop._id, workerId: null }, 'event_decoration');
  const item = menu.items.find((i) => i.name === 'Pastel birthday arch');
  expect(item).toMatchObject({ own: true, offered: true, photoKey: 'event-photos/arch.jpg', includes: ['Balloon arch', 'Name banner'], prices: { evedec_one: 349900 } });

  const job = await RepairBooking.findOne({ 'occasion.legacyEventBookingId': open._id }).lean();
  expect(job).toMatchObject({ shopId: shop._id, vertical: 'event_decoration', repairCode: item.repairCode, status: 'WORKER_ACCEPTED',
    occasion: { guests: 25, timeSlot: '6:30 PM', notes: 'Pink and white' }, priceSnapshot: { totalPaise: 369900 } });
  expect(job.scheduledAt.toISOString()).toBe('2026-12-05T13:00:00.000Z');

  const again = await mig.migrate({ apply: true });
  expect(again).toMatchObject({ shopsCreated: 0, shopsLinked: 1, bookings: 0, bookingsAlready: 1 });
  expect(await RepairBooking.countDocuments({ 'occasion.legacyEventBookingId': open._id })).toBe(1);
});

test('the time slot becomes the start moment in India time', () => {
  expect(mig.startOf(new Date('2026-12-05T00:00:00Z'), '10:00 AM').toISOString()).toBe('2026-12-05T04:30:00.000Z');
  expect(mig.startOf(new Date('2026-12-05T00:00:00Z'), 'evening').toISOString()).toBe('2026-12-05T00:00:00.000Z');
});
