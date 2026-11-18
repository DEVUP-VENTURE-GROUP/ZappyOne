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
