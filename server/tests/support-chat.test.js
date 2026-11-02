// Talking to ZappyOne: customers and every kind of partner open a conversation (help, complaint, feature request); only they can read it; admin's reply reaches them as a notification.
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo, adminToken } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(120000);
let app; let admin;
const adminCall = (method, path) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
const as = (id, role) => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}` });

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  admin = await adminToken();
});
afterAll(stopMongo);

test('a shop asks for a feature, a customer complains; each sees only their own; admin replies and they are notified', async () => {
  const Shop = require('../src/modules/shop/shop.model');
  const User = require('../src/modules/user/user.model');
  const shop = await Shop.create({ businessName: 'Kondapur Fixers', ownerName: 'Ravi', phone: '9000000951' });
  const user = await User.create({ phone: '9000000952', name: 'Asha' });

  const asked = await request(app).post('/api/support').set(as(shop._id, 'shop'))
    .send({ category: 'feature_request', subject: 'Let me set holiday hours', description: 'I close every Tuesday in Diwali week; let me mark those days off.' });
  expect(asked.status).toBe(201);
  const complaint = await request(app).post('/api/support').set(as(user._id, 'user'))
    .send({ category: 'complaint', subject: 'Pro came late', description: 'The pro arrived an hour late and did not call me.' });
  expect(complaint.status).toBe(201);

  const mine = await request(app).get('/api/support/mine').set(as(shop._id, 'shop'));
  expect(mine.body.tickets.map((t) => t.subject)).toEqual(['Let me set holiday hours']);
  expect((await request(app).get(`/api/support/${complaint.body.ticket._id}`).set(as(shop._id, 'shop'))).status).toBe(404);

  const list = await adminCall('get', '/support?kind=shop');
  expect(list.status).toBe(200);
  expect(list.body.tickets.map((t) => t.raiser?.name)).toEqual(['Kondapur Fixers']);

  const reply = await adminCall('post', `/support/${asked.body.ticket._id}/reply`).send({ text: 'Good idea, it is on our list for next month.', status: 'in_progress' });
  expect(reply.status).toBe(200);
  await new Promise((r) => setTimeout(r, 100));
  const Notification = require('../src/modules/notification/notification.model');
  const note = await Notification.findOne({ 'recipient.id': shop._id }).lean();
  expect(note).toMatchObject({ title: 'ZappyOne replied', deepLink: `/shop/support?ticket=${asked.body.ticket._id}` });

  const back = await request(app).post(`/api/support/${asked.body.ticket._id}/messages`).set(as(shop._id, 'shop')).send({ text: 'Thanks!' });
  expect(back.status).toBe(200);
  expect(back.body.ticket.messages.map((m) => m.from)).toEqual(['shop', 'admin', 'shop']);
  expect(mongoose.isValidObjectId(String(shop._id))).toBe(true);
});
