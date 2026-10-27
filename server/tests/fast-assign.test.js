/**
 * Assigned within three minutes (jobs/fast-assign).
 *
 *   - a repair offered to several pros at once goes to the first to claim it;
 *     the rest are told it is taken, and a pro it was never offered to is refused
 *   - nobody is given a job instantly; at the auto-assign time a nearby free
 *     pro is given it, never one who passed or a shop's technician
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const { Repair } = require('../src/modules/repair/models/repair.model');
const { ZappyReferencePricing } = require('../src/modules/repair/models/pricing.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const { ProviderEnrolment, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const Worker = require('../src/modules/worker/worker.model');
const bookingService = require('../src/modules/repair/services/booking.service');
const fastAssign = require('../src/modules/jobs/fast-assign');

jest.setTimeout(90000);

let app;
const oid = () => new mongoose.Types.ObjectId();
const customer = oid();
const HOME = { type: 'Point', coordinates: [78.3915, 17.4483], address: 'Madhapur' };
const as = (id) => signAccessToken({ sub: String(id), role: 'worker' });
const claim = (id, w) => request(app).post(`/api/repair/bookings/${id}/claim`).set('Authorization', `Bearer ${as(w._id)}`).send({});

let n = 0;
async function pro({ km = 1, autoAccept = null } = {}) {
  n += 1;
  return Worker.create({
    name: `Pro ${n}`, phone: `90000005${String(n).padStart(2, '0')}`, kyc: { status: 'approved' },
    isOnline: true, lastSeenAt: new Date(),
    currentLocation: { type: 'Point', coordinates: [78.3915, 17.4483 + km / 111] },
    ...(autoAccept ? { autoAccept } : {}),
  });
}
const enrol = (w, lineCode, domainCode) => ProviderEnrolment.create({ providerKind: 'individual', workerId: w._id, domainCode, lineCode, status: 'approved' });

async function openRepair(key) {
  const { booking } = await bookingService.createBooking({
    userId: customer, brandCode: 'samsung', modelCode: 'samsung-s23', repairCode: 'battery_replacement',
    serviceMode: 'doorstep', location: { coordinates: HOME.coordinates, address: HOME.address }, idempotencyKey: key,
  });
  // Shape it as an open job (no one holding it), whatever dispatch did.
  await RepairBooking.updateOne({ _id: booking._id }, { $set: { status: 'CONFIRMED', workerId: null, shopId: null } });
  return RepairBooking.findById(booking._id);
}

async function openPet() {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `ZP${Math.random().toString(36).slice(2, 8)}`, userId: customer, categoryCode: 'pet_grooming', serviceMode: 'doorstep',
    status: 'BOOKED', workerId: null, shopId: null, declinedBy: [], serviceLocation: HOME, handoverOtp: '4321',
    pets: [{ petId: oid(), variantCode: 'pg_full_grooming', snapshot: { name: 'Bruno', species: 'dog', size: 'medium' } }],
    pricing: { totalPaise: 60000, providerAmountPaise: 50000 }, statusHistory: [{ status: 'BOOKED', at: new Date() }], createdAt: new Date(), updatedAt: new Date(),
  });
  return PetBooking.findById(insertedId).lean();
}

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  await Promise.all([PetBooking.init(), Worker.init()]);
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'electronics', repairVertical: 'mobile', status: 'live' });
  await RepairConfig.create({ vertical: 'mobile' });
  await Repair.create({
    code: 'battery_replacement', name: 'Battery Replacement', vertical: 'mobile',
    pricingMode: 'fixed', minSkillLevel: 1, allowedServiceModes: ['doorstep'], warrantyDays: 180,
  });
  await ZappyReferencePricing.create({ vertical: 'mobile', repairCode: 'battery_replacement', minPaise: 150000, recommendedPaise: 200000, maxPaise: 300000 });
});
afterAll(stopMongo);

describe('a repair broadcast to several pros', () => {
  test('the first to claim it takes it; the second is told it is gone', async () => {
    const [a, b] = [await pro(), await pro()];
    await Promise.all([enrol(a, 'mobile_repair', 'electronics'), enrol(b, 'mobile_repair', 'electronics')]);
    const job = await openRepair('fa-1');
    await RepairBooking.updateOne({ _id: job._id }, { $set: { 'matching.offeredTo': [`worker:${a._id}`, `worker:${b._id}`] } });

    const first = await claim(job._id, a);
    expect(first.status).toBe(200);
    expect(first.body.booking.status).toBe('WORKER_ACCEPTED');
    expect(String(first.body.booking.workerId)).toBe(String(a._id));

    const second = await claim(job._id, b);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ALREADY_CLAIMED');
    expect((await RepairBooking.findById(job._id).lean()).matching.claimedAt).toBeTruthy();
  });

  test('a pro it was never offered to cannot take it', async () => {
    const c = await pro();
    await enrol(c, 'mobile_repair', 'electronics');
    const job = await openRepair('fa-2');
    const res = await claim(job._id, c);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_OFFERED');
  });

  test('a pro not verified for the service cannot take it, even if offered', async () => {
    const d = await pro();
    const job = await openRepair('fa-3');
    await RepairBooking.updateOne({ _id: job._id }, { $set: { 'matching.offeredTo': [`worker:${d._id}`] } });
    expect((await claim(job._id, d)).status).toBe(403);
  });
});

describe('auto-assign', () => {
  test('nobody is given a job instantly, even with the old auto-accept switch on', async () => {
    const w = await pro({ km: 0.5, autoAccept: { enabled: true } });
    await enrol(w, 'pet_grooming', 'pet_services');
    const job = await openPet();
    await require('../src/modules/jobs/waves').kick('pet', job);
    expect((await PetBooking.findById(job._id).lean()).workerId).toBeNull();
  });

  test('when nobody accepted in time, a nearby free pro is given it; one who passed and a shop technician are skipped', async () => {
    await Worker.updateMany({}, { $set: { isBlocked: true } });
    const passed = await pro({ km: 0.3 });
    const tech = await pro({ km: 0.4 });
    await Worker.updateOne({ _id: tech._id }, { $set: { shopId: oid() } });
    const free = await pro({ km: 2 });
    await Promise.all([passed, tech, free].map((w) => enrol(w, 'pet_grooming', 'pet_services')));

    const job = await openPet();
    await PetBooking.updateOne({ _id: job._id }, { $set: { declinedBy: [passed._id] } });
    const who = await fastAssign.autoAssign('pet', await PetBooking.findById(job._id).lean(), 15);
    expect(who).toMatchObject({ kind: 'worker', id: String(free._id) });
    const after = await PetBooking.findById(job._id).lean();
    expect(String(after.workerId)).toBe(String(free._id));
    expect(after.matching.autoAcceptedBy).toBe(`worker:${free._id}`);
  });

  test('nobody free nearby: nothing is assigned', async () => {
    await Worker.updateMany({}, { $set: { isBlocked: true } });
    const job = await openPet();
    expect(await fastAssign.autoAssign('pet', job, 15)).toBeNull();
  });
});

describe('the retired auto-accept switch', () => {
  test('is hidden and cannot be turned on', async () => {
    const w = await pro();
    const read = await request(app).get('/api/workers/me/auto-accept').set('Authorization', `Bearer ${as(w._id)}`);
    expect(read.body.available).toBe(false);
    const res = await request(app).put('/api/workers/me/auto-accept').set('Authorization', `Bearer ${as(w._id)}`).send({ enabled: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTO_ACCEPT_UNAVAILABLE');
  });
});

describe('the customer search clock', () => {
  test('counts from booking, and is gone once someone has the job or it is for later', async () => {
    const job = await openPet();
    const view = await fastAssign.searchView('pet', job);
    expect(view).toMatchObject({ firstLookSec: 30, broadcastSec: 45, deadlineSec: 180 });
    expect(await fastAssign.searchView('pet', { ...job, workerId: oid() })).toBeNull();
    expect(await fastAssign.searchView('pet', { ...job, scheduledAt: new Date(Date.now() + 3600000) })).toBeNull();
  });
});
