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

test('an iPhone job offer carries the JOB_OFFER category, so Accept and Decline show on it; other alerts do not', () => {
  expect(JSON.parse(apns.buildRequest({ title: 'New job', body: 'Bike wash', data: { kind: 'repair', id: 'x' }, offer: true }).body).aps.category).toBe('JOB_OFFER');
  expect(JSON.parse(apns.buildRequest({ title: 'Confirm', body: 'b', loud: true }).body).aps.category).toBeUndefined();
});

test('a push with a picture asks iPhone to fetch it (mutable-content) and carries its address; one without does not', () => {
  const withPic = JSON.parse(apns.buildRequest({ title: 'Job done', body: 'See the photo', imageUrl: 'https://cdn.zappyone.com/done.jpg' }).body);
  expect(withPic.aps['mutable-content']).toBe(1);
  expect(withPic.body.imageUrl).toBe('https://cdn.zappyone.com/done.jpg');
  expect(JSON.parse(apns.buildRequest({ title: 't', body: 'b' }).body).aps['mutable-content']).toBeUndefined();
});
