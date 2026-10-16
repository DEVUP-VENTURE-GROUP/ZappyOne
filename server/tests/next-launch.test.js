// Next launch (admin-portal/expansion): demand nobody's hub covers, picked greedily into sites within the arrival promise.
jest.mock('../src/modules/admin-portal/analytics.service', () => ({
  geo: jest.fn(), bookingsIn: jest.fn(), istDayStart: (t) => t,
}));
const { startMongo, stopMongo } = require('./helpers');
const analytics = require('../src/modules/admin-portal/analytics.service');
const Hub = require('../src/modules/workforce/hub.model');
const { nextLaunch } = require('../src/modules/admin-portal/expansion.service');

jest.setTimeout(60000);

const cell = (lat, lng, extra = {}) => ({ lat, lng, bookings: 0, completed: 0, cancelled: 0, takePaise: 0, searches: 0, unserved: 0, area: null, ...extra });
const NARSINGI = { lat: 17.39, lng: 78.36 };
const KOMPALLY = { lat: 17.54, lng: 78.49 };
const MADHAPUR = { lat: 17.45, lng: 78.39 };

beforeAll(async () => {
  await startMongo();
  await Hub.create({ name: 'Madhapur', city: 'Hyderabad', serviceKm: 2, meetingPoint: { location: { type: 'Point', coordinates: [MADHAPUR.lng, MADHAPUR.lat] } } });
  analytics.geo.mockResolvedValue({
    providers: [{ kind: 'shop', lat: KOMPALLY.lat, lng: KOMPALLY.lng, radiusKm: 3, live: false }],
    cells: [
      cell(NARSINGI.lat, NARSINGI.lng, { bookings: 30, searches: 20, unserved: 15, area: 'Narsingi', takePaise: 300000 }),
      cell(NARSINGI.lat + 0.01, NARSINGI.lng, { bookings: 10, searches: 5, area: 'Narsingi' }),
      cell(KOMPALLY.lat, KOMPALLY.lng, { bookings: 8, searches: 6, unserved: 2, area: 'Kompally' }),
      cell(MADHAPUR.lat, MADHAPUR.lng, { bookings: 50, searches: 30, area: 'Madhapur' }),
    ],
  });
  analytics.bookingsIn.mockResolvedValue([
    ...Array.from({ length: 6 }, () => ({ point: NARSINGI, service: 'AC repair', at: Date.UTC(2026, 9, 10, 13, 30) })),
    { point: NARSINGI, service: 'Plumbing', at: Date.UTC(2026, 9, 10, 4, 30) },
  ]);
});
afterAll(stopMongo);

test('the biggest unserved cluster first, then the next; demand inside a hub is left out', async () => {
  const r = await nextLaunch({ days: 30 });
  expect(r.sites.map((s) => s.area)).toEqual(['Narsingi', 'Kompally']);
  expect(r.sites[0]).toMatchObject({ bookings: 40, unserved: 15, jobsPerMonth: 55, staffNeeded: 1, topServices: [{ name: 'AC repair', n: 6 }, { name: 'Plumbing', n: 1 }], peakHour: 19 });
  expect(r.sites[1].partnersNearby).toBe(1);
  expect(r.coverage.hubPct).toBe(Math.round((80 / 176) * 100));
  expect(r.coverage.partnerOnlyPct).toBe(Math.round((16 / 176) * 100));
  expect(r.summary[1]).toMatch(/Launch next in Narsingi/);
  expect(r.summary.join(' ')).toMatch(/15 people searched there and found no one/);
});

test('with no demand it says so instead of guessing', async () => {
  analytics.geo.mockResolvedValueOnce({ providers: [], cells: [] });
  analytics.bookingsIn.mockResolvedValueOnce([]);
  const r = await nextLaunch({ days: 30 });
  expect(r.sites).toEqual([]);
  expect(r.summary[0]).toMatch(/Not enough/);
});
