// The whole "add your UPI ID" journey as the ServicePro page drives it: setup step open, code to the account's own number, save, step done; and bank accounts with the form's own payloads.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(120000);
let app; let shop; let auth;
const EMPTY = { label: '', accountName: '', accountNumber: '', bankName: '', ifsc: '', upiId: '', upiLabel: '' };
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  const Shop = require('../src/modules/shop/shop.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  shop = await Shop.create({ businessName: 'Maxx Fixers', ownerName: 'Asif', phone: '9876500111' });
  // A session restored in a fresh tab: no phone on the token.
  const token = signAccessToken({ sub: String(shop._id), role: 'shop' });
  auth = (r) => r.set('Authorization', `Bearer ${token}`).set('x-client-type', 'servicepro');
});
afterAll(stopMongo);

const upiStep = async () => (await auth(request(app).get('/api/provider/onboarding/profile-status'))).body.items.find((i) => i.key === 'upi');
const confirmCode = async () => {
  const sent = await auth(request(app).post('/api/auth/otp/request-action'));
  expect(sent.status).toBe(200);
  expect((await auth(request(app).post('/api/auth/otp/verify-action')).send({ otp: sent.body.otp })).status).toBe(200);
};
const add = (body) => auth(request(app).post('/api/workers/bank-accounts')).send(body);

test('UPI: step missing, code confirmed, saved from the form as it was sent, step done', async () => {
  expect(await upiStep()).toMatchObject({ done: false, path: '/shop/bank' });

  // Without a fresh code the server asks for one (the page then opens "Confirm it is you").
  expect((await add({ type: 'upi', upiId: 'asif@oksbi' })).body.code).toBe('OTP_REQUIRED');
  await confirmCode();

  // Exactly what the page sent before this fix: every field of both tabs, the bank ones empty.
  const old = await add({ type: 'upi', ...EMPTY, upiId: 'asif@oksbi', upiLabel: 'Gpay' });
  expect(old.status).toBe(201);
  expect(old.body.upiIds).toEqual([expect.objectContaining({ upiId: 'asif@oksbi', label: 'Gpay' })]);
  // What it sends now: only the UPI fields.
  const now = await add({ type: 'upi', upiId: 'asif2@okaxis', upiLabel: '' });
  expect(now.status).toBe(201);

  expect(await upiStep()).toMatchObject({ done: true });
});

test('UPI: a wrong format and a repeat are refused with plain messages', async () => {
  const bad = await add({ type: 'upi', ...EMPTY, upiId: 'asif.oksbi' });
  expect(bad.status).toBe(400);
  expect(bad.body.error).toMatch(/does not exist|UPI/i);
  const again = await add({ type: 'upi', upiId: 'asif@oksbi' });
  expect(again.status).toBe(409);
});

test('bank: the form payload saves; a bad IFSC or account number says what is wrong', async () => {
  const badIfsc = await add({ type: 'bank', ...EMPTY, accountName: 'Asif', accountNumber: '50100123456789', ifsc: 'HDFC1234567' });
  expect(badIfsc.status).toBe(400);
  expect(badIfsc.body.error).toMatch(/ifsc/i);
  const badNo = await add({ type: 'bank', ...EMPTY, accountName: 'Asif', accountNumber: '12AB', ifsc: 'HDFC0001234' });
  expect(badNo.status).toBe(400);
  expect(badNo.body.error).toMatch(/account number/i);
  const ok = await add({ type: 'bank', ...EMPTY, accountName: 'Asif Mohammed', accountNumber: '50100123456789', bankName: 'HDFC', ifsc: 'hdfc0001234' });
  expect(ok.status).toBe(201);
  expect(ok.body.banks[0]).toMatchObject({ accountName: 'Asif Mohammed', accountNumber: 'XXXX6789', ifsc: 'HDFC0001234' });
});
