// Admin sees each shop's and independent pro's store as they set it up: services, whether customers see them, every job and its price per option, inspection fee; only admin can open it and it never leaks raw storage keys.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(180000);
const V = 'daily_cleaning';
let app; let admin; let Shop; let Worker; let ProviderEnrolment; let menu; let tok;
let n = 0;
const base = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
const asAdmin = (r) => r.set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
const store = (kind, id) => asAdmin(request(app).get(`${base}/${kind}s/${id}/store`));

beforeAll(async () => {
  await startMongo();
  await require('../src/modules/onboarding/run-catalog-az').seedCatalogAZ();
  app = require('../src/app')();
  admin = await adminToken();
  Shop = require('../src/modules/shop/shop.model');
  Worker = require('../src/modules/worker/worker.model');
  ({ ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model'));
  menu = require('../src/modules/repair/services/provider-menu.service');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
});
afterAll(stopMongo);

async function cleaningShop(extra = {}) {
  n += 1;
  const s = await Shop.create({ businessName: `Sparkle ${n}`, ownerName: 'Owner', phone: `91${String(n).padStart(8, '0')}`, isActive: true, kyc: { status: 'approved' }, services: [V], ...extra });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: V, status: 'approved' });
  await menu.saveItem({ shopId: s._id, workerId: null }, V, { repairCode: 'daicle_full_daily', includes: ['Sweep', 'Mop'], minutes: 80, photoKey: 'menu/daily.jpg', prices: { daicle_1bhk: 39900, daicle_2bhk: 49900 } }, { role: 'shop', id: String(s._id) });
  return s;
}

describe('a menu service', () => {
  test('shows each job with the shop\'s price per option, what is included, and that customers see it', async () => {
    const s = await cleaningShop();
    const r = await store('shop', s._id);
    expect(r.status).toBe(200);
    expect(r.body.provider).toMatchObject({ name: s.businessName, kycStatus: 'approved', openForBookings: true, isBlocked: false });
    const svc = r.body.services.find((x) => x.lineCode === V);
    expect(svc).toMatchObject({ mode: 'menu', vertical: V, enrolment: 'approved', visible: true, inspectionFeePaise: 0 });
    const job = svc.items.find((i) => i.repairCode === 'daicle_full_daily');
    expect(job).toMatchObject({ offered: true, includes: ['Sweep', 'Mop'], minutes: 80 });
    expect(job.prices).toMatchObject({ daicle_1bhk: 39900, daicle_2bhk: 49900 });
    expect(svc.types.map((t) => t.code)).toEqual(expect.arrayContaining(['daicle_1bhk', 'daicle_2bhk']));
  });
  test('never sends raw storage keys, only signed photo links', async () => {
    const s = await cleaningShop();
    const r = await store('shop', s._id);
    expect(JSON.stringify(r.body)).not.toMatch(/"photoKeys?"/);
  });
  test.each([
    ['blocked', { isBlocked: true }],
    ['closed for bookings', { isActive: false }],
    ['not yet verified', { kyc: { status: 'pending_review' } }],
  ])('a %s shop still shows its setup, marked hidden from customers', async (_name, extra) => {
    const s = await cleaningShop(extra);
    const svc = (await store('shop', s._id)).body.services.find((x) => x.lineCode === V);
    expect(svc.visible).toBe(false);
    expect(svc.items.some((i) => i.offered)).toBe(true);
  });
  test('a service still under review shows hidden', async () => {
    const s = await cleaningShop();
    await ProviderEnrolment.updateOne({ shopId: s._id, lineCode: V }, { status: 'pending_review' });
    const svc = (await store('shop', s._id)).body.services.find((x) => x.lineCode === V);
    expect(svc).toMatchObject({ enrolment: 'pending_review', visible: false });
  });
  test('a shop with no services is an empty list, not an error', async () => {
    n += 1;
    const s = await Shop.create({ businessName: 'Empty', ownerName: 'O', phone: `92${String(n).padStart(8, '0')}` });
    const r = await store('shop', s._id);
    expect(r.status).toBe(200);
    expect(r.body.services).toEqual([]);
  });
});

describe('a model-by-model service', () => {
  test('lists every price with job, brand and model names, and the inspection fee', async () => {
    const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
    await ServiceLine.collection.updateOne({ code: 'mobile_repair' }, { $setOnInsert: { code: 'mobile_repair', name: 'Mobile Phones', domainCode: 'electronics', repairVertical: 'mobile', status: 'live' } }, { upsert: true });
    const { Repair } = require('../src/modules/repair/models/repair.model');
    const Brand = require('../src/modules/service/brand.model');
    const DeviceModel = require('../src/modules/service/device-model.model');
    const { ProviderPricing, ProviderInspectionFee } = require('../src/modules/repair/models/pricing.model');
    await Repair.collection.insertOne({ vertical: 'mobile', code: 'st_screen', name: 'Screen replacement', pricingMode: 'range', isActive: true, isArchived: false, owner: null });
    await Brand.collection.insertOne({ category: 'mobile', code: 'st_samsung', name: 'Samsung', isActive: true });
    await DeviceModel.collection.insertOne({ vertical: 'mobile', brandCode: 'st_samsung', code: 'st_s23', name: 'Galaxy S23' });
    n += 1;
    const w = await Worker.create({ name: 'Phone Pro', phone: `93${String(n).padStart(8, '0')}`, kyc: { status: 'approved' } });
    await ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode: 'electronics', lineCode: 'mobile_repair', status: 'approved' });
    await ProviderPricing.collection.insertOne({ workerId: w._id, vertical: 'mobile', repairCode: 'st_screen', brandCode: 'st_samsung', modelCode: 'st_s23', qualityCode: 'original', totalPaise: 1299900, approvalStatus: 'approved', isActive: true, supersededAt: null, updatedAt: new Date() });
    if (ProviderInspectionFee) await ProviderInspectionFee.collection.insertOne({ workerId: w._id, vertical: 'mobile', feePaise: 19900 });
    const r = await store('worker', w._id);
    expect(r.status).toBe(200);
    const svc = r.body.services.find((x) => x.lineCode === 'mobile_repair');
    expect(svc.mode).toBe('models');
    expect(svc.rows).toEqual([expect.objectContaining({ job: 'Screen replacement', brand: 'Samsung', model: 'Galaxy S23', quality: 'original', totalPaise: 1299900 })]);
    if (ProviderInspectionFee) expect(svc.inspectionFeePaise).toBe(19900);
    expect(svc.more).toBe(false);
  });
});

describe('access', () => {
  test.each([['a shop', 'shop'], ['a pro', 'worker'], ['a customer', 'user']])('%s cannot open it', async (_name, role) => {
    const s = await cleaningShop();
    const r = await request(app).get(`${base}/shops/${s._id}/store`).set(tok(s._id, role));
    expect([401, 403, 404]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/49900/);
  });
  test('without a login it is refused', async () => {
    expect([401, 403, 404]).toContain((await request(app).get(`${base}/shops/${new mongoose.Types.ObjectId()}/store`)).status);
  });
  test.each([['malformed', 'nope'], ['unknown', String(new mongoose.Types.ObjectId())]])('a %s id is 404, never a crash', async (_name, id) => {
    expect((await store('shop', id)).status).toBe(404);
    expect((await store('worker', id)).status).toBe(404);
  });
});

describe('admin edits a job, never its prices', () => {
  const JOB = 'daicle_full_daily';
  const edit = (kind, id, code, body) => asAdmin(request(app).patch(`${base}/${kind}s/${id}/store/${V}/items/${code}`)).send(body);
  const livePrices = async (s) => {
    const { ProviderPricing } = require('../src/modules/repair/models/pricing.model');
    return (await ProviderPricing.find({ shopId: s._id, repairCode: JOB, supersededAt: null, isActive: true }).select('_id brandCode totalPaise').sort({ brandCode: 1 }).lean()).map((p) => `${p._id}:${p.brandCode}:${p.totalPaise}`);
  };
  const jobOf = (body, code = JOB) => body.services.find((x) => x.lineCode === V).items.find((i) => i.repairCode === code);
  const customerSees = async (s, code = JOB) => {
    const m = await require('../src/modules/repair/services/storefront.service').storefrontMenu({ kind: 'shop', id: String(s._id), vertical: V });
    return !!m?.items.some((i) => i.repairCode === code);
  };

  test('what is included and how long it takes change; every price stays exactly as the partner set it', async () => {
    const s = await cleaningShop();
    const before = await livePrices(s);
    const r = await edit('shop', s._id, JOB, { includes: ['Sweep', 'Mop', 'Dust fans'], minutes: 90 });
    expect(r.status).toBe(200);
    expect(jobOf(r.body)).toMatchObject({ includes: ['Sweep', 'Mop', 'Dust fans'], minutes: 90, offered: true });
    expect(await livePrices(s)).toEqual(before);
  });
  test('every edit is in the audit log and the partner is told their prices are unchanged', async () => {
    const s = await cleaningShop();
    await edit('shop', s._id, JOB, { minutes: 70 });
    const AuditLog = require('../src/modules/admin/audit-log.model');
    const log = await AuditLog.findOne({ action: 'admin.store_item_edit', 'target.id': s._id }).lean();
    expect(log.after).toMatchObject({ minutes: 70, repairCode: JOB, vertical: V });
    expect(log.before.minutes).toBe(80);
    const Notification = require('../src/modules/notification/notification.model');
    await new Promise((r) => setTimeout(r, 200));
    const note = await Notification.findOne({ 'recipient.id': s._id }).lean();
    expect(note.body).toMatch(/prices are unchanged/);
  });
  test('hiding takes it off the customer menu; showing brings it back with the same prices', async () => {
    const s = await cleaningShop();
    const before = await livePrices(s);
    expect(await customerSees(s)).toBe(true);
    expect(jobOf((await edit('shop', s._id, JOB, { hidden: true })).body).offered).toBe(false);
    expect(await customerSees(s)).toBe(false);
    expect(jobOf((await edit('shop', s._id, JOB, { hidden: false })).body).offered).toBe(true);
    expect(await customerSees(s)).toBe(true);
    expect(await livePrices(s)).toEqual(before);
  });
  test('a job customers can book keeps at least one photo; a hidden one may have none', async () => {
    const s = await cleaningShop();
    const r = await edit('shop', s._id, JOB, { keepPhotos: [] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PHOTO_REQUIRED');
    expect((await edit('shop', s._id, JOB, { hidden: true, keepPhotos: [] })).status).toBe(200);
    expect((await edit('shop', s._id, JOB, { hidden: false })).body.code).toBe('PHOTO_REQUIRED');
  });
  test('a job with no price cannot be shown', async () => {
    const s = await cleaningShop();
    await menu.removeItem({ shopId: s._id, workerId: null }, V, JOB);
    const r = await edit('shop', s._id, JOB, { hidden: false });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NO_PRICE');
  });
  test('their own job can be renamed; a ZappyOne sample keeps its catalogue name', async () => {
    const s = await cleaningShop();
    const own = await menu.saveItem({ shopId: s._id, workerId: null }, V, { name: 'Balcony wash', includes: ['Wash'], minutes: 40, photoKey: 'menu/own.jpg', prices: { daicle_1bhk: 19900 } }, { role: 'shop', id: String(s._id) });
    const code = own.items.find((i) => i.own).repairCode;
    expect(jobOf((await edit('shop', s._id, code, { name: 'Balcony deep wash' })).body, code).name).toBe('Balcony deep wash');
    const sample = await edit('shop', s._id, JOB, { name: 'Renamed sample' });
    expect(jobOf(sample.body).name).not.toBe('Renamed sample');
  });
  test.each([
    ['a price', { prices: { daicle_1bhk: 100 } }],
    ['nothing at all', {}],
    ['a 3-minute job', { minutes: 3 }],
    ['a photo by link', { keepPhotos: ['https://evil.example/x.jpg'] }],
  ])('sending %s is refused and changes nothing', async (_name, body) => {
    const s = await cleaningShop();
    const before = await livePrices(s);
    expect((await edit('shop', s._id, JOB, body)).status).toBe(400);
    expect(await livePrices(s)).toEqual(before);
  });
  test('another shop\'s own job, an unknown job or an unknown shop is 404', async () => {
    const a = await cleaningShop(); const b = await cleaningShop();
    const own = await menu.saveItem({ shopId: b._id, workerId: null }, V, { name: 'Only mine', includes: ['X1'], minutes: 30, photoKey: 'menu/b.jpg', prices: { daicle_1bhk: 10000 } }, { role: 'shop', id: String(b._id) });
    const code = own.items.find((i) => i.own).repairCode;
    expect((await edit('shop', a._id, code, { minutes: 50 })).status).toBe(404);
    expect((await edit('shop', a._id, 'no_such_job', { minutes: 50 })).status).toBe(404);
    expect((await edit('shop', new mongoose.Types.ObjectId(), JOB, { minutes: 50 })).status).toBe(404);
    expect((await edit('shop', 'nope', JOB, { minutes: 50 })).status).toBe(404);
  });
  test.each([['the shop itself', 'shop'], ['a pro', 'worker'], ['a customer', 'user']])('%s cannot use the admin edit', async (_name, role) => {
    const s = await cleaningShop();
    const r = await request(app).patch(`${base}/shops/${s._id}/store/${V}/items/${JOB}`).set(tok(s._id, role)).send({ hidden: true });
    expect([401, 403, 404]).toContain(r.status);
    expect(await customerSees(s)).toBe(true);
  });
});
