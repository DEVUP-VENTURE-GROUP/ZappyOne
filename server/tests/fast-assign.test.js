/**
 * Assigned within two minutes (jobs/fast-assign).
 *
 *   - a repair offered to several pros at once goes to the first to claim it;
 *     the rest are told it is taken, and a pro it was never offered to is refused
 *   - a pro with auto-accept on, nearby and free, takes a job with no tap
 *   - a paused auto-accept, or a pro too far for their own limit, is skipped
 *   - giving back an auto-accepted job pauses that pro's auto-accept
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

describe('auto-accept', () => {
  test('the nearest free pro with auto-accept on takes the job with no tap', async () => {
    const near = await pro({ km: 1, autoAccept: { enabled: true } });
    const far = await pro({ km: 3, autoAccept: { enabled: true } });
    const off = await pro({ km: 0.5 });
    await Promise.all([near, far, off].map((w) => enrol(w, 'pet_grooming', 'pet_services')));

    const job = await openPet();
    const who = await fastAssign.tryAutoAccept('pet', job, 5);
    expect(who).toMatchObject({ kind: 'worker', id: String(near._id) });
    const after = await PetBooking.findById(job._id).lean();
    expect(String(after.workerId)).toBe(String(near._id));
    expect(after.matching.autoAcceptedAt).toBeTruthy();
  });

  test('skips a paused pro and one beyond their own distance limit', async () => {
    await Worker.updateMany({}, { $set: { 'autoAccept.enabled': false } });
    const paused = await pro({ km: 0.5, autoAccept: { enabled: true, pausedUntil: new Date(Date.now() + 86400000) } });
    const limited = await pro({ km: 4, autoAccept: { enabled: true, maxKm: 2 } });
    await Promise.all([paused, limited].map((w) => enrol(w, 'pet_grooming', 'pet_services')));

    const job = await openPet();
    expect(await fastAssign.tryAutoAccept('pet', job, 5)).toBeNull();
    expect((await PetBooking.findById(job._id).lean()).workerId).toBeNull();
  });

  test('giving back an auto-accepted job pauses that pro auto-accept', async () => {
    const w = await pro({ autoAccept: { enabled: true } });
    expect(await fastAssign.pauseIfAutoAccepted({ matching: { autoAcceptedAt: new Date() } }, 'worker', w._id)).toBe(true);
    const after = await Worker.findById(w._id).lean();
    expect(after.autoAccept.pausedUntil.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
    // A job they tapped themselves never pauses it.
    expect(await fastAssign.pauseIfAutoAccepted({ matching: {} }, 'worker', w._id)).toBe(false);
  });
});

describe('the auto-accept switch', () => {
  const put = (w, body) => request(app).put('/api/workers/me/auto-accept').set('Authorization', `Bearer ${as(w._id)}`).send(body);

  test('a worker turns it on, sets a limit, and reads it back', async () => {
    const w = await pro();
    const on = await put(w, { enabled: true, maxKm: 3 });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ available: true, autoAccept: { enabled: true, maxKm: 3 } });
    const read = await request(app).get('/api/workers/me/auto-accept').set('Authorization', `Bearer ${as(w._id)}`);
    expect(read.body.radiusKm).toBe(5);
  });

  test('a shop technician cannot turn it on: their shop gives them work', async () => {
    const tech = await pro();
    await Worker.updateOne({ _id: tech._id }, { $set: { shopId: oid() } });
    const res = await put(tech, { enabled: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTO_ACCEPT_UNAVAILABLE');
  });
});

describe('the customer search clock', () => {
  test('counts from booking, and is gone once someone has the job or it is for later', async () => {
    const job = await openPet();
    const view = await fastAssign.searchView('pet', job);
    expect(view).toMatchObject({ firstLookSec: 30, broadcastSec: 45, deadlineSec: 120 });
    expect(await fastAssign.searchView('pet', { ...job, workerId: oid() })).toBeNull();
    expect(await fastAssign.searchView('pet', { ...job, scheduledAt: new Date(Date.now() + 3600000) })).toBeNull();
  });
});
