// ServicePro module 3, services and documents: only live lines can be applied for, documents are our own uploads, an application cannot be touched by anyone else or after approval, and a reviewer's request for new documents is honoured.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(180000);
const BASE = '/api/provider/onboarding';
let app; let Shop; let Enrolment; let ServiceLine;
let n = 0;
const auth = (id, role = 'shop') => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });
const DOCS = [{ code: 'owner_id', url: 'kyc/u/a.jpg' }, { code: 'shop_photo', url: 'kyc/u/b.jpg' }, { code: 'selfie', url: 'kyc/u/c.jpg' }];

async function shop(extra = {}) {
  n += 1;
  return Shop.create({
    businessName: `Lines Shop ${n}`, ownerName: 'Owner', phone: `97${String(n).padStart(8, '0')}`, email: `s${n}@example.com`, coverImageUrl: 'shop/cover.jpg',
    bio: 'Repairing phones in this area for many years now.', yearsActive: 7, hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: '09:00', closesAt: '21:00' })),
    address: { text: '12 MG Road', location: { type: 'Point', coordinates: [78.48, 17.38] } }, ...extra,
  });
}
const enrol = (s, lineCode = 'mobile_repair') => request(app).post(`${BASE}/enrolments`).set(auth(s._id)).send({ lineCode });
const save = (s, id, body) => request(app).patch(`${BASE}/enrolments/${id}`).set(auth(s._id)).send(body);
const submit = (s, id) => request(app).post(`${BASE}/enrolments/${id}/submit`).set(auth(s._id));

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const runner = require('../src/modules/onboarding/run-onboarding-seed');
  await runner.seedDomains(); await runner.seedLines(); await runner.seedRequirementSets();
  Shop = require('../src/modules/shop/shop.model');
  ({ ProviderEnrolment: Enrolment, ServiceLine } = require('../src/modules/onboarding/onboarding.model'));
  await Enrolment.init();
});
afterAll(stopMongo);

describe('applying for a service', () => {
  test('a live service opens a draft application', async () => {
    const r = await enrol(await shop());
    expect(r.status).toBeLessThan(300);
    expect(r.body.enrolment).toMatchObject({ lineCode: 'mobile_repair', status: 'draft' });
  });
  test.each([['an unknown service', 'teleport_repair', 404], ['upper case is the same service', 'MOBILE_REPAIR', 201]])('%s', async (_name, code, status) => {
    const r = await enrol(await shop(), code);
    expect(status === 404 ? r.status : r.status < 300).toBe(status === 404 ? 404 : true);
  });
  test('a service not open yet is refused with a plain reason', async () => {
    await ServiceLine.updateOne({ code: 'laptop_repair' }, { $set: { status: 'coming_soon' } });
    const r = await enrol(await shop(), 'laptop_repair');
    expect([r.status, r.body.code]).toEqual([409, 'LINE_NOT_LIVE']);
    await ServiceLine.updateOne({ code: 'laptop_repair' }, { $set: { status: 'live' } });
  });
  test('applying twice returns the same application', async () => {
    const s = await shop();
    const a = await enrol(s); const b = await enrol(s);
    expect(String(a.body.enrolment._id)).toBe(String(b.body.enrolment._id));
  });
  test('10 taps on Apply at once make one application and nothing crashes', async () => {
    const s = await shop();
    const res = await Promise.all(Array.from({ length: 10 }, () => enrol(s)));
    expect(res.filter((r) => r.status >= 500)).toEqual([]);
    expect(await Enrolment.countDocuments({ shopId: s._id, lineCode: 'mobile_repair' })).toBe(1);
  });
  test.each([['no service', {}], ['service as an object', { lineCode: { $ne: '' } }], ['a 61-letter code', { lineCode: 'x'.repeat(61) }]])('%s → 400', async (_name, body) => {
    expect((await request(app).post(`${BASE}/enrolments`).set(auth((await shop())._id)).send(body)).status).toBe(400);
  });
  test.each([['a customer', 'user'], ['an admin token', 'admin']])('%s cannot apply as a partner', async (_name, role) => {
    expect([401, 403]).toContain((await request(app).post(`${BASE}/enrolments`).set(auth(new mongoose.Types.ObjectId(), role)).send({ lineCode: 'mobile_repair' })).status);
  });
});

describe('documents', () => {
  let s; let id;
  beforeAll(async () => { s = await shop(); id = (await enrol(s)).body.enrolment._id; });

  test('our own uploads are saved', async () => {
    const r = await save(s, id, { documents: DOCS, acceptedDeclarations: true });
    expect(r.status).toBe(200);
    expect((await Enrolment.findById(id).lean()).documents.map((d) => d.url).sort()).toEqual(DOCS.map((d) => d.url).sort());
  });
  test.each([
    ['a web link', 'https://evil.example.com/id.jpg'], ['a path that climbs out', 'kyc/../shop/x.jpg'], ['a script', 'javascript:alert(1)'],
    ['another folder', 'menu/u/x.jpg'], ['a bare name', 'id.jpg'], ['empty', ''],
  ])('%s is refused as a document', async (_name, url) => {
    const r = await save(s, id, { documents: [{ code: 'owner_id', url }] });
    expect(r.status).toBe(400);
    expect((await Enrolment.findById(id).lean()).documents.find((d) => d.code === 'owner_id').url).toBe('kyc/u/a.jpg');
  });
  test('a gallery photo is never recorded as a live camera capture unless the app says so', async () => {
    await save(s, id, { documents: [{ code: 'selfie', url: 'kyc/u/c2.jpg', captureMethod: 'upload' }] });
    expect((await Enrolment.findById(id).lean()).documents.find((d) => d.code === 'selfie').captureMethod).toBe('upload');
  });
  test.each([['latitude 91', { lat: 91 }], ['unknown capture method', { captureMethod: 'screenshot' }], ['a 61-letter code', { code: 'x'.repeat(61) }]])('%s → 400', async (_name, extra) => {
    expect((await save(s, id, { documents: [{ code: 'owner_id', url: 'kyc/u/z.jpg', ...extra }] })).status).toBe(400);
  });
  test('another shop cannot read or change this application', async () => {
    const other = await shop();
    expect((await save(other, id, { documents: [{ code: 'owner_id', url: 'kyc/u/hijack.jpg' }] })).status).toBe(404);
    expect((await submit(other, id)).status).toBe(404);
    expect((await Enrolment.findById(id).lean()).documents.find((d) => d.code === 'owner_id').url).toBe('kyc/u/a.jpg');
  });
  test('a malformed application id', async () => {
    expect((await save(s, 'nope', { documents: DOCS })).status).toBeLessThan(500);
  });
});

describe('sending for review', () => {
  test('missing documents are listed by name, nothing is sent', async () => {
    const s = await shop(); const id = (await enrol(s)).body.enrolment._id;
    const r = await submit(s, id);
    expect([r.status, r.body.code]).toEqual([400, 'INCOMPLETE']);
    expect(r.body.missing.length).toBeGreaterThan(0);
    expect((await Enrolment.findById(id).lean()).status).toBe('draft');
  });
  test('a business with an unfinished profile is told what to finish first', async () => {
    const s = await shop({ bio: 'short' }); const id = (await enrol(s)).body.enrolment._id;
    await save(s, id, { documents: DOCS, fields: [{ code: 'years_active', value: '7' }], acceptedDeclarations: true });
    const r = await submit(s, id);
    expect([r.status, r.body.code]).toEqual([409, 'PROFILE_INCOMPLETE']);
  });
  test('a complete application goes to review; once approved it cannot be edited or sent again', async () => {
    const s = await shop(); const id = (await enrol(s)).body.enrolment._id;
    await save(s, id, { documents: DOCS, fields: [{ code: 'years_active', value: '7' }], acceptedDeclarations: true });
    const r = await submit(s, id);
    expect(r.status).toBe(200);
    expect(['pending_review', 'approved']).toContain(r.body.enrolment.status);
    await Enrolment.updateOne({ _id: id }, { $set: { status: 'approved' } });
    expect((await save(s, id, { documents: [{ code: 'owner_id', url: 'kyc/u/after.jpg' }] })).body.code).toBe('ALREADY_DECIDED');
    expect((await submit(s, id)).body.code).toBe('ALREADY_APPROVED');
  });
  test('when the reviewer asks for one document again, only that one can change and it must be new', async () => {
    const s = await shop(); const id = (await enrol(s)).body.enrolment._id;
    await save(s, id, { documents: DOCS, fields: [{ code: 'years_active', value: '7' }], acceptedDeclarations: true });
    await submit(s, id);
    await Enrolment.updateOne({ _id: id }, { $set: { status: 'needs_changes', redo: { codes: ['selfie'], note: 'blurry', requestedAt: new Date(Date.now() + 1000) } } });
    await save(s, id, { documents: [{ code: 'owner_id', url: 'kyc/u/sneaky.jpg' }] });
    expect((await Enrolment.findById(id).lean()).documents.find((d) => d.code === 'owner_id').url).toBe('kyc/u/a.jpg');
    const early = await submit(s, id);
    expect(early.body.code).toBe('INCOMPLETE');
  });
});

describe('asking ZappyOne to add a new service', () => {
  const ask = (s, body) => request(app).post(`${BASE}/line-requests`).set(auth(s._id)).send({ proposedName: 'Aquarium cleaning', ...body });
  test.each([
    ['a web link photo', { photos: ['https://evil.example.com/x.jpg'] }],
    ['a path photo', { photos: ['line-requests/../kyc/x.jpg'] }],
    ['a package photo link', { packages: [{ name: 'Small tank', minutes: 60, pricePaise: 50000, photoKey: 'javascript:alert(1)' }] }],
    ['7 photos', { photos: Array.from({ length: 7 }, (_, i) => `line-requests/u/${i}.jpg`) }],
    ['21 packages', { packages: Array.from({ length: 21 }, (_, i) => ({ name: `P${i}x`, minutes: 30, pricePaise: 10000 })) }],
    ['a package under ₹1', { packages: [{ name: 'Tiny', minutes: 30, pricePaise: 99 }] }],
    ['no name', { proposedName: undefined }],
    ['61 years of experience', { yearsExperience: 61 }],
    ['an unknown service mode', { serviceModes: ['teleport'] }],
  ])('%s → 400', async (_name, body) => {
    expect((await ask(await shop(), body)).status).toBe(400);
  });
  test('our own photos are accepted', async () => {
    const r = await ask(await shop(), { photos: ['line-requests/u/1.jpg'], packages: [{ name: 'Small tank', minutes: 60, pricePaise: 50000, photoKey: 'line-requests/u/2.jpg' }] });
    expect(r.status).toBeLessThan(300);
  });
});
