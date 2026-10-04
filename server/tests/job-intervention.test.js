/**
 * Ops stepping into a live job:
 *   - candidates are only providers verified for the service, nearest first, the current one marked
 *   - assigning offers the job (status + history with the reason); moving it tells the old provider
 *   - refused: unverified providers, no reason, and jobs already under way at the customer's
 *   - notes are kept per job
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);

let svc; let PetBooking; let Worker; let ProviderEnrolment;
const ids = { a: new mongoose.Types.ObjectId(), b: new mongoose.Types.ObjectId(), stranger: new mongoose.Types.ObjectId() };

beforeAll(async () => {
  await startMongo();
  svc = require('../src/modules/jobs/intervention.service');
  ({ PetBooking } = require('../src/modules/pet/models/booking.model'));
  Worker = require('../src/modules/worker/worker.model');
  ({ ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model'));
  const near = { type: 'Point', coordinates: [78.39, 17.45] };
  const far = { type: 'Point', coordinates: [78.55, 17.40] };
  await Worker.collection.insertMany([
    { _id: ids.a, name: 'Near Pro', phone: '9000070001', isOnline: true, currentLocation: near, rating: 4.6, reviewCount: 3 },
    { _id: ids.b, name: 'Far Pro', phone: '9000070002', isOnline: true, currentLocation: far },
    { _id: ids.stranger, name: 'Not verified', phone: '9000070003', isOnline: true, currentLocation: near },
  ]);
  await ProviderEnrolment.collection.insertMany([ids.a, ids.b].map((workerId) => ({
    providerKind: 'individual', workerId, shopId: null, domainCode: 'pet_services', lineCode: 'pet_grooming', status: 'approved',
  })));
});
afterAll(stopMongo);

async function booking(status = 'BOOKED') {
  const r = await PetBooking.collection.insertOne({
    userId: new mongoose.Types.ObjectId(), reference: `PET-${Date.now()}`, categoryCode: 'pet_grooming', status,
    serviceLocation: { type: 'Point', coordinates: [78.391, 17.449], address: 'Flat 4, Madhapur, Hyderabad' },
    statusHistory: [], pets: [], pricing: {}, execution: {}, createdAt: new Date(), updatedAt: new Date(),
  });
  return r.insertedId;
}

test('candidates: verified only, nearest first', async () => {
  const id = await booking();
  const out = await svc.candidates('pet', id);
  expect(out.assignable).toBe(true);
  expect(out.providers.map((p) => p.name)).toEqual(['Near Pro', 'Far Pro']);
  expect(out.providers[0]).toMatchObject({ rating: 4.6, online: true });
  expect(out.providers[1].rating).toBeNull();
});

test('assign offers the job with the reason recorded; moving it switches provider', async () => {
  const id = await booking();
  await svc.assign({ kind: 'pet', id, providerKind: 'worker', providerId: String(ids.a), reason: 'Customer called, urgent', adminId: new mongoose.Types.ObjectId() });
  let doc = await PetBooking.findById(id).lean();
  expect(doc).toMatchObject({ status: 'PROVIDER_ASSIGNED' });
  expect(String(doc.workerId)).toBe(String(ids.a));
  expect(doc.assignedAt).toBeTruthy();
  expect(doc.statusHistory.at(-1)).toMatchObject({ byRole: 'admin', note: 'Ops: Customer called, urgent' });

  await svc.assign({ kind: 'pet', id, providerKind: 'worker', providerId: String(ids.b), reason: 'First pro not answering' });
  doc = await PetBooking.findById(id).lean();
  expect(String(doc.workerId)).toBe(String(ids.b));
  expect((await svc.candidates('pet', id)).providers.find((p) => p.current).name).toBe('Far Pro');
});

test('refused: unverified provider, no reason, job already started', async () => {
  const id = await booking();
  await expect(svc.assign({ kind: 'pet', id, providerKind: 'worker', providerId: String(ids.stranger), reason: 'Try this one' }))
    .rejects.toMatchObject({ code: 'NOT_VERIFIED' });
  await expect(svc.assign({ kind: 'pet', id, providerKind: 'worker', providerId: String(ids.a), reason: 'x' }))
    .rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  const started = await booking('SERVICE_STARTED');
  await expect(svc.assign({ kind: 'pet', id: started, providerKind: 'worker', providerId: String(ids.a), reason: 'Move it please' }))
    .rejects.toMatchObject({ code: 'TOO_LATE' });
});

test('notes are kept per job, newest first', async () => {
  const id = await booking();
  await svc.addNote({ kind: 'pet', id, text: 'Customer prefers a woman groomer' });
  await svc.addNote({ kind: 'pet', id, text: 'Called at 4pm, rescheduled' });
  const notes = await svc.listNotes('pet', id);
  expect(notes.map((n) => n.text)).toEqual(['Called at 4pm, rescheduled', 'Customer prefers a woman groomer']);
});
