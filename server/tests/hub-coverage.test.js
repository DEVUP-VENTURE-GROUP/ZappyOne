// A hub serves a place inside its drawn area, or within serviceKm of its meeting point when none is drawn (workforce/coverage).
const { covers, toPolygon } = require('../src/modules/workforce/coverage');

const MADHAPUR = { lat: 17.4483, lng: 78.3915 };
const hub = (extra = {}) => ({ isActive: true, serviceKm: 25, meetingPoint: { location: { coordinates: [MADHAPUR.lng, MADHAPUR.lat] } }, ...extra });
const km = (d) => ({ lat: MADHAPUR.lat + d / 111, lng: MADHAPUR.lng });

test('a 25 km hub serves an order 24 km away and not one 26 km away', () => {
  expect(covers(hub(), km(24))).toBe(true);
  expect(covers(hub(), km(26))).toBe(false);
});

test('a drawn area decides instead of the radius', () => {
  const square = toPolygon([[78.38, 17.44], [78.40, 17.44], [78.40, 17.46], [78.38, 17.46]]);
  expect(square.coordinates[0]).toHaveLength(5);
  expect(covers(hub({ area: square }), MADHAPUR)).toBe(true);
  expect(covers(hub({ area: square }), km(5))).toBe(false);
});

test('a concave area: the notch is outside', () => {
  const u = toPolygon([[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]]);
  const h = hub({ area: u });
  expect(covers(h, { lat: 2, lng: 0.5 })).toBe(true);
  expect(covers(h, { lat: 2, lng: 1.5 })).toBe(false);
});

test('a closed hub serves nowhere', () => {
  expect(covers(hub({ isActive: false }), MADHAPUR)).toBe(false);
});

test('pincodes add to a drawn area, and once either is set the radius no longer applies', () => {
  const { boxPolygon } = require('../src/modules/workforce/coverage');
  const pin = { kind: 'pincode', key: '500081', area: boxPolygon({ south: 17.43, west: 78.37, north: 17.46, east: 78.40 }) };
  const far = { lat: 17.60, lng: 78.55 };
  const drawn = toPolygon([[78.54, 17.59], [78.56, 17.59], [78.56, 17.61], [78.54, 17.61]]);
  expect(covers(hub({ places: [pin] }), MADHAPUR)).toBe(true);
  expect(covers(hub({ places: [pin] }), km(10))).toBe(false);
  expect(covers(hub({ places: [pin], area: drawn }), far)).toBe(true);
  expect(covers(hub({ places: [pin], area: drawn }), MADHAPUR)).toBe(true);
});
