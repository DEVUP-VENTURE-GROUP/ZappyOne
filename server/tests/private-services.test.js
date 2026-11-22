// A service opened from one partner's request is theirs alone: only they see and join it, customers never see it as a public tile, admin can open it to everyone, and older requested services go private with a dry run first.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');
const { ServiceDomain, ServiceLine, ServiceLineRequest, ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');

jest.setTimeout(120000);
let app; let admin; let tok; let Worker; let service;
let n = 0;
const base = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
const asAdmin = (r) => r.set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
const owner = (w) => ({ kind: 'worker', id: w._id });
const pro = () => { n += 1; return Worker.create({ name: `Pro ${n}`, phone: `95${String(n).padStart(8, '0')}`, kyc: { status: 'approved', aadhaarUrl: 'kyc/a.jpg' } }); };
const ask = (w, name, extra = {}) => service.requestLine({
  owner: owner(w), providerKind: 'individual', domainCode: 'home_daily_help', proposedName: name,
  description: 'Full home cleaning with our own team and supplies', photos: ['line-requests/cover.jpg'],
  packages: [{ name: 'Full home clean', minutes: 180, pricePaise: 199900 }], ...extra,
});
const tickList = async (w) => (await request(app).get('/api/provider/onboarding/lines').query({ domainCode: 'home_daily_help' }).set(tok(w._id))).body;
const codesIn = (body) => (body.lines || body.items || []).map((l) => l.code);

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  admin = await adminToken();
  Worker = require('../src/modules/worker/worker.model');
  service = require('../src/modules/onboarding/onboarding.service');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role: 'worker' })}` });
  await ServiceDomain.create({ code: 'home_daily_help', name: 'Home & Daily Help' });
  await ServiceLine.create({ code: 'sweep_mop', name: 'Sweeping, mopping & dusting', domainCode: 'home_daily_help', status: 'live', providerKinds: ['individual'], customerPath: '/repair/sweep' });
});
afterAll(stopMongo);

describe('a partner\'s own new service', () => {
  test('opens for them alone: they see it in their list, another partner does not and cannot join it', async () => {
    const a = await pro(); const b = await pro();
    const r = await ask(a, `SK home cleaning ${n}`);
    const line = await ServiceLine.findOne({ code: r.opened.code }).lean();
    expect(line.privateTo).toMatchObject({ kind: 'worker' });
    expect(String(line.privateTo.id)).toBe(String(a._id));
    expect(codesIn(await tickList(a))).toEqual(expect.arrayContaining([line.code, 'sweep_mop']));
    expect(codesIn(await tickList(b))).not.toContain(line.code);
    expect(codesIn(await tickList(b))).toContain('sweep_mop');
    await expect(service.enrol({ owner: owner(b), providerKind: 'individual', lineCode: line.code })).rejects.toMatchObject({ status: 404 });
  });
  test('the partner who asked is signed up to it straight away', async () => {
    const a = await pro();
    const r = await ask(a, `Sofa shampoo ${n}`);
    expect(await ProviderEnrolment.exists({ workerId: a._id, lineCode: r.opened.code })).toBeTruthy();
  });
  test('customers never get it as a public service tile', async () => {
    const a = await pro();
    const r = await ask(a, `Chimney clean ${n}`);
    await ServiceLine.updateOne({ code: r.opened.code }, { $set: { customerPath: '/repair/chimney', status: 'live' } });
    await ProviderEnrolment.updateOne({ workerId: a._id, lineCode: r.opened.code }, { $set: { status: 'approved' } });
    const { loadLiveLines, loadOfferedLines } = require('../src/modules/onboarding/coverage.service');
    if (loadLiveLines) expect((await loadLiveLines()).lines.map((l) => l.code)).not.toContain(r.opened.code);
    if (loadOfferedLines) expect((await loadOfferedLines()).lines.map((l) => l.code)).not.toContain(r.opened.code);
  });
  test('two partners asking for the same name each get their own, never a "join theirs" dead end', async () => {
    const a = await pro(); const b = await pro();
    const name = `Balcony garden care ${n}`;
    const first = await ask(a, name);
    const second = await ask(b, name);
    expect(second.warnings.map((w) => w.code)).not.toContain('DUPLICATE');
    expect(second.opened.code).not.toBe(first.opened.code);
    const again = await ask(a, name);
    expect(again.warnings.map((w) => w.code)).toContain('DUPLICATE');
  });
  test('a name matching a shared service is still a duplicate', async () => {
    const r = await ask(await pro(), 'Sweeping, mopping & dusting');
    expect(r.warnings.map((w) => w.code)).toContain('DUPLICATE');
    expect(r.opened).toBeUndefined();
  });
});

describe('admin', () => {
  const pending = async (w, name) => ServiceLineRequest.create({ workerId: w._id, providerKind: 'individual', domainCode: 'home_daily_help', proposedName: name, description: 'x', status: 'pending' });
  const approve = (id, body) => asAdmin(request(app).post(`${base}/onboarding/line-requests/${id}/approve`)).send({ domainCode: 'home_daily_help', ...body });

  test('approving keeps it for that partner unless admin shows it to every partner', async () => {
    const a = await pro();
    const own = await approve((await pending(a, 'Window grills')).id, { code: `grills_${n}` });
    expect(own.status).toBe(200);
    expect((await ServiceLine.findOne({ code: `grills_${n}` }).lean()).privateTo).toBeTruthy();
    const shared = await approve((await pending(a, 'Terrace wash')).id, { code: `terrace_${n}`, forEveryone: true });
    expect(shared.status).toBe(200);
    expect((await ServiceLine.findOne({ code: `terrace_${n}` }).lean()).privateTo).toBeNull();
  });
  test('approving into an existing shared service never makes it private', async () => {
    const a = await pro();
    await approve((await pending(a, 'Sweeping')).id, { code: 'sweep_mop' });
    expect((await ServiceLine.findOne({ code: 'sweep_mop' }).lean()).privateTo).toBeNull();
  });
  test('the services list names whose it is, and "show to every partner" opens it to all', async () => {
    const a = await pro(); const b = await pro();
    const r = await ask(a, `Fridge deep clean ${n}`);
    const ov = await asAdmin(request(app).get(`${base}/onboarding/overview`));
    const row = ov.body.domains.flatMap((d) => d.lines).find((l) => l.code === r.opened.code);
    expect(row.privateToName).toBe(a.name);
    expect(row.liveForCustomers).toBe(false);
    const open = await asAdmin(request(app).patch(`${base}/onboarding/lines/${row._id}`)).send({ privateTo: null });
    expect(open.status).toBe(200);
    expect(codesIn(await tickList(b))).toContain(r.opened.code);
  });
  test('a partner cannot use the admin approve', async () => {
    const a = await pro();
    const req = await pending(a, 'Sneaky');
    const r = await request(app).post(`${base}/onboarding/line-requests/${req.id}/approve`).set(tok(a._id)).send({ code: 'sneaky', domainCode: 'home_daily_help', forEveryone: true });
    expect([401, 403, 404]).toContain(r.status);
    expect(await ServiceLine.exists({ code: 'sneaky' })).toBeNull();
  });
});

describe('older requested services', () => {
  test('dry run reports and writes nothing; apply makes each private unless another partner already joined', async () => {
    const { makeRequestedPrivate } = require('../src/modules/onboarding/private-requests');
    const a = await pro(); const b = await pro();
    await ServiceLine.create([
      { code: `old_solo_${n}`, name: 'Old solo', domainCode: 'home_daily_help', status: 'live', providerKinds: ['individual'] },
      { code: `old_shared_${n}`, name: 'Old shared', domainCode: 'home_daily_help', status: 'live', providerKinds: ['individual'] },
    ]);
    await ServiceLineRequest.create([
      { workerId: a._id, providerKind: 'individual', domainCode: 'home_daily_help', proposedName: 'Old solo', status: 'approved', resultLineCode: `old_solo_${n}` },
      { workerId: a._id, providerKind: 'individual', domainCode: 'home_daily_help', proposedName: 'Old shared', status: 'approved', resultLineCode: `old_shared_${n}` },
    ]);
    await ProviderEnrolment.create({ providerKind: 'individual', workerId: b._id, domainCode: 'home_daily_help', lineCode: `old_shared_${n}`, status: 'approved' });

    const dry = await makeRequestedPrivate();
    expect(dry.madePrivate.map((x) => x.code)).toContain(`old_solo_${n}`);
    expect(dry.keptPublic.map((x) => x.code)).toContain(`old_shared_${n}`);
    expect((await ServiceLine.findOne({ code: `old_solo_${n}` }).lean()).privateTo).toBeNull();

    await makeRequestedPrivate({ apply: true });
    expect(String((await ServiceLine.findOne({ code: `old_solo_${n}` }).lean()).privateTo.id)).toBe(String(a._id));
    expect((await ServiceLine.findOne({ code: `old_shared_${n}` }).lean()).privateTo).toBeNull();
    expect((await makeRequestedPrivate({ apply: true })).madePrivate.map((x) => x.code)).not.toContain(`old_solo_${n}`);
  });
});
