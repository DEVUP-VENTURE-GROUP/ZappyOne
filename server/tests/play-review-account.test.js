// The store-review account signs in to the Rakshak app with phone + password, lands past setup, and is approved for no service.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { upsertReviewer, PHONE } = require('../scripts/play-review-account');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');

jest.setTimeout(60000);
let app;
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);

test('review account signs in from the app with a password, needs no setup, and gets no work', async () => {
  await upsertReviewer('Review#2026x');
  const res = await request(app).post('/api/auth/password/login').set('X-Client-Type', 'mobile').set('X-App', 'rakshak')
    .send({ role: 'worker', identifier: PHONE, password: 'Review#2026x' });
  expect(res.status).toBe(200);
  expect(res.body.accessToken).toBeTruthy();
  const setup = await request(app).get('/api/account/me').set('Authorization', `Bearer ${res.body.accessToken}`);
  expect(setup.status).toBe(200);
  expect(setup.body.needsSetup ?? setup.body.status?.needsSetup).toBe(false);
  expect(setup.body.askPhoto ?? setup.body.status?.askPhoto).toBe(false);
  expect(await ProviderEnrolment.countDocuments({ status: 'approved' })).toBe(0);
  const wrong = await request(app).post('/api/auth/password/login').set('X-Client-Type', 'mobile')
    .send({ role: 'worker', identifier: PHONE, password: 'nope-nope' });
  expect(wrong.status).toBe(401);
  await upsertReviewer('Review#2026x');
});
