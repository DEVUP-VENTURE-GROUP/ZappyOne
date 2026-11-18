// A ServicePro account that works alone (partnerType individual) is asked for an individual's documents, never a storefront photo; a shop still is.
require('./env');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let signAccessToken; let Shop;
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ signAccessToken } = require('../src/modules/auth/token.service'));
  Shop = require('../src/modules/shop/shop.model');
  const runner = require('../src/modules/onboarding/run-onboarding-seed');
  await runner.seedDomains();
  await runner.seedLines();
  await runner.seedRequirementSets();
});
afterAll(stopMongo);

const tokenFor = async (partnerType, phone) => {
  const shop = await Shop.create({ businessName: 'Ravi Repairs', ownerName: 'Ravi', phone, partnerType });
  return { shop, token: signAccessToken({ sub: String(shop._id), role: 'shop', phone }) };
};
const docsFor = async (token) => (await request(app).get('/api/provider/onboarding/lines/mobile_repair/requirements').set('Authorization', `Bearer ${token}`)).body.requirements.documents.map((d) => d.code);

test('an independent professional gets the individual checklist: Aadhaar and a live selfie, no storefront or GST', async () => {
  const { token } = await tokenFor('individual', '9811100001');
  const docs = await docsFor(token);
  expect(docs).toEqual(expect.arrayContaining(['aadhaar', 'selfie']));
  expect(docs).not.toContain('shop_photo');
  expect(docs).not.toContain('gst_certificate');
});

test('a shop, an agency and a company still get the business checklist', async () => {
  for (const [type, phone] of [['shop', '9811100002'], ['agency', '9811100003'], ['company', '9811100004']]) {
    const { token } = await tokenFor(type, phone);
    expect(await docsFor(token)).toContain('shop_photo');
  }
});

test('the checklist follows a change of how they work', async () => {
  const { shop, token } = await tokenFor('shop', '9811100005');
  expect(await docsFor(token)).toContain('shop_photo');
  await Shop.updateOne({ _id: shop._id }, { $set: { partnerType: 'individual' } });
  expect(await docsFor(token)).not.toContain('shop_photo');
});

test('an approved independent professional\'s Aadhaar counts as the owner ID on file for the next service', async () => {
  const identity = require('../src/modules/onboarding/identity');
  const { shop } = await tokenFor('individual', '9811100006');
  await Shop.updateOne({ _id: shop._id }, { $set: { kyc: { status: 'approved', ownerIdUrl: 'kyc/aadhaar.jpg', selfieUrl: 'kyc/selfie.jpg' } } });
  const onFile = await identity.shopOnFile(shop._id);
  const docs = onFile.docs || onFile[0] || onFile;
  const has = (code) => (docs.get ? docs.get(code) : docs[code]);
  expect(has('aadhaar')?.url).toBe('kyc/aadhaar.jpg');
});

describe('Shop documents for an independent professional', () => {
  const selfieMetadata = { capturedAt: new Date().toISOString(), captureMethod: 'live_camera', lat: 17.44, lng: 78.38 };
  const submit = (token, body) => request(app).post('/api/shops/me/kyc/submit').set('Authorization', `Bearer ${token}`).send({ selfieMetadata, ...body });

  test('the status tells the screen how they work', async () => {
    const { token } = await tokenFor('individual', '9811100010');
    const res = await request(app).get('/api/shops/me/kyc/status').set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ partnerType: 'individual', kyc: { status: 'not_submitted' } });
  });

  test('ID and a live selfie are enough; no shop photo is asked for', async () => {
    const { shop, token } = await tokenFor('individual', '9811100011');
    const res = await submit(token, { ownerIdUrl: 'kyc/a.jpg', selfieUrl: 'kyc/s.jpg' });
    expect(res.status).toBe(200);
    expect((await Shop.findById(shop._id).lean()).kyc).toMatchObject({ status: 'pending_review', ownerIdUrl: 'kyc/a.jpg' });
  });

  test('an independent professional still needs their ID and selfie', async () => {
    const { token } = await tokenFor('individual', '9811100012');
    const res = await submit(token, { selfieUrl: 'kyc/s.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ID and a live selfie/);
  });

  test('a shop must still send its shop photo', async () => {
    const { token } = await tokenFor('shop', '9811100013');
    const res = await submit(token, { ownerIdUrl: 'kyc/a.jpg', selfieUrl: 'kyc/s.jpg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/shop photo/);
  });
});

describe('a draft begun on the other checklist', () => {
  test('its uploaded owner ID stands for Aadhaar, so nothing is asked twice', async () => {
    const identity = require('../src/modules/onboarding/identity');
    const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
    const { shop } = await tokenFor('individual', '9811100020');
    const draft = await ProviderEnrolment.create({ shopId: shop._id, providerKind: 'shop', lineCode: 'mobile_repair', domainCode: 'electronics', status: 'draft', documents: [{ code: 'owner_id', url: 'kyc/owner.jpg' }] });
    await identity.carryIdentity(draft);
    const after = await ProviderEnrolment.findById(draft._id).lean();
    expect(after.documents.find((d) => d.code === 'aadhaar')?.url).toBe('kyc/owner.jpg');
  });

  test('my documents shows the individual names for what they gave', async () => {
    const { token } = await tokenFor('individual', '9811100021');
    const res = await request(app).get('/api/provider/onboarding/my-documents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
