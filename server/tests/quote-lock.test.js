// The quoted distance holds for 10 minutes for that provider and service; anything forged, edited, expired or for someone else is ignored.
const ql = require('../src/modules/repair/services/quote-lock');

const at = { shopId: 'S1', vertical: 'bike_wash' };

test('a token returns the distance it was signed with', () => {
  const t = ql.sign({ ...at, distanceKm: 2.345 });
  expect(ql.verify(t, at)).toBe(2.345);
});

test('expired, another provider, another service, or edited: ignored', () => {
  const t = ql.sign({ ...at, distanceKm: 2, now: Date.now() - ql.TTL_MS - 1000 });
  expect(ql.verify(t, at)).toBeNull();
  const ok = ql.sign({ ...at, distanceKm: 2 });
  expect(ql.verify(ok, { shopId: 'S2', vertical: 'bike_wash' })).toBeNull();
  expect(ql.verify(ok, { workerId: 'S1', vertical: 'bike_wash' })).toBeNull();
  expect(ql.verify(ok, { ...at, vertical: 'car_wash' })).toBeNull();
  const [body, mac] = ok.split('.');
  const forged = Buffer.from(JSON.stringify({ p: 's:S1', v: 'bike_wash', d: 0, e: Date.now() + 60000 })).toString('base64url');
  expect(ql.verify(`${forged}.${mac}`, at)).toBeNull();
  expect(ql.verify(`${body}.x${mac.slice(1)}`, at)).toBeNull();
  expect(ql.verify('garbage', at)).toBeNull();
  expect(ql.verify(null, at)).toBeNull();
});

test('no provider or no distance: no token', () => {
  expect(ql.sign({ vertical: 'x', distanceKm: 1 })).toBeNull();
  expect(ql.sign({ ...at, distanceKm: null })).toBeNull();
});
