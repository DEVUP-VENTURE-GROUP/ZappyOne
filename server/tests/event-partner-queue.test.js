// An event partner who sent their ID for review is first on admin's Partners list, however old the account or long the list.
const request = require('supertest');
const { startMongo, stopMongo, adminToken } = require('./helpers');

jest.setTimeout(120000);
let app; let admin;
const call = (method, path) => request(app)[method](`/api/${process.env.ADMIN_LOGIN_SLUG}${path}`).set('Authorization', `Bearer ${admin}`).set('Origin', process.env.ADMIN_ORIGIN || 'http://localhost:5174');
beforeAll(async () => { await startMongo(); app = require('../src/app')(); admin = await adminToken(); });
afterAll(stopMongo);

test('waiting partners come first and secrets stay out of the list', async () => {
  const EventPartner = require('../src/modules/events/event-partner.model');
  const old = new Date('2026-07-11T19:10:13Z');
  await EventPartner.collection.insertOne({ businessName: 'MaxxCity', ownerName: 'Asif', phone: '9000000701', passwordHash: 'x', kyc: { status: 'pending' }, isActive: true, createdAt: old, updatedAt: new Date() });
  await EventPartner.collection.insertMany(Array.from({ length: 22 }, (_, i) => ({
    businessName: `Decor ${i}`, ownerName: 'O', phone: `90000007${String(10 + i)}`, kyc: { status: 'not_submitted' }, isActive: true, createdAt: new Date(), updatedAt: new Date(),
  })));

  const res = await call('get', '/events/partners');
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(23);
  expect(res.body.waiting).toBe(1);
  expect(res.body.partners).toHaveLength(20);
  expect(res.body.partners[0]).toMatchObject({ businessName: 'MaxxCity', kyc: { status: 'pending' } });
  expect(res.body.partners[0].passwordHash).toBeUndefined();
});
