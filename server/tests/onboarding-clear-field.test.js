// A wrong optional detail, then cleared, then submitted: the application goes through (the case a shop hit before onboarding day).
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(90000);
const BASE = '/api/provider/onboarding';
let app; let token; let id;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const runner = require('../src/modules/onboarding/run-onboarding-seed');
  await runner.seedDomains(); await runner.seedLines(); await runner.seedRequirementSets();
  const shop = await require('../src/modules/shop/shop.model').create({
    businessName: 'Zappyone', ownerName: 'Faizan', phone: '9700000777', email: 'z@example.com', coverImageUrl: 'shop/cover.jpg',
    bio: 'Repairing phones in this area for many years now.', yearsActive: 7, hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: '00:00', closesAt: '23:59' })),
    address: { text: '12 MG Road', location: { type: 'Point', coordinates: [78.48, 17.38] } },
  });
  token = signAccessToken({ sub: String(shop._id), role: 'shop', phone: shop.phone });
  id = (await request(app).post(`${BASE}/enrolments`).set(auth()).send({ lineCode: 'mobile_repair' })).body.enrolment._id;
  await request(app).patch(`${BASE}/enrolments/${id}`).set(auth()).send({
    documents: [{ code: 'owner_id', url: 'kyc/a.jpg' }, { code: 'shop_photo', url: 'kyc/b.jpg' }, { code: 'selfie', url: 'kyc/c.jpg' }],
    fields: [{ code: 'years_active', value: '7' }], acceptedDeclarations: true,
  });
});
afterAll(stopMongo);

test('an optional detail never stops an application, whatever is typed in it', async () => {
  await request(app).patch(`${BASE}/enrolments/${id}`).set(auth()).send({ fields: [{ code: 'pan_number', value: 'FE3769HGSJ(' }, { code: 'gst_number', value: 'NOT-A-GST' }, { code: 'years_active', value: '7' }], acceptedDeclarations: true });
  const res = await request(app).post(`${BASE}/enrolments/${id}/submit`).set(auth());
  expect(res.status).toBe(200);
  expect(res.body.enrolment.status).toBe('pending_review');
  const saved = await require('../src/modules/onboarding/onboarding.model').ProviderEnrolment.findById(id).lean();
  expect(saved.fields.find((f) => f.code === 'pan_number').value).toBe('FE3769HGSJ(');
});
