// Partner monthly plans end to end: a verified partner sets a plan, the price band decides live or review, a customer near them subscribes, visits are booked with a start code, pauses become makeup visits, the first finished visit of a month books the partner's dues, missed visits are made up.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
const LAT = 17.44; const LNG = 78.39;
let svc; let shop; let models; const userId = new mongoose.Types.ObjectId();
const owner = () => ({ kind: 'shop', id: String(shop._id) });
const addr = { text: 'Flat 4B, Kondapur, Hyderabad', lat: LAT, lng: LNG };

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { ProviderPricing } = require('../src/modules/repair/models/pricing.model');
  const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
  svc = require('../src/modules/service-plan/plan.service');
  models = require('../src/modules/service-plan/plan.model');
  shop = await Shop.create({ businessName: 'Sparkle Helpers', ownerName: 'Owner', phone: '9000000201', isActive: true, partnerType: 'agency', kyc: { status: 'approved' }, address: { location: { type: 'Point', coordinates: [LNG, LAT] } }, services: ['daily_cleaning'] });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'approved' });
  await ProviderServiceArea.create({ shopId: shop._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [LNG, LAT] }, radiusKm: 10, serviceModes: ['doorstep'] });
  await ProviderCapability.create({ shopId: shop._id, vertical: 'daily_cleaning', repairCode: 'daicle_full_daily', isActive: true });
  await ProviderPricing.create({ shopId: shop._id, vertical: 'daily_cleaning', repairCode: 'daicle_full_daily', brandCode: 'daicle_2bhk', totalPaise: 44900, approvalStatus: 'approved' });
});
afterAll(stopMongo);

const PLAN = { vertical: 'daily_cleaning', name: 'Daily clean, 2 BHK', type: 'monthly', items: [{ repairCode: 'daicle_full_daily', brandCode: 'daicle_2bhk' }], visitsPerMonth: 26, weekdays: [1, 2, 3, 4, 5, 6], pricePaise: 399900, durations: [{ months: 3, discountPct: 8 }, { months: 5, discountPct: 12 }], pauseDaysPerMonth: 4 };

test('a plan inside the price band goes live at once; one far below it waits for review', async () => {
  const cheap = await svc.savePlan(owner(), { ...PLAN, name: 'Too cheap', pricePaise: 99900 });
  expect((await svc.submitPlan(owner(), cheap._id)).status).toBe('pending');
  const plan = await svc.savePlan(owner(), PLAN);
  expect(plan.referencePaise).toBe(44900 * 26);
  expect(plan.durations.map((d) => d.months)).toEqual([1, 3, 5]);
  expect((await svc.submitPlan(owner(), plan._id)).status).toBe('live');
  expect((await svc.reviewPlan(cheap._id, false, 'Below cost')).status).toBe('rejected');
  await expect(svc.savePlan({ kind: 'shop', id: String(new mongoose.Types.ObjectId()) }, PLAN)).rejects.toMatchObject({ status: 403 });
});

test('customers near the partner see the plan, subscribe, and get every visit booked with a start code', async () => {
  const [p] = await svc.plansNear({ vertical: 'daily_cleaning', lat: LAT, lng: LNG });
  expect(p).toMatchObject({ name: 'Daily clean, 2 BHK', provider: { name: 'Sparkle Helpers' }, perVisitPaise: Math.round(399900 / 26) });
  expect(await svc.plansNear({ vertical: 'daily_cleaning', lat: 12.97, lng: 77.59 })).toEqual([]);
  const q = await svc.quote(p._id, 3);
  expect(q).toMatchObject({ monthlyPaise: Math.round(399900 * 0.92), platformFeePaise: 4900, totalPaise: (Math.round(399900 * 0.92) + 4900) * 3 });

  const startDay = svc.addDays(svc.istDay(), 2);
  const r = await svc.subscribe(String(userId), { planId: p._id, months: 3, startDay, timeSlot: '08:00', address: addr, idempotencyKey: 'sub-test-0001' });
  expect(r.replay).toBe(false);
  expect(r.visits).toBeGreaterThanOrEqual(70);
  expect((await svc.subscribe(String(userId), { planId: p._id, months: 3, startDay, timeSlot: '08:00', address: addr, idempotencyKey: 'sub-test-0001' })).replay).toBe(true);
  const visits = await models.PlanVisit.find({ subscriptionId: r.subscription._id }).lean();
  expect(visits.every((v) => /^\d{4}$/.test(v.startCode))).toBe(true);
  expect(visits.some((v) => new Date(`${v.day}T12:00:00+05:30`).getUTCDay() === 0)).toBe(false);
  await expect(svc.subscribe(String(userId), { planId: p._id, months: 1, startDay, timeSlot: '08:00', address: { ...addr, lat: 12.97, lng: 77.59 }, idempotencyKey: 'sub-test-0002' })).rejects.toMatchObject({ code: 'NOT_COVERED' });
});

test('the home rail finds plans near the customer across every service, and none far away', async () => {
  const near = await svc.plansNearAny({ lat: LAT, lng: LNG });
  expect(near.map((p) => p.name)).toContain('Daily clean, 2 BHK');
  expect(await svc.plansNearAny({ lat: 12.97, lng: 77.59 })).toEqual([]);
});

test('a paused day becomes a makeup visit; pause days per month are limited', async () => {
  const sub = await models.PlanSubscription.findOne({ userId }).lean();
  const days = (await models.PlanVisit.find({ subscriptionId: sub._id, status: 'scheduled' }).sort({ day: 1 }).limit(6).lean()).map((v) => v.day);
  const before = await models.PlanVisit.countDocuments({ subscriptionId: sub._id });
  for (const d of days.slice(0, 4)) await svc.pauseDay(String(userId), sub._id, d);
  await expect(svc.pauseDay(String(userId), sub._id, days[4])).rejects.toMatchObject({ code: 'NO_PAUSES_LEFT' });
  expect(await models.PlanVisit.countDocuments({ subscriptionId: sub._id })).toBe(before + 4);
  expect(await models.PlanVisit.countDocuments({ subscriptionId: sub._id, makeupFor: { $ne: null } })).toBe(4);
});

test('a visit starts only with the customer code, finishes with a photo, and the first one of the month books the dues once', async () => {
  const Transaction = require('../src/modules/payment/transaction.model');
  const sub = await models.PlanSubscription.findOne({ userId }).lean();
  const v = await models.PlanVisit.findOne({ subscriptionId: sub._id, status: 'scheduled' }).sort({ day: 1 });
  v.at = new Date(Date.now() - 5 * 60000); await v.save();
  await expect(svc.startVisit(owner(), v._id, '0000' === v.startCode ? '1111' : '0000')).rejects.toMatchObject({ code: 'BAD_CODE' });
  await svc.startVisit(owner(), v._id, v.startCode);
  await expect(svc.completeVisit(owner(), v._id, { photoKeys: [] })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
  await svc.completeVisit(owner(), v._id, { photoKeys: ['completion-photos/plan/after.jpg'] });
  const due = await Transaction.find({ 'metadata.source': 'plan', 'metadata.shopId': String(shop._id) }).lean();
  expect(due).toHaveLength(1);
  expect(due[0].amountPaise).toBe(-((sub.platformFeePaise) + Math.round(sub.monthlyPaise * sub.commissionPct / 100)));

  const v2 = await models.PlanVisit.findOne({ subscriptionId: sub._id, status: 'scheduled' }).sort({ day: 1 });
  v2.at = new Date(Date.now() - 5 * 60000); await v2.save();
  await svc.startVisit(owner(), v2._id, v2.startCode);
  await svc.completeVisit(owner(), v2._id, { photoKeys: ['completion-photos/plan/after2.jpg'] });
  expect(await Transaction.countDocuments({ 'metadata.source': 'plan', 'metadata.shopId': String(shop._id) })).toBe(1);
  expect((await svc.rateVisit(String(userId), v._id, { stars: 5 })).rating.stars).toBe(5);
  await expect(svc.rateVisit(String(userId), v._id, { stars: 1 })).rejects.toMatchObject({ code: 'NOT_RATEABLE' });
});

test('the technician a shop assigns sees, starts and finishes that visit; others on the team cannot', async () => {
  const Worker = require('../src/modules/worker/worker.model');
  const tech = await Worker.create({ name: 'Ravi', phone: '9000000202', shopId: shop._id });
  const other = await Worker.create({ name: 'Sunil', phone: '9000000203', shopId: shop._id });
  const sub = await models.PlanSubscription.findOne({ userId }).lean();
  const v = await models.PlanVisit.findOne({ subscriptionId: sub._id, status: 'scheduled' }).sort({ day: -1 });
  v.at = new Date(Date.now() + 30 * 60000); await v.save();
  await expect(svc.assignWorker({ kind: 'worker', id: String(tech._id) }, v._id, String(tech._id))).rejects.toMatchObject({ code: 'NOT_SHOP' });
  await svc.assignWorker(owner(), v._id, String(tech._id));
  const mine = await svc.ownerVisits({ kind: 'worker', id: String(tech._id) }, v.day, 1);
  expect(mine.map((r) => String(r._id))).toEqual([String(v._id)]);
  expect(mine[0].startCode).toBeUndefined();
  expect(await svc.ownerVisits({ kind: 'worker', id: String(other._id) }, v.day, 1)).toEqual([]);
  await expect(svc.startVisit({ kind: 'worker', id: String(other._id) }, v._id, v.startCode)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await svc.startVisit({ kind: 'worker', id: String(tech._id) }, v._id, v.startCode);
  expect((await svc.completeVisit({ kind: 'worker', id: String(tech._id) }, v._id, { photoKeys: ['completion-photos/plan/tech.jpg'] })).status).toBe('done');
});

test('a visit nobody started is missed and made up; cancelling keeps paid days and stops the rest', async () => {
  const sub = await models.PlanSubscription.findOne({ userId }).lean();
  const v = await models.PlanVisit.findOne({ subscriptionId: sub._id, status: 'scheduled' }).sort({ day: 1 });
  v.at = new Date(Date.now() - 7 * 3600000); await v.save();
  const before = await models.PlanVisit.countDocuments({ subscriptionId: sub._id });
  expect((await svc.sweep()).missed).toBe(1);
  expect(await models.PlanVisit.countDocuments({ subscriptionId: sub._id })).toBe(before + 1);
  expect((await models.PlanVisit.findById(v._id).lean()).status).toBe('missed');

  const out = await svc.cancel(String(userId), sub._id, 'Moving house');
  expect(out.status).toBe('cancelled');
  const nextMonth = sub.billing[1].fromDay;
  expect(await models.PlanVisit.countDocuments({ subscriptionId: sub._id, status: 'scheduled', day: { $gte: nextMonth } })).toBe(0);
  expect(await models.PlanVisit.countDocuments({ subscriptionId: sub._id, status: 'scheduled', day: { $lt: nextMonth } })).toBeGreaterThan(0);
});

test('a partner builds plans only from jobs they have approved prices for', async () => {
  const out = await svc.sellable(owner());
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ vertical: 'daily_cleaning', name: 'Sweeping, mopping & dusting' });
  expect(out[0].items.map((i) => i.repairCode)).toEqual(['daicle_full_daily']);
  expect(out[0].items[0].options[0]).toMatchObject({ typeName: '2 BHK', totalPaise: 44900 });
});
