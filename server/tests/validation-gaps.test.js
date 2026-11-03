// Inputs customers can send are checked before any service sees them: no booking as someone else, no bad dates or ratings, no unbounded public writes.
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');

jest.setTimeout(120000);
let app;
const user = { Authorization: `Bearer ${signAccessToken({ sub: '64b000000000000000000001', role: 'user' })}` };
const theme = '64b0000000000000000000aa';
const booking = { themeId: theme, eventDate: '2027-01-10', eventTimeSlot: '10:00 AM', address: { line1: 'Plot 4, Kondapur', city: 'Hyderabad', pincode: '500084' }, guestCount: 20 };
beforeAll(async () => { await startMongo(); app = require('../src/app')(); });
afterAll(stopMongo);
afterEach(() => jest.restoreAllMocks());

test('an event booking cannot be made for another customer, and a bad date or guest count is refused', async () => {
  const svc = require('../src/modules/events/event.service');
  const spy = jest.spyOn(svc, 'createBooking').mockResolvedValue({ booking: { _id: 'b1' } });
  await request(app).post('/api/events/bookings').set(user).send({ ...booking, userId: '64b000000000000000000099', totalPaise: 1 });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatchObject({ userId: '64b000000000000000000001' });
  expect(spy.mock.calls[0][0].totalPaise).toBeUndefined();

  expect((await request(app).post('/api/events/bookings').set(user).send({ ...booking, eventDate: 'soon' })).status).toBe(400);
  expect((await request(app).post('/api/events/bookings').set(user).send({ ...booking, guestCount: -3 })).status).toBe(400);
  expect((await request(app).post('/api/events/bookings').set(user).send({ ...booking, address: {} })).status).toBe(400);
});

test('an event review needs a whole-number rating from 1 to 5', async () => {
  const res = await request(app).post(`/api/events/bookings/${theme}/review`).set(user).send({ rating: 'great' });
  expect(res.status).toBe(400);
});

test('demand events from signed-out visitors are size-limited', async () => {
  const res = await request(app).post('/api/catalog/services/demand-event').send({ customerNote: 'x'.repeat(5000) });
  expect(res.status).toBe(400);
  expect((await request(app).post('/api/catalog/services/demand-event').send({ category: 'mobile', reason: 'no_part' })).status).toBe(200);
});
