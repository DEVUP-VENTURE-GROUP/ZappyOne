// Version 1 opens every doorstep service as data: the A–Z catalog seeds domains, package lines and per-service checks; a new service needs no code, and staff-only services open to partners while own staff is locked.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(180000);
let server;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGO_URI = `${server.getUri()}zappyaz`;
  await mongoose.connect(process.env.MONGO_URI);
});
afterAll(async () => { await mongoose.disconnect(); await server.stop(); });

const { seedCatalogAZ } = require('../src/modules/onboarding/run-catalog-az');
const { AZ_LINES } = require('../src/modules/onboarding/catalog-az.seed');
const { ServiceDomain, ServiceLine, KycRequirementSet } = require('../src/modules/onboarding/onboarding.model');
const { VERTICALS, isValid, loadRegistered } = require('../src/modules/repair/vertical');

test('every domain, line and check lands, and a re-run adds nothing and keeps admin edits', async () => {
  await ServiceDomain.create({ code: 'home_services', name: 'Home Services' });
  const first = await seedCatalogAZ();
  expect(first).toMatchObject({ domains: 7, renamed: 1, lines: AZ_LINES.length });
  expect((await ServiceDomain.findOne({ code: 'home_services' }).lean()).name).toBe('Repairs & Maintenance');

  await ServiceLine.updateOne({ code: 'carpentry' }, { $set: { name: 'Carpentry by experts' } });
  const again = await seedCatalogAZ();
  expect(again).toMatchObject({ domains: 0, requirementSets: 0, lines: 0 });
  expect((await ServiceLine.findOne({ code: 'carpentry' }).lean()).name).toBe('Carpentry by experts');

  const pest = await ServiceLine.findOne({ code: 'pest_control' }).lean();
  expect(pest).toMatchObject({ repairVertical: 'pest_control', customerPath: '/repair/pest-control', status: 'live', typeWord: 'Home size' });
  expect(isValid('pest_control') && isValid('home_tutor')).toBe(true);
});

test('a new service is a real, priced catalog the booking engine reads', async () => {
  const { resolveReferencePrice } = require('../src/modules/repair/services/pricing.service');
  const { listProblems } = require('../src/modules/repair/controllers/catalog.controller');
  const DeviceModel = require('../src/modules/service/device-model.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  expect(await Repair.countDocuments({ vertical: 'roadside_help' })).toBe(3);
  expect((await Repair.findOne({ vertical: 'roadside_help' }).lean()).allowedServiceModes).toEqual(['roadside', 'doorstep']);

  const pest = AZ_LINES.find((l) => l.code === 'pest_control');
  const brandCode = `${'pescon'}_2bhk`;
  expect((await resolveReferencePrice({ vertical: 'pest_control', repairCode: 'pescon_general', brandCode })).recommendedPaise).toBe(pest.packages[0].prices['2bhk'] * 100);

  const model = await DeviceModel.findOne({ brandCode }).lean();
  let body;
  await listProblems({ query: { vertical: 'pest_control', modelCode: model.code } }, { json: (b) => { body = b; } }, (e) => { throw e; });
  expect(body.categories.flatMap((c) => c.problems).map((p) => p.name)).toEqual(expect.arrayContaining(['General pest control', 'Bed bug treatment']));
});

test('licensed and in-home work asks for the right documents', async () => {
  const docs = async (lineCode, providerKind) => (await KycRequirementSet.findOne({ lineCode, providerKind }).lean()).documents.map((d) => d.code);
  expect(await docs('pest_control', 'shop')).toContain('pest_licence');
  expect(await docs('massage_wellness', 'individual')).toEqual(expect.arrayContaining(['therapy_certificate', 'police_verification']));
  expect(await docs('home_tutor', 'individual')).toContain('police_verification');
  const daily = await KycRequirementSet.findOne({ domainCode: 'home_daily_help', lineCode: null, providerKind: 'individual' }).lean();
  expect(daily.documents.map((d) => d.code)).toContain('police_verification');
});

test('the registry picks up lines from the database after a restart', async () => {
  const before = VERTICALS.length;
  await ServiceLine.create({ code: 'kite_repair', name: 'Kite repair', domainCode: 'local_pros', repairVertical: 'kite_repair' });
  await loadRegistered();
  expect(VERTICALS.length).toBe(before + 1);
  expect(isValid('kite_repair')).toBe(true);
  expect(isValid('../etc')).toBe(false);
});

test('staff-only services open to partners while own staff is locked, and close again when it runs', async () => {
  const flags = require('../src/modules/feature-flags/feature-flag.service');
  const { listLines } = require('../src/modules/onboarding/onboarding.service');
  await ServiceLine.create({ code: 'fa_elder_checkin', name: 'Elder daily check-in', domainCode: 'family_assist', status: 'live', staffOnly: true, providerKinds: ['individual'] });
  await seedCatalogAZ();
  expect((await ServiceLine.findOne({ code: 'fa_elder_checkin' }).lean()).providerKinds).toEqual(['individual', 'shop']);
  expect((await listLines({ domainCode: 'family_assist' })).map((l) => l.code)).toContain('fa_elder_checkin');
  await flags.set('own_staff', true, null);
  expect((await listLines({ domainCode: 'family_assist' })).map((l) => l.code)).not.toContain('fa_elder_checkin');
  await flags.set('own_staff', false, null);
});

test('a bad definition is refused before anything is written', async () => {
  const { upsertPackageLine } = require('../src/modules/repair/package-lines.service');
  await expect(upsertPackageLine({ code: 'Bad Code', name: 'x', domainCode: 'local_pros', packages: [] })).rejects.toMatchObject({ code: 'BAD_SERVICE' });
  await expect(upsertPackageLine({ code: 'electrician', name: 'x', domainCode: 'home_services', packages: [{ code: 'a', name: 'A', minutes: 10, prices: { one: 1 } }] })).rejects.toMatchObject({ code: 'BAD_SERVICE' });
  await expect(upsertPackageLine({ code: 'tailor', name: 'Tailor', domainCode: 'local_pros', packages: [{ code: 'hem', name: 'Hem', minutes: 30, prices: {} }] })).rejects.toMatchObject({ code: 'BAD_SERVICE' });
  expect(await ServiceLine.exists({ code: 'tailor' })).toBeNull();
});

test('a provider proposes a missing service with their prices, and approval opens it for booking', async () => {
  const { requestLine } = require('../src/modules/onboarding/onboarding.service');
  const { lineRequests } = require('../src/modules/onboarding/onboarding-admin.controller');
  const { ServiceLineRequest } = require('../src/modules/onboarding/onboarding.model');
  const { Repair } = require('../src/modules/repair/models/repair.model');
  const owner = { kind: 'shop', id: new mongoose.Types.ObjectId(), providerKind: 'shop' };
  const { request } = await requestLine({ owner: { shopId: owner.id, kind: 'shop', id: owner.id }, providerKind: 'shop', domainCode: 'local_pros', proposedName: 'Tailoring at home', packages: [{ name: 'Hem trousers', minutes: 20, pricePaise: 9900 }, { name: 'Blouse fitting', minutes: 45, pricePaise: 29900 }] });
  expect((await ServiceLineRequest.findById(request._id).lean()).packages).toHaveLength(2);
  let out;
  await lineRequests.approve({ params: { id: String(request._id) }, body: { code: 'tailoring', domainCode: 'local_pros' }, auth: { sub: String(new mongoose.Types.ObjectId()), role: 'admin' }, headers: {}, ip: '127.0.0.1', get: () => '' }, { json: (b) => { out = b; }, status: () => ({ json: (b) => { out = b; } }) }, (e) => { throw e; });
  expect(out.line).toMatchObject({ code: 'tailoring', repairVertical: 'tailoring', status: 'live', customerPath: '/repair/tailoring' });
  expect((await Repair.find({ vertical: 'tailoring' }).lean()).map((r) => r.name).sort()).toEqual(['Blouse fitting', 'Hem trousers']);
  expect(isValid('tailoring')).toBe(true);
});

test('a partner\'s dashboard follows their trades: sections joined, words from their main trade, admin overrides win', async () => {
  const { workspaceFor } = require('../src/modules/onboarding/workspace');
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const shopId = new mongoose.Types.ObjectId();
  const owner = { kind: 'shop', id: shopId };
  expect(await workspaceFor(owner)).toEqual({ domains: [], modules: [], labels: {}, home: 'workshop' });
  for (const lineCode of ['salon_home', 'mens_grooming']) await ProviderEnrolment.create({ providerKind: 'shop', shopId, domainCode: 'beauty_care', lineCode, status: 'approved' });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId, domainCode: 'home_services', lineCode: 'carpentry', status: 'approved' });
  const w = await workspaceFor(owner);
  expect(w.domains.map((d) => d.code)).toEqual(['beauty_care', 'home_services']);
  expect(w.modules).toEqual(['plans', 'insights']);
  expect(w.labels).toMatchObject({ orders: 'Appointments', team: 'Stylists' });
  await ServiceDomain.updateOne({ code: 'beauty_care' }, { $set: { dashboard: { modules: ['plans'], labels: { orders: 'Bookings' } } } });
  expect((await workspaceFor(owner)).labels.orders).toBe('Bookings');
});
