/**
 * Document links (account/doc-link), for opening a receipt, invoice or service
 * report in the phone's browser:
 *   - a link opens only its own document path, as the person it was made for
 *   - the same token on any other path is refused, and it never works as a sign-in token
 *   - only documents can be linked; signed-out callers get nothing
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let User; let sign;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  User = require('../src/modules/user/user.model');
  ({ signAccessToken: sign } = require('../src/modules/auth/token.service'));
});
afterAll(stopMongo);

async function customer() {
  const u = await User.create({ phone: `+9192200${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`, name: 'Asha' });
  return { u, token: sign({ sub: String(u._id), role: 'user' }) };
}
const link = (token, path) => request(app).post('/api/account/doc-link').set('Authorization', `Bearer ${token}`).send({ path });

test('a link gets past sign-in for its own document, and nowhere else', async () => {
  const { token } = await customer();
  const id = new mongoose.Types.ObjectId();
  const path = `/api/repair/bookings/${id}/report`;
  const { body } = await link(token, path).expect(200);
  // Past authentication: the booking does not exist, so the handler answers 404, not 401.
  const ok = await request(app).get(`${path}?dl=${body.token}`);
  expect(ok.status).not.toBe(401);
  // Another booking's report with the same token: refused.
  await request(app).get(`/api/repair/bookings/${new mongoose.Types.ObjectId()}/report?dl=${body.token}`).expect(401);
  // Another kind of page: refused.
  await request(app).get(`/api/users/me?dl=${body.token}`).expect(401);
  // As a sign-in token: refused.
  await request(app).get('/api/users/me').set('Authorization', `Bearer ${body.token}`).expect(401);
});

test('only documents can be linked, and only when signed in', async () => {
  const { token } = await customer();
  await link(token, '/api/users/me').expect(400);
  await request(app).post('/api/account/doc-link').send({ path: `/api/orders/${new mongoose.Types.ObjectId()}/invoice` }).expect(401);
});
