/**
 * Who may see and take pet and helping jobs, through the real routes.
 *
 *   - customers and unverified providers see nothing open and can take nothing
 *   - a provider approved for the service sees it, without private details
 *   - a customer's chosen provider can accept or decline; declining opens it up
 *   - an offer nobody answers goes back to the pool
 *   - taking a job tells the customer
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { HelpingTask } = require('../src/modules/helping/models/task.model');
const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');
const Notification = require('../src/modules/notification/notification.model');
const bookingService = require('../src/modules/pet/services/booking.service');

jest.setTimeout(90000);

let app;
const oid = () => new mongoose.Types.ObjectId();
const customer = oid();
const HOME = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
let approved; let unverified; let other;

const as = (id, role) => signAccessToken({ sub: String(id), role });
const get = (path, token) => request(app).get(`/api${path}`).set('Authorization', `Bearer ${token}`);
const post = (path, token, body = {}) => request(app).post(`/api${path}`).set('Authorization', `Bearer ${token}`).send(body);

async function worker(phone) {
  return Worker.create({ name: `W${phone}`, phone, kyc: { status: 'approved' }, currentLocation: { type: 'Point', coordinates: [78.39, 17.45] } });
}
const enrol = (w, lineCode, domainCode) => ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode, lineCode, status: 'approved' });

const openPet = (extra = {}) => PetBooking.collection.insertOne({
  reference: `ZP${Math.random().toString(36).slice(2, 8)}`, userId: customer, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
  status: 'BOOKED', workerId: null, shopId: null, declinedBy: [], serviceLocation: HOME, handoverOtp: '4321',
  pets: [{ petId: oid(), variantCode: 'pg_full_grooming', snapshot: { name: 'Bruno', species: 'dog', size: 'medium', medicalNotes: 'epilepsy' } }],
  pricing: { totalPaise: 60000, providerAmountPaise: 50000 }, statusHistory: [{ status: 'BOOKED', at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
  ...extra,
});

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  // The open-job lists are geo queries; build the indexes they rely on.
  await Promise.all([PetBooking.init(), HelpingTask.init()]);
  [approved, unverified, other] = await Promise.all([worker('9000000401'), worker('9000000402'), worker('9000000403')]);
  await Promise.all([
    enrol(approved, 'pet_grooming', 'pet_services'), enrol(other, 'pet_grooming', 'pet_services'),
    enrol(approved, 'shopping_pickup', 'helping_services'),
  ]);
});
afterAll(stopMongo);
beforeEach(() => Promise.all([PetBooking.collection.deleteMany({}), HelpingTask.collection.deleteMany({})]));

describe('open pet bookings', () => {
  test('a customer cannot list or take them', async () => {
    const { insertedId } = await openPet();
    expect((await get('/pet/bookings/available', as(customer, 'user'))).status).toBe(403);
    expect((await post(`/pet/bookings/${insertedId}/accept`, as(customer, 'user'))).status).toBe(403);
  });

  test('an unverified worker sees none and cannot take one', async () => {
    const { insertedId } = await openPet();
    const list = await get('/pet/bookings/available', as(unverified._id, 'worker'));
    expect(list.body).toMatchObject({ bookings: [], notApproved: true });
    const res = await post(`/pet/bookings/${insertedId}/accept`, as(unverified._id, 'worker'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_APPROVED_FOR_SERVICE');
  });

  test('an approved worker sees it without the private details, and takes it', async () => {
    const { insertedId } = await openPet();
    const list = await get('/pet/bookings/available', as(approved._id, 'worker'));
    expect(list.body.bookings).toHaveLength(1);
    const card = list.body.bookings[0];
    expect(card).not.toHaveProperty('userId');
    expect(card).not.toHaveProperty('handoverOtp');
    expect(card.pets[0].snapshot).not.toHaveProperty('medicalNotes');
    expect(card.km).toBeLessThan(2);

    const res = await post(`/pet/bookings/${insertedId}/accept`, as(approved._id, 'worker'));
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('PROVIDER_ACCEPTED');
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ 'recipient.id': customer, title: 'Pet pro confirmed' })).toBe(1);

    const second = await post(`/pet/bookings/${insertedId}/accept`, as(other._id, 'worker'));
    expect(second.status).toBe(409);
  });
});

describe('a booking offered to the chosen provider', () => {
  test('they can accept it', async () => {
    const { insertedId } = await openPet({ status: 'PROVIDER_ASSIGNED', workerId: approved._id, assignedAt: new Date() });
    const mine = await get('/pet/bookings/assigned', as(approved._id, 'worker'));
    expect(mine.body.bookings.map((b) => String(b._id))).toContain(String(insertedId));
    const res = await post(`/pet/bookings/${insertedId}/accept`, as(approved._id, 'worker'));
    expect(res.body.booking.status).toBe('PROVIDER_ACCEPTED');
  });

  test('nobody else can take it while it waits for them', async () => {
    const { insertedId } = await openPet({ status: 'PROVIDER_ASSIGNED', workerId: approved._id, assignedAt: new Date() });
    expect((await post(`/pet/bookings/${insertedId}/accept`, as(other._id, 'worker'))).status).toBe(409);
  });

  test('declining opens it to others, but not back to them', async () => {
    const { insertedId } = await openPet({ status: 'PROVIDER_ASSIGNED', workerId: approved._id, assignedAt: new Date() });
    const res = await post(`/pet/bookings/${insertedId}/decline`, as(approved._id, 'worker'), { reason: 'Fully booked' });
    expect(res.body.booking).toMatchObject({ status: 'PROVIDER_SEARCHING', workerId: null });

    expect((await get('/pet/bookings/available', as(approved._id, 'worker'))).body.bookings).toHaveLength(0);
    expect((await get('/pet/bookings/available', as(other._id, 'worker'))).body.bookings).toHaveLength(1);
    expect((await post(`/pet/bookings/${insertedId}/accept`, as(other._id, 'worker'))).body.booking.status).toBe('PROVIDER_ACCEPTED');
  });

  test('an offer nobody answers goes back to the pool', async () => {
    const late = new Date(Date.now() - (bookingService.ASSIGNMENT_WINDOW_MIN + 1) * 60000);
    const { insertedId } = await openPet({ status: 'PROVIDER_ASSIGNED', workerId: approved._id, assignedAt: late });
    await openPet({ status: 'PROVIDER_ASSIGNED', workerId: other._id, assignedAt: new Date() });
    expect(await bookingService.releaseStaleAssignments()).toBe(1);
    expect((await PetBooking.findById(insertedId).lean()).status).toBe('PROVIDER_SEARCHING');
  });

  test('the assigned provider never sees the handover code', async () => {
    const { insertedId } = await openPet({ status: 'PROVIDER_ACCEPTED', workerId: approved._id });
    const res = await get(`/pet/bookings/${insertedId}`, as(approved._id, 'worker'));
    expect(res.status).toBe(200);
    expect(res.body.booking).not.toHaveProperty('handoverOtp');
  });
});

describe('open helping tasks', () => {
  const openTask = (serviceType) => HelpingTask.collection.insertOne({
    reference: `ZH${Math.random().toString(36).slice(2, 8)}`, userId: customer, serviceType, status: 'CONFIRMED', workerId: null,
    pickupLocation: HOME, items: [], statusHistory: [{ status: 'CONFIRMED', at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
  });

  test('only services the helper is approved for are shown and takeable', async () => {
    const shopping = await openTask('shopping');
    const ret = await openTask('return');
    const list = await get('/helping/tasks/available', as(approved._id, 'worker'));
    expect(list.body.tasks.map((t) => String(t._id))).toEqual([String(shopping.insertedId)]);
    expect((await post(`/helping/tasks/${ret.insertedId}/accept`, as(approved._id, 'worker'))).status).toBe(403);
    expect((await post(`/helping/tasks/${shopping.insertedId}/accept`, as(approved._id, 'worker'))).body.task.status).toBe('WORKER_ACCEPTED');
  });

  test('an unverified helper sees nothing', async () => {
    await openTask('shopping');
    expect((await get('/helping/tasks/available', as(unverified._id, 'worker'))).body).toMatchObject({ tasks: [], notApproved: true });
  });
});
