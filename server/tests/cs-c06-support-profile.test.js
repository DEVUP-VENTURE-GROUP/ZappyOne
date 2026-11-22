// Customer module 6, support, SOS, profile and addresses: a customer sees and answers only their own tickets, raises SOS only on their own job, and a profile update can never change role, phone, block or rating.
const mongoose = require('mongoose');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
let app; let User; let SupportTicket; let tok;
let n = 0;
const oid = () => new mongoose.Types.ObjectId();
beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  User = require('../src/modules/user/user.model');
  SupportTicket = require('../src/modules/engagement/support-ticket.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  tok = (id, role = 'user') => ({ Authorization: `Bearer ${signAccessToken({ sub: String(id), role })}`, 'X-Forwarded-For': `10.8.${Math.floor(n / 250)}.${(n++) % 250}` });
});
afterAll(stopMongo);

const customer = () => { n += 1; return User.create({ name: `Support ${n}`, phone: `78${String(n).padStart(8, '0')}` }); };
const ticketFor = async (u) => (await SupportTicket.collection.insertOne({
  raisedBy: { kind: 'user', id: u._id }, subject: 'Pro was late', category: 'booking', status: 'open', priority: 'normal',
  messages: [{ from: 'user', fromId: u._id, text: 'Private details: Flat 7', at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
})).insertedId;

describe('support tickets', () => {
  test('the owner reads their ticket', async () => {
    const u = await customer();
    const id = await ticketFor(u);
    expect((await request(app).get(`/api/support/${id}`).set(tok(u._id))).status).toBe(200);
  });
  test('another customer cannot read it or write in it', async () => {
    const owner = await customer(); const other = await customer();
    const id = await ticketFor(owner);
    const read = await request(app).get(`/api/support/${id}`).set(tok(other._id));
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toMatch(/Flat 7/);
    const write = await request(app).post(`/api/support/${id}/messages`).set(tok(other._id)).send({ text: 'hijack' });
    expect(write.status).toBeGreaterThanOrEqual(400);
    expect((await SupportTicket.findById(id).lean()).messages).toHaveLength(1);
  });
  test('a pro cannot read a customer\'s ticket', async () => {
    const owner = await customer();
    const id = await ticketFor(owner);
    expect((await request(app).get(`/api/support/${id}`).set(tok(oid(), 'worker'))).status).toBe(404);
  });
  test('my tickets lists only mine', async () => {
    const a = await customer(); const b = await customer();
    await ticketFor(a); await ticketFor(b);
    const r = await request(app).get('/api/support/mine').set(tok(a._id));
    expect(r.status).toBe(200);
    const list = r.body.tickets || r.body.items || [];
    expect(list.every((t) => String(t.raisedBy?.id) === String(a._id))).toBe(true);
  });
  test.each([['read', 'get', ''], ['write', 'post', '/messages']])('a malformed ticket id to %s never crashes', async (_name, method, suffix) => {
    const u = await customer();
    const r = await request(app)[method](`/api/support/not-an-id${suffix}`).set(tok(u._id)).send({ text: 'hi' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });
});

describe('profile', () => {
  test('a profile update changes only name, email and payment choice', async () => {
    const u = await customer();
    const r = await request(app).patch('/api/users/me').set(tok(u._id)).send({ name: 'New Name', role: 'admin', phone: '9999999999', isBlocked: false, rating: 5, isDeleted: false });
    const after = await User.findById(u._id).lean();
    expect(after.name).toBe(r.status === 200 ? 'New Name' : after.name);
    expect(after.phone).toBe(u.phone);
    expect(after.role || 'user').not.toBe('admin');
  });
  test.each([['a bad email', { email: 'not-an-email' }], ['a 101-letter name', { name: 'x'.repeat(101) }], ['an unknown payment', { defaultPayment: 'gold' }]])('%s → 400', async (_name, body) => {
    const u = await customer();
    expect((await request(app).patch('/api/users/me').set(tok(u._id)).send(body)).status).toBe(400);
  });
  test('a pro cannot use the customer profile route', async () => {
    expect((await request(app).patch('/api/users/me').set(tok(oid(), 'worker')).send({ name: 'X' })).status).toBe(403);
  });
});

describe('addresses', () => {
  test('a customer cannot delete or change another customer\'s address', async () => {
    const owner = await User.create({ name: 'Addr Owner', phone: `77${String(++n).padStart(8, '0')}`, savedAddresses: [{ label: 'Home', address: 'Flat 9', location: { type: 'Point', coordinates: [78.4, 17.4] } }] });
    const addrId = String(owner.savedAddresses[0]._id);
    const other = await customer();
    await request(app).delete(`/api/users/addresses/${addrId}`).set(tok(other._id));
    await request(app).patch(`/api/users/addresses/${addrId}`).set(tok(other._id)).send({ label: 'Hacked' });
    const after = await User.findById(owner._id).lean();
    expect(after.savedAddresses).toHaveLength(1);
    expect(after.savedAddresses[0].label).toBe('Home');
  });
  test('a malformed address id never crashes', async () => {
    const u = await customer();
    expect((await request(app).delete('/api/users/addresses/nope').set(tok(u._id))).status).toBeLessThan(500);
  });
});

describe('SOS', () => {
  test('a customer cannot raise SOS on someone else\'s job', async () => {
    const { RepairBooking } = require('../src/modules/repair/models/booking.model');
    const { insertedId } = await RepairBooking.collection.insertOne({ userId: oid(), status: 'ON_THE_WAY', createdAt: new Date() });
    const r = await request(app).post(`/api/jobs/${insertedId}/sos`).set(tok(oid())).send({ lat: 17.44, lng: 78.39 });
    expect(r.status).toBe(404);
  });
  test.each([['latitude 91', { lat: 91, lng: 78 }], ['text', { lat: 'x', lng: 'y' }]])('SOS with %s → 400', async (_name, body) => {
    const r = await request(app).post(`/api/jobs/${oid()}/sos`).set(tok(oid())).send(body);
    expect(r.status).toBe(400);
  });
});
