// Pros on the customer's map: an anonymous key steady for the day, a spot blurred to within ~200 m, never the id.
const { publicPosition } = require('../src/modules/worker/controllers/duty.controller');

const metres = (a, b) => {
  const r = 6371000; const rad = (d) => (d * Math.PI) / 180;
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2)); const y = rad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * r;
};

test('blurred, anonymous and steady', () => {
  const real = { id: '64b7f0c2a1b2c3d4e5f60718', lat: 17.38512, lng: 78.48673, distanceKm: 1.234 };
  const out = publicPosition(real);
  expect(out).not.toHaveProperty('id');
  expect(JSON.stringify(out)).not.toContain(real.id);
  expect(out.key).toBe(publicPosition(real).key);
  expect(publicPosition({ ...real, id: '64b7f0c2a1b2c3d4e5f60719' }).key).not.toBe(out.key);
  const off = metres(real, out);
  expect(off).toBeGreaterThan(0);
  expect(off).toBeLessThan(260);
  expect(out.distanceKm).toBe(1.2);
});
