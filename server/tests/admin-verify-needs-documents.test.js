// Admin cannot mark a shop or pro verified until a photo ID and a selfie are on file, from their ID check or a service application; with them, verifying works as before.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(120000);
const base = `/api/${process.env.ADMIN_LOGIN_SLUG}`;
let app; let admin; let Shop; let Worker; let ProviderEnrolment;
let n = 0;
const phone = () => `96${String(Date.now() % 1e6).padStart(6, '0')}${String(++n).padStart(2, '0')}`;
const approve = (kind, id) => request(app).post(`${base}/${kind}s/${id}/kyc/approve`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174').send({});

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  admin = await adminToken();
  Shop = require('../src/modules/shop/shop.model');
  Worker = require('../src/modules/worker/worker.model');
  ({ ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model'));
});
afterAll(stopMongo);

test('a pro with nothing on file is refused and stays unverified', async () => {
  const w = await Worker.create({ phone: phone(), name: 'No Docs' });
  const r = await approve('worker', w._id);
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ code: 'DOCUMENTS_MISSING', missing: ['a photo ID (Aadhaar or PAN)', 'a selfie'] });
  expect((await Worker.findById(w._id).lean()).kyc.status).toBe('not_submitted');
});

test('a pro with only an ID and no selfie is refused', async () => {
  const w = await Worker.create({ phone: phone(), name: 'Half', kyc: { aadhaarUrl: 'kyc/a.jpg' } });
  expect((await approve('worker', w._id)).body.missing).toEqual(['a selfie']);
});

test('a pro with ID and selfie from the ID check is verified', async () => {
  const w = await Worker.create({ phone: phone(), name: 'Ready', kyc: { status: 'pending_review', aadhaarUrl: 'kyc/a.jpg', selfieUrl: 'kyc/s.jpg' } });
  expect((await approve('worker', w._id)).status).toBe(200);
  expect((await Worker.findById(w._id).lean()).kyc.status).toBe('approved');
});

test('a pro whose ID and selfie came with a service application is verified', async () => {
  const w = await Worker.create({ phone: phone(), name: 'Applied' });
  await ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'pending_review',
    documents: [{ code: 'aadhaar', url: 'enr/a.jpg' }, { code: 'selfie', url: 'enr/s.jpg' }] });
  expect((await approve('worker', w._id)).status).toBe(200);
});

test('a shop with nothing on file is refused; with owner ID and selfie it is verified', async () => {
  const bare = await Shop.create({ businessName: 'Bare', ownerName: 'O', phone: phone() });
  expect((await approve('shop', bare._id)).body.code).toBe('DOCUMENTS_MISSING');
  expect((await Shop.findById(bare._id).lean()).kyc.status).toBe('not_submitted');
  const ready = await Shop.create({ businessName: 'Ready', ownerName: 'O', phone: phone(), kyc: { status: 'pending_review', ownerIdUrl: 'kyc/o.jpg', selfieUrl: 'kyc/s.jpg' } });
  expect((await approve('shop', ready._id)).status).toBe(200);
  expect((await Shop.findById(ready._id).lean()).kyc.status).toBe('approved');
});

test('documents on a rejected application do not count', async () => {
  const s = await Shop.create({ businessName: 'Rej', ownerName: 'O', phone: phone() });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: s._id, domainCode: 'home_daily_help', lineCode: 'daily_cleaning', status: 'rejected',
    documents: [{ code: 'owner_id', url: 'enr/o.jpg' }, { code: 'selfie', url: 'enr/s.jpg' }] });
  expect((await approve('shop', s._id)).body.code).toBe('DOCUMENTS_MISSING');
});
