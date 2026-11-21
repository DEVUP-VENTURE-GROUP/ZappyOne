// Money, end to end: the journey by distance, the repair bill, 2% commission and the ₹5 service charge by default, surge caps and split, settlement for cash and online, and that every rupee a customer pays is the pro's, ZappyOne's or tax, to the paisa.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
let pricing; let cfgSvc; let pc; let settlement; let wallet; let Worker; let Shop; let RepairConfig;
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startMongo();
  pricing = require('../src/modules/repair/services/pricing.service');
  cfgSvc = require('../src/modules/pricing/services/config.service');
  pc = require('../src/modules/shop/partner-commission');
  settlement = require('../src/modules/repair/services/settlement.service');
  wallet = require('../src/modules/wallet/wallet.service');
  Worker = require('../src/modules/worker/worker.model');
  Shop = require('../src/modules/shop/shop.model');
  ({ RepairConfig } = require('../src/modules/repair/models/config.model'));
  await require('../src/modules/payment/transaction.model').init();
});
afterAll(stopMongo);

describe('defaults: 2% commission from the pro, ₹5 service charge from the customer', () => {
  test('partner commission defaults to 2% for every kind of partner', async () => {
    const rates = await cfgSvc.partnerCommissionSettings();
    expect([rates.shop, rates.agency, rates.company, rates.individual]).toEqual([2, 2, 2, 2]);
  });
  test('a service with no config yet charges ₹5 and 2%', async () => {
    const lines = await require('../src/modules/admin-portal/fees.service').list();
    const unset = lines.filter((l) => !l.configured);
    expect(unset.length).toBeGreaterThan(0);
    expect(unset.every((l) => l.platformFeePaise === 500 && l.commissionPct === 2)).toBe(true);
  });
  test('a new repair, pet or errand config starts at ₹5 and 2%', () => {
    const { PetPricingRule } = require('../src/modules/pet/models/config.model');
    const { HelpingConfig } = require('../src/modules/helping/models/config.model');
    for (const doc of [new RepairConfig({ vertical: 'x' }), new PetPricingRule({ categoryCode: 'x' }), new HelpingConfig({ serviceType: 'shopping' })]) {
      expect([doc.platformFeePaise, doc.commissionPct]).toEqual([500, 2]);
    }
  });
});

describe('the journey to the customer', () => {
  // Defaults: road = straight × 1.3, first 0.5 road km free, ₹8 a km (₹9 in traffic hours), capped at ₹150.
  const offPeak = new Date('2026-11-21T08:30:00Z'); // 14:00 IST
  const rush = new Date('2026-11-21T04:00:00Z'); // 09:30 IST
  test.each([
    [0, 0], [0.3, 0], [0.5 / 1.3, 0], [1, Math.round((1.3 - 0.5) * 800)], [2, Math.round((2.6 - 0.5) * 800)],
    [5, Math.round((6.5 - 0.5) * 800)], [14.9, 15000], [100, 15000],
  ])('%s km straight costs %s paise off-peak', async (km, paise) => {
    expect((await pricing.journeyFee(km, offPeak)).paise).toBe(paise);
  });
  test('rush hour adds ₹1 a km', async () => {
    const r = await pricing.journeyFee(3, rush);
    expect(r).toMatchObject({ traffic: true, paise: Math.round((3.9 - 0.5) * 900) });
  });
  test.each([[null], [NaN], [Infinity]])('an unknown distance (%s) charges no journey, never NaN', async (km) => {
    expect(await pricing.journeyFee(km, offPeak)).toBeNull();
  });
});

describe('the repair bill', () => {
  beforeAll(async () => {
    await RepairConfig.create({ vertical: 'mobile', platformFeePaise: 500, commissionPct: 2, taxPct: 18, minJobPaise: 30000 });
    pricing.invalidateConfigCache();
  });
  const bill = (args) => pricing.buildPriceSnapshot({ vertical: 'mobile', repairCode: null, providerPrice: { totalPaise: 200000 }, at: new Date('2026-11-21T08:30:00Z'), ...args });

  test('workshop job: price + ₹5, 18% tax on both, 2% commission on the price only', async () => {
    const s = await bill({ serviceMode: 'workshop' });
    expect(s).toMatchObject({ travelPaise: 0, subtotalPaise: 200000, platformFeePaise: 500, taxPaise: Math.round(200500 * 0.18), commissionPaise: 4000 });
    expect(s.totalPaise).toBe(200500 + Math.round(200500 * 0.18));
  });
  test('doorstep 2 km: the journey is added, taxed, and never commissioned', async () => {
    const s = await bill({ serviceMode: 'doorstep', distanceKm: 2 });
    const journey = Math.round((2.6 - 0.5) * 800);
    expect(s.travelPaise).toBe(journey);
    expect(s.subtotalPaise).toBe(200000 + journey);
    expect(s.commissionPaise).toBe(4000);
    expect(s.totalPaise).toBe(s.subtotalPaise + 500 + s.taxPaise);
  });
  test('a small job is topped up to the minimum, and the top-up is not commissioned', async () => {
    const s = await bill({ serviceMode: 'workshop', providerPrice: { totalPaise: 20000 } });
    expect(s.smallJobPaise).toBe(10000);
    expect(s.commissionPaise).toBe(400);
  });
  test('the second item in a group pays no second journey or service charge', async () => {
    const s = await bill({ serviceMode: 'doorstep', distanceKm: 3, skipJourney: true, skipPlatformFee: true });
    expect([s.travelPaise, s.platformFeePaise]).toEqual([0, 0]);
  });
  test.each([[1], [99], [12345], [999999]])('a price of %s paise gives whole paise everywhere', async (p) => {
    const s = await bill({ serviceMode: 'doorstep', distanceKm: 1.37, providerPrice: { totalPaise: p } });
    for (const k of ['travelPaise', 'subtotalPaise', 'taxPaise', 'totalPaise', 'commissionPaise']) expect(Number.isInteger(s[k])).toBe(true);
    expect(s.totalPaise).toBeGreaterThanOrEqual(0);
  });
  test('a discount (worked out on the server) can never take the bill below zero', async () => {
    const s = await bill({ serviceMode: 'workshop', discountPaise: 10_000_000 });
    expect(s.totalPaise).toBe(0);
  });
});

describe('every rupee accounted for', () => {
  const snap = (over = {}) => ({ subtotalPaise: 203360, platformFeePaise: 500, taxPaise: 36695, commissionPaise: 4000, totalPaise: 240555, ...over });
  test.each([
    ['a normal job', snap()],
    ['no tax', snap({ taxPaise: 0, totalPaise: 203860 })],
    ['no service charge (a member)', snap({ platformFeePaise: 0, taxPaise: 0, totalPaise: 203360 })],
    ['commission bigger than the bill (never pays the pro a minus)', snap({ commissionPaise: 999999 })],
  ])('%s: pro + ZappyOne = what the customer paid', (_name, priceSnapshot) => {
    const s = settlement.splitFor({ _id: oid(), priceSnapshot });
    expect(s.providerPaise + s.platformPaise).toBe(priceSnapshot.totalPaise);
    expect(s.providerPaise).toBeGreaterThanOrEqual(0);
  });
  test('the pro keeps the job price less 2%, plus the journey; ZappyOne keeps 2%, the service charge and the tax', () => {
    const s = settlement.splitFor({ _id: oid(), priceSnapshot: snap() });
    expect(s.platformPaise).toBe(4000 + 500 + 36695);
    expect(s.providerPaise).toBe(203360 - 4000);
  });
});

describe('the pro\'s commission rate', () => {
  test('2% of the job price by default, for a shop and a solo pro', async () => {
    const shop = await Shop.create({ businessName: 'Rate Shop', ownerName: 'O', phone: '9200000001', partnerType: 'shop' });
    const w = await Worker.create({ name: 'Rate Pro', phone: '9200000002' });
    expect(await pc.commissionOn({ shopId: shop._id }, 100000)).toBe(2000);
    expect(await pc.commissionOn({ workerId: w._id }, 100000)).toBe(2000);
  });
  test('a partner\'s own rate wins while it lasts', async () => {
    const w = await Worker.create({ name: 'Deal Pro', phone: '9200000003', commissionOverride: { pct: 1, until: new Date(Date.now() + 86400e3) } });
    expect(await pc.commissionOn({ workerId: w._id }, 100000)).toBe(1000);
    await Worker.updateOne({ _id: w._id }, { $set: { 'commissionOverride.until': new Date(Date.now() - 1000) } });
    expect(await pc.commissionOn({ workerId: w._id }, 100000)).toBe(2000);
  });
  test('ZappyOne staff pay none', async () => {
    const w = await Worker.create({ name: 'Staff', phone: '9200000004', employment: { type: 'staff' } });
    expect(await pc.rateOf({ kind: 'worker', id: w._id })).toBeNull();
  });
  test('no job holder: the line fallback applies', async () => {
    expect(await pc.commissionOn({}, 50000, 2)).toBe(1000);
  });
});

describe('surge', () => {
  const surge = require('../src/modules/jobs/surge');
  const s = { ...require('../src/modules/pricing/services/config.service').SURGE_DEFAULTS };
  const lines = (base, f) => surge.linesFor(base, { busy: 1, ...f }, s);
  test.each([
    ['busy ×1.2 on ₹500', 50000, { busy: 1.2 }, 10000],
    ['busy ×1.3 on ₹2,000 stops at the ₹150 ceiling', 200000, { busy: 1.3 }, 15000],
    ['a tiny surge under ₹1 is dropped', 300, { busy: 1.2 }, 0],
    ['rain and night on ₹40 never exceed the price itself', 4000, { rainPaise: 3000, nightPaise: 2000 }, 4000],
    ['nothing going on', 50000, {}, 0],
  ])('%s', (_name, base, f, total) => {
    const r = lines(base, f);
    expect(r.total).toBe(total);
    expect(r.total).toBeLessThanOrEqual(Math.max(base, 0) || r.total);
    expect(r.lines.every((l) => Number.isInteger(l.paise))).toBe(true);
  });
});

describe('settlement into wallets', () => {
  const job = (w, paymentMethod, over = {}) => ({
    _id: oid(), workerId: w._id, reference: `M${Math.random().toString(36).slice(2, 7)}`, paymentMethod,
    priceSnapshot: { subtotalPaise: 100000, platformFeePaise: 500, taxPaise: 0, commissionPaise: 2000, totalPaise: 100500, commissionBasePaise: 100000, ...over },
  });
  const bal = async (w) => (await wallet.getBalance({ kind: 'worker', id: w._id })).balancePaise;
  test('online: the pro\'s share lands in their wallet once, however often settlement runs', async () => {
    const w = await Worker.create({ name: 'Online Pro', phone: '9200000011' });
    const b = job(w, 'online');
    await Promise.all([1, 2, 3].map(() => settlement.settleBooking(b)));
    expect(await bal(w)).toBe(100500 - 2500);
  });
  test('cash: the pro holds the money, so ZappyOne\'s part (commission + ₹5) becomes dues, once', async () => {
    const w = await Worker.create({ name: 'Cash Pro', phone: '9200000012' });
    const b = job(w, 'cash');
    await settlement.settleBooking(b);
    await settlement.settleBooking(b);
    expect(await bal(w)).toBe(-2500);
  });
});
