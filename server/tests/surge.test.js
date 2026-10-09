/**
 * Automatic surge (jobs/surge), end to end:
 *   - off by default; on, it prices busy area / rain / night as separate lines
 *   - capped: busy+peak+weekend never above the ceiling, everything ≤ the price
 *   - a busy zone needs demand AND someone to pull in; it moves in steps
 *   - a booking pays what the customer was shown (lock), or is refused with
 *     SURGE_CHANGED when the quote ran out and the price moved
 *   - settlement: provider share credited, ZappyOne's share booked; cash: owed
 */
jest.mock('../src/modules/maps/google-maps.service', () => ({ getDistanceMatrix: jest.fn(async () => { throw new Error('offline'); }) }));
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let surge; let HelpingTask; let Transaction; let config; let redis;
const adminId = new mongoose.Types.ObjectId();
const AT = { lat: 17.4483, lng: 78.3915 };
const DOOR = { type: 'Point', coordinates: [AT.lng, AT.lat], address: 'Madhapur' };
let n = 0;

// Night window placed away from "now", so the clock never adds a line unasked.
const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
const AWAY = { nightStartHour: (h + 6) % 24, nightEndHour: (h + 7) % 24 };

beforeAll(async () => {
  await startMongo();
  surge = require('../src/modules/jobs/surge');
  ({ HelpingTask } = require('../src/modules/helping/models/task.model'));
  Transaction = require('../src/modules/payment/transaction.model');
  await Transaction.init();
  config = require('../src/modules/pricing/services/config.service');
  ({ redis } = require('../src/config/redis'));
});
afterAll(stopMongo);

const enable = (extra = {}) => config.updateActiveConfig({ surgeAuto: { ...config.SURGE_DEFAULTS, __configured: true, minDemand: 2, ...AWAY, ...extra } }, adminId);
const task = (extra = {}) => {
  n += 1;
  return HelpingTask.create({
    reference: `HT-SG-${n}`, userId: new mongoose.Types.ObjectId(), serviceType: 'pickup', status: 'CONFIRMED',
    pickupLocation: DOOR, destination: DOOR, charge: { serviceChargePaise: 20000, workerEarningPaise: 16000 }, paymentMethod: 'online', ...extra,
  });
};

test('on by itself: a quiet zone at a quiet hour quotes nothing extra, but holds the price', async () => {
  await enable();
  const q = await surge.quote({ kind: 'helping', line: 'shopping_pickup', ...AT, basePaise: 20000 });
  expect(q).toMatchObject({ totalPaise: 0, lines: [] });
  expect(q.quoteId).toBeTruthy();
});

test('lines: busy capped by the ceiling, rain and night flat, all of it never above the price', () => {
  const s = { ...config.SURGE_DEFAULTS, ceilingPaise: 15000, nightStartHour: 22, nightEndHour: 6 };
  const big = surge.linesFor(100000, { busy: 1.3, rainPaise: 3000, nightPaise: 2000 }, s);
  expect(big.lines.map((l) => [l.type, l.label, l.paise])).toEqual([['surge', 'Surge fee', 15000], ['rain', 'Rain fee', 3000], ['night', 'Late-night fee', 2000]]);
  expect(big.total).toBe(20000);
  const small = surge.linesFor(2000, { busy: 1, rainPaise: 3000, nightPaise: 2000 }, s);
  expect(small.total).toBeLessThanOrEqual(2000);
});

test('a zone surges only with demand AND someone nearby to pull in, in small steps', async () => {
  await enable();
  const line = 'shopping_pickup';
  for (let i = 0; i < 6; i += 1) await surge.recordDemand({ line, ...AT, userId: new mongoose.Types.ObjectId() });
  // Nobody approved nearby: raising the price cannot bring anyone.
  await surge.tick();
  let z = (await surge.zones()).zones.find((x) => x.line === line);
  expect(z).toMatchObject({ multiplier: 1, noSupply: true });

  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const shop = await Shop.create({ businessName: 'Near Shop', ownerName: 'O', phone: '9000001111', address: { text: 'x', location: { type: 'Point', coordinates: [AT.lng, AT.lat] } } });
  await ProviderEnrolment.create({ shopId: shop._id, providerKind: 'shop', domainCode: 'helping_services', lineCode: line, status: 'approved' });
  await surge.tick(); await surge.tick();
  z = (await surge.zones()).zones.find((x) => x.line === line);
  expect(z.target).toBeGreaterThan(1);
  expect(z.multiplier).toBe(1.1); // two steps of 0.05, never a jump

  const q = await surge.quote({ kind: 'helping', line, ...AT, basePaise: 20000 });
  expect(q.quoteId).toBeTruthy();
  expect(q.lines.find((l) => l.type === 'surge').paise).toBe(2000);
});

test('hot zones: a worker approved for the line sees the surging zone near them; others see nothing', async () => {
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const me = new mongoose.Types.ObjectId();
  await ProviderEnrolment.create({ workerId: me, providerKind: 'individual', domainCode: 'helping_services', lineCode: 'shopping_pickup', status: 'approved' });
  const hot = await surge.hotZonesFor({ workerId: me, lat: AT.lat + 0.02, lng: AT.lng });
  expect(hot.on).toBe(true);
  expect(hot.sharePct).toBe(60);
  expect(hot.zones[0]).toMatchObject({ line: 'shopping_pickup', multiplier: 1.1 });
  expect(hot.zones[0].km).toBeGreaterThan(1);
  const other = await surge.hotZonesFor({ workerId: new mongoose.Types.ObjectId(), lat: AT.lat, lng: AT.lng });
  expect(other.zones).toHaveLength(0);
});

test('booking pays the locked quote; split 60/40; an expired quote with a moved price is refused first', async () => {
  const q = await surge.quote({ kind: 'helping', line: 'shopping_pickup', ...AT, basePaise: 20000 });
  const t = await task();
  const s = await surge.attach('helping', t, { quoteId: q.quoteId, userId: t.userId });
  expect(s).toMatchObject({ paise: q.totalPaise, providerPaise: Math.round(q.totalPaise * 0.6) });
  expect(s.providerPaise + s.platformPaise).toBe(s.paise);
  // Attached once only.
  expect(await surge.attach('helping', t, { quoteId: q.quoteId, userId: t.userId })).toBeNull();
  // It rides on what is due (helping money service).
  const due = require('../src/modules/helping/services/money.service').amountDue(await HelpingTask.findById(t._id));
  expect(due.feePaise).toBe(20000 + s.paise);

  await expect(surge.precheck({ kind: 'helping', userId: t.userId, quoteId: 'gone-quote-id', body: { serviceType: 'pickup', pickupLocation: DOOR } }))
    .rejects.toMatchObject({ code: 'SURGE_CHANGED' });
});

test('settlement: online — provider credited their share, ZappyOne books its own; once', async () => {
  const workerId = new mongoose.Types.ObjectId();
  const t = await task({ workerId, paymentStatus: 'paid', surge: { paise: 5000, lines: [{ type: 'rain', label: 'Raining', paise: 5000 }], providerPaise: 3000, platformPaise: 2000 } });
  await surge.settleSurge('helping', t._id);
  await surge.settleSurge('helping', t._id);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:provider:helping:${t._id}`, amountPaise: 3000 })).toBe(1);
  expect(await Transaction.countDocuments({ idempotencyKey: `surge:platform:helping:${t._id}`, amountPaise: 2000 })).toBe(1);
});

test('kill switch: everything back to no surge at once', async () => {
  await enable({ killSwitch: true });
  const q = await surge.quote({ kind: 'helping', line: 'shopping_pickup', ...AT, basePaise: 20000 });
  expect(q.totalPaise).toBe(0);
  await enable();
});

test('weather unknown → no rain line', async () => {
  expect(await require('../src/modules/jobs/weather').isRaining(AT.lat, AT.lng)).toBe(false);
  await redis.flushall?.();
});
