// ServicePro alerts a pro must notice with the app closed ring with the ZappyOne sound; ordinary ones keep the default sound.
const { isOffer, isLoud } = require('../src/jobs/notifications.worker');
const apns = require('../src/modules/notification/apns');

test('offers and urgent pro alerts are loud; only offers ring full-screen', () => {
  for (const key of ['provider.time_check', 'provider.time_check_last', 'provider.leave_now', 'provider.job_cancelled', 'provider.pay_claim']) {
    expect(isLoud({ key })).toBe(true);
    expect(isOffer({ key })).toBe(false);
  }
  expect(isLoud({ channel: 'offers' })).toBe(true);
  expect(isLoud({ key: 'provider.weekly_summary' })).toBe(false);
});

test('an urgent iPhone alert rings and breaks through Focus but does not expire like an offer', () => {
  const req = apns.buildRequest({ title: 'Confirm your 3:00 pm job', body: 'Tap to confirm', data: { key: 'provider.time_check' }, loud: true });
  const payload = JSON.parse(req.body);
  expect(payload.aps).toMatchObject({ sound: 'zappy_ring.wav', 'interruption-level': 'time-sensitive' });
  expect(Number(req.headers['apns-expiration']) - Date.now() / 1000).toBeGreaterThan(3600);
  expect(JSON.parse(apns.buildRequest({ title: 't', body: 'b' }).body).aps.sound).toBe('default');
});
