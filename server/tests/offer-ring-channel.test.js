// Job offers ring on ServicePro's loud channel with the ZappyOne ringtone; every other push stays on the normal one.
jest.mock('firebase-admin', () => ({}), { virtual: true });
const { isOffer } = require('../src/jobs/notifications.worker');

test('a job near you, a job waiting and an offer to one pro ring; booking updates do not', () => {
  expect(isOffer({ key: 'provider.job_nearby' })).toBe(true);
  expect(isOffer({ key: 'provider.job_waiting' })).toBe(true);
  expect(isOffer({ channel: 'offers', kind: 'repair' })).toBe(true);
  expect(isOffer({ key: 'booking.confirmed' })).toBe(false);
  expect(isOffer({ key: 'provider.job_cancelled' })).toBe(false);
  expect(isOffer({})).toBe(false);
  expect(isOffer(undefined)).toBe(false);
});
