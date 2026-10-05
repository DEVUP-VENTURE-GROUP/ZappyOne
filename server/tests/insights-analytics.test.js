/**
 * Insights read the bookings the platform takes today (repair, pet, helping,
 * events), never the retired order engine:
 *   - totals: bookings, completed, cancelled, money (value and what we earn),
 *     average order, cancel rate, time to get a provider, repeat customers
 *   - each figure beside the previous period of the same length
 *   - per service and per area (area only, never a full address)
 *   - demand: searchers against providers and bookings, per service
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let analytics; let demand; let RepairBooking; let PetBooking; let Order; let SearchEvent; let ServiceLine; let ProviderEnrolment;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0); // 5 Oct 2026, 17:30 in India
const daysAgo = (d, h = 0) => new Date(NOW - d * 86_400_000 - h * 3_600_000);
const ravi = new mongoose.Types.ObjectId();
const asha = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  analytics = require('../src/modules/admin-portal/analytics.service');
  ({ demand } = require('../src/modules/admin-portal/search-demand.service'));
  ({ RepairBooking } = require('../src/modules/repair/models/booking.model'));
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Order = require('../src/modules/order/order.model');
  ({ SearchEvent } = require('../src/modules/telemetry/telemetry.model'));
  ({ ServiceLine, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model'));

  const repair = (createdAt, status, total, extra = {}) => ({
    userId: ravi, vertical: 'mobile', status, reference: `R-${Math.random()}`, brandCode: 'x', modelCode: 'y',
    location: { type: 'Point', coordinates: [78.39, 17.44], address: 'Flat 2B, Sri Residency, Madhapur, Hyderabad, Telangana 500081' },
    priceSnapshot: { totalPaise: total, commissionPaise: total / 10, platformFeePaise: 1000 },
    statusHistory: [{ status: 'PENDING', at: createdAt }, { status: 'PROVIDER_ASSIGNED', at: new Date(createdAt.getTime() + 6 * 60000) }],
    createdAt, updatedAt: createdAt, ...extra,
  });
  await RepairBooking.collection.insertMany([
    repair(daysAgo(1), 'COMPLETED', 200000),
    repair(daysAgo(2), 'COMPLETED', 100000),
    repair(daysAgo(3), 'CANCELLED', 50000),
    // Previous period (8-14 days ago): one completed, from a customer who returns later.
    repair(daysAgo(9), 'COMPLETED', 100000),
  ]);
  await PetBooking.collection.insertOne({
    userId: asha, categoryCode: 'pet_grooming', status: 'SERVICE_COMPLETED', reference: 'P-1',
    serviceLocation: { type: 'Point', coordinates: [78.4, 17.4], address: 'House 12, Road 3, Kondapur, Hyderabad' },
    pricing: { totalPaise: 80000, subtotalPaise: 70000, commissionPaise: 7000, platformFeePaise: 1000 },
    statusHistory: [{ status: 'BOOKED', at: daysAgo(1) }, { status: 'PROVIDER_ACCEPTED', at: new Date(daysAgo(1).getTime() + 20 * 60000) }],
    createdAt: daysAgo(1), updatedAt: daysAgo(1),
  });
  // The retired engine: must not count.
  await Order.collection.insertOne({ userId: ravi, status: 'completed', pricing: { totalPaise: 999900 }, createdAt: daysAgo(1) });
});
afterAll(stopMongo);

test('totals, money, rates and time to get a provider, beside the previous period', async () => {
  const out = await analytics.overview({ days: 7, now: NOW });
  expect(out.current).toMatchObject({
    bookings: 4, completed: 3, cancelled: 1,
    gmvPaise: 380000, // 2000 + 1000 + 800 rupees, completed only
    takePaise: 20000 + 1000 + 10000 + 1000 + 7000 + 1000, // commission + platform fee
    cancelRate: 25, customers: 2, repeatCustomers: 1, repeatRate: 50,
  });
  expect(out.current.medianAssignMin).toBe(6);
  expect(out.previous).toMatchObject({ bookings: 1, completed: 1, gmvPaise: 100000 });
  expect(out.delta.bookings).toBe(300);
  expect(out.daily).toHaveLength(7);
  expect(out.daily.reduce((s, d) => s + d.bookings, 0)).toBe(4);
});

test('per service and per area, area only', async () => {
  const out = await analytics.overview({ days: 7, now: NOW });
  expect(out.byService.map((s) => [s.label, s.bookings, s.completed])).toEqual([['Mobile Repair', 3, 2], ['Pet Grooming', 1, 1]]);
  expect(out.byArea.map((a) => a.area)).toEqual(['Madhapur, Hyderabad', 'Kondapur, Hyderabad']);
  expect(JSON.stringify(out.byArea)).not.toMatch(/Flat|House|500081/);
  expect(out.findings.some((f) => /Mobile Repair: 33.3% of bookings are cancelled/.test(f.text))).toBe(false); // under 5 bookings: not said
});

test('demand: searchers against providers and bookings, per service', async () => {
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics', status: 'live', repairVertical: 'mobile', customerPath: '/repair' });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: new mongoose.Types.ObjectId(), domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
  const s = (who, category, result = 'served', d = 1) => ({ userId: who, category, query: category, result, createdAt: daysAgo(d) });
  const people = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  await SearchEvent.collection.insertMany([
    ...people.map((p) => s(p, 'mobile_repair')),
    s(people[0], 'mobile_repair'), // same person twice: one searcher
    s(people[1], 'pet_boarding', 'no_service'),
  ]);
  const out = await demand({ days: 7, now: NOW });
  const mobile = out.services.find((x) => x.lineCode === 'mobile_repair');
  expect(mobile).toMatchObject({ searchers: 4, providers: 1, bookings: 3, pressure: 4, conversion: 75 });
  expect(out.services.find((x) => x.lineCode === 'pet_boarding')).toMatchObject({ searchers: 1, providers: 0, unserved: 1 });
  expect(out.searchers).toBe(4);
});

test('supply: providers per service, who is doing the work, declines', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const w = await Worker.collection.insertOne({ phone: '9800000999', name: 'Kiran', isOnline: true, rating: 4.6, reviewCount: 3 });
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: w.insertedId, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
  await RepairBooking.collection.updateMany({ status: 'COMPLETED', createdAt: { $gte: daysAgo(3) } }, { $set: { workerId: w.insertedId } });
  await RepairBooking.collection.updateOne({ status: 'CANCELLED' }, { $set: { declines: [{ providerKind: 'worker', providerId: w.insertedId, at: daysAgo(3) }] } });

  const out = await analytics.supply({ days: 7, now: NOW });
  const mobile = out.services.find((s) => s.lineCode === 'mobile_repair');
  expect(mobile).toMatchObject({ label: 'Mobile Phones', providers: 2, shops: 1, workers: 1, online: 1, bookings: 3 });
  expect(out.providers[0]).toMatchObject({ name: 'Kiran', kind: 'worker', completed: 2, declines: 1, rating: 4.6 });
});

test('funnel: people at each step, and the step that loses the most', async () => {
  const { VisitorSession } = require('../src/modules/telemetry/telemetry.model');
  await VisitorSession.collection.insertMany(Array.from({ length: 20 }, (_, i) => ({
    sessionId: `s-${i}`, userType: 'guest', firstSeen: daysAgo(1), lastSeen: daysAgo(1), bookingStartedAt: i < 6 ? daysAgo(1) : null,
  })));
  const out = await analytics.funnel({ days: 7, now: NOW });
  expect(out.steps.map((s) => [s.key, s.people])).toEqual([['visited', 20], ['searched', 4], ['opened', 6], ['booked', 2], ['completed', 2]]);
  expect(out.steps[3]).toMatchObject({ ofFirst: 10 });
  expect(out.findings[0].text).toMatch(/Biggest drop: visited the app → searched/);
});

test('customers: new against returning, cohorts, sign-ups who booked, ratings', async () => {
  const User = require('../src/modules/user/user.model');
  const Review = require('../src/modules/review/review.model');
  await User.collection.insertMany([
    { _id: asha, phone: '9800000111', name: 'Asha Rao', createdAt: daysAgo(2) },
    { _id: ravi, phone: '9800000110', name: 'Ravi Kumar', createdAt: daysAgo(40) },
    { phone: '9800000112', name: 'Never Booked', createdAt: daysAgo(2) },
  ]);
  await Review.collection.insertMany([
    { kind: 'pet', jobId: new mongoose.Types.ObjectId(), userId: asha, rating: 5, comment: 'Lovely', status: 'visible', excluded: false, flagged: false, createdAt: daysAgo(1) },
    { kind: 'repair', jobId: new mongoose.Types.ObjectId(), userId: ravi, rating: 1, comment: 'Came late', status: 'visible', excluded: false, flagged: false, createdAt: daysAgo(1) },
  ]);
  const out = await analytics.customers({ days: 7, now: NOW });
  // Ravi booked 9 days ago, so this week he is returning; Asha is new.
  expect(out.totals).toMatchObject({ customers: 2, newCustomers: 1, returning: 1, repeatRate: 50, signups: 2, activated: 1, averageRating: 3 });
  expect(out.lowRatings).toEqual([expect.objectContaining({ rating: 1, text: 'Came late', by: 'Ravi K.' })]);
  expect(out.cohorts).toHaveLength(6);
  expect(out.cohorts.at(-1)).toMatchObject({ customers: 1 }); // Asha's first booking is this month
});

test('money: what we earn, split, per service and payment method', async () => {
  const out = await analytics.money({ days: 7, now: NOW });
  expect(out.current).toMatchObject({
    gmvPaise: 380000, commissionPaise: 20000 + 10000 + 7000, platformFeePaise: 3000, takePaise: 40000, jobs: 3,
  });
  expect(out.current.takeRate).toBe(10.5);
  expect(out.byService[0]).toMatchObject({ label: 'Mobile Repair', takePaise: 32000 });
  expect(out.daily).toHaveLength(7);
});

test('map: ~1 km cells, providers, when, and where to expand', async () => {
  const out = await analytics.geo({ days: 7, now: NOW });
  const madhapur = out.cells.find((c) => c.lat === 17.44 && c.lng === 78.39);
  expect(madhapur).toMatchObject({ bookings: 3, completed: 2, cancelled: 1, area: 'Madhapur, Hyderabad' });
  expect(out.when.flat().reduce((a, b) => a + b, 0)).toBe(4);
  expect(out.totals).toMatchObject({ bookings: 4, mapped: 4 });
  expect(JSON.stringify(out.cells)).not.toMatch(/Flat|House/);
  expect(out.areas[0].area).toBe('Madhapur, Hyderabad');
});

test('highlights: repair quotes, customers slipping away, live now', async () => {
  const { RepairQuote } = require('../src/modules/repair/models/quote.model');
  const q = (status, total) => ({ bookingId: new mongoose.Types.ObjectId(), status, totalPaise: total, createdAt: daysAgo(2), updatedAt: daysAgo(2) });
  await RepairQuote.collection.insertMany([q('approved', 300000), q('rejected', 200000), q('expired', 100000), q('sent', 50000)]);
  const f = await analytics.funnel({ days: 7, now: NOW + 200000 }); // past the 3-minute cache
  expect(f.quotes).toMatchObject({ sent: 4, approved: 1, declined: 1, expired: 1, waiting: 1, lostPaise: 300000, approvalRate: 33.3 });

  // Ravi's job 40 days ago was done and he has not booked since.
  await RepairBooking.collection.insertOne({
    userId: new mongoose.Types.ObjectId(), vertical: 'mobile', status: 'COMPLETED', reference: 'R-old', brandCode: 'x', modelCode: 'y',
    priceSnapshot: { totalPaise: 100000 }, statusHistory: [], createdAt: daysAgo(40), updatedAt: daysAgo(40),
  });
  const c = await analytics.customers({ days: 7, now: NOW + 200000 });
  expect(c.atRisk.people).toBe(1);

  const l = await analytics.live();
  expect(l).toEqual(expect.objectContaining({ onApp: expect.any(Number), jobsLive: expect.any(Number), workersOnline: expect.any(Number) }));
});
