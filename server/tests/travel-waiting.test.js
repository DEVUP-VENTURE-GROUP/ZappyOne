// The pro's journey and the wait at the door (Economics → Travel & waiting), read from settings, never fixed numbers.
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let pricing; let lifecycle; let cfg;
beforeAll(async () => {
  await startMongo();
  pricing = require('../src/modules/repair/services/pricing.service');
  lifecycle = require('../src/modules/repair/services/booking/lifecycle');
  cfg = require('../src/modules/pricing/services/config.service');
});
afterAll(stopMongo);

const ist = (h, m = 0) => new Date(Date.UTC(2026, 10, 14, h, m) - 330 * 60000);

test('journey: road distance, free distance, the traffic rate in traffic hours, and the cap', async () => {
  const t = await cfg.travelSettings();
  const calm = await pricing.journeyFee(5, ist(13));
  expect(calm.roadKm).toBeCloseTo(5 * t.roadFactor, 1);
  expect(calm.traffic).toBe(false);
  expect(calm.paise).toBe(Math.round((calm.roadKm - t.freeKm) * t.perKmPaise));
  const busy = await pricing.journeyFee(5, ist(t.trafficHours[0].startHour));
  expect(busy.traffic).toBe(true);
  expect(busy.paise).toBe(Math.round((busy.roadKm - t.freeKm) * (t.perKmPaise + t.trafficExtraPerKmPaise)));
  expect((await pricing.journeyFee(200, ist(13))).paise).toBe(t.maxPaise);
  expect((await pricing.journeyFee(0.3, ist(13))).paise).toBe(0);
});

const booking = (minutesWaited, extra = {}) => {
  const arrived = new Date(Date.now() - 60 * 60000);
  return {
    vertical: 'bike_wash', serviceMode: 'doorstep', paymentStatus: 'unpaid',
    statusHistory: [{ status: 'ON_THE_WAY', at: new Date(arrived - 600000) }, { status: 'ARRIVED', at: arrived }],
    otpVerified: { startAt: new Date(arrived.getTime() + minutesWaited * 60000) },
    priceSnapshot: { totalPaise: 20900, taxPaise: 0, waitingPaise: 0 },
    ...extra,
  };
};

test('waiting: free minutes first, measured to the customer code, capped, all on the bill', async () => {
  const t = await cfg.travelSettings();
  const short = booking(t.waitFreeMin - 1);
  await lifecycle.freezeWaiting(short);
  expect(short.priceSnapshot.waitingPaise).toBe(0);

  const late = booking(t.waitFreeMin + 15);
  await lifecycle.freezeWaiting(late);
  expect(late.priceSnapshot.waitingMin).toBe(t.waitFreeMin + 15);
  expect(late.priceSnapshot.waitingPaise).toBe(Math.min(15 * t.waitPerMinPaise, t.waitMaxPaise));
  expect(late.priceSnapshot.totalPaise).toBe(20900 + late.priceSnapshot.waitingPaise + late.priceSnapshot.taxPaise);

  const veryLate = booking(t.waitFreeMin + 500);
  await lifecycle.freezeWaiting(veryLate);
  expect(veryLate.priceSnapshot.waitingPaise).toBe(t.waitMaxPaise);
});

test('waiting is never added to a bill already paid online, nor to a visit to the shop', async () => {
  const t = await cfg.travelSettings();
  const paid = booking(t.waitFreeMin + 15, { paymentStatus: 'paid' });
  await lifecycle.freezeWaiting(paid);
  expect(paid.priceSnapshot.waitingPaise).toBe(0);
  expect(paid.priceSnapshot.totalPaise).toBe(20900);
  const shop = booking(t.waitFreeMin + 15, { serviceMode: 'workshop' });
  await lifecycle.freezeWaiting(shop);
  expect(shop.priceSnapshot.waitingPaise).toBe(0);
});
