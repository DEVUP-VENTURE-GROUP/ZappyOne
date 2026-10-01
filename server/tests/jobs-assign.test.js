/**
 * A shop's job, any kind: the owner names which of their technicians goes, and
 * nobody sets off unnamed (jobs/assignment.js).
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const Worker = require('../src/modules/worker/worker.model');
const { assignTechnician, assertSomeoneTravels } = require('../src/modules/jobs/assignment');

jest.setTimeout(60000);
const oid = () => new mongoose.Types.ObjectId();
const HOME = { type: 'Point', coordinates: [78.39, 17.44], address: 'Madhapur' };

beforeAll(startMongo);
afterAll(stopMongo);

test('a shop puts its own technician on a pet job, and no one else\'s', async () => {
  const shopId = oid();
  const mine = await Worker.collection.insertOne({ name: 'Ravi', phone: '9000000501', shopId });
  const theirs = await Worker.collection.insertOne({ name: 'Other', phone: '9000000502', shopId: oid() });
  const { insertedId: jobId } = await PetBooking.collection.insertOne({
    reference: 'PB-ASSIGN-1', userId: oid(), shopId, workerId: null, status: 'PROVIDER_ACCEPTED', serviceMode: 'home_visit', serviceLocation: HOME,
  });

  await expect(assignTechnician({ jobId, shopId, workerId: theirs.insertedId }))
    .rejects.toMatchObject({ code: 'NOT_YOUR_WORKER' });
  await expect(assignTechnician({ jobId, shopId: oid(), workerId: mine.insertedId }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });

  const res = await assignTechnician({ jobId, shopId, workerId: mine.insertedId });
  expect(res.kind).toBe('pet');
  expect(String((await PetBooking.findById(jobId).lean()).workerId)).toBe(String(mine.insertedId));
});

test('a shop pet job cannot head out unnamed; a stay at the shop needs no one named', () => {
  const unnamed = { shopId: oid(), workerId: null, status: 'PROVIDER_ACCEPTED', serviceMode: 'home_visit', serviceLocation: HOME };
  expect(() => assertSomeoneTravels('pet', unnamed, 'PROVIDER_EN_ROUTE')).toThrow(expect.objectContaining({ code: 'ASSIGN_TECHNICIAN_FIRST' }));
  // Boarding at the shop: starting the service is not a trip.
  expect(() => assertSomeoneTravels('pet', { ...unnamed, serviceMode: 'boarding' }, 'SERVICE_STARTED')).not.toThrow();
  // An independent pro is the traveller themselves.
  expect(() => assertSomeoneTravels('pet', { ...unnamed, shopId: null, workerId: oid() }, 'PROVIDER_EN_ROUTE')).not.toThrow();
});

test('a shop sees what every kind of job earned it, its own and its technicians\'', async () => {
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const { getShopEarnings } = require('../src/modules/shop/shop.service');
  const shopId = oid();
  const tech = await Worker.collection.insertOne({ name: 'Asha', phone: '9000000503', shopId });
  const now = new Date();
  await RepairBooking.collection.insertOne({
    reference: 'RB-EARN-1', userId: oid(), shopId, status: 'COMPLETED', completedAt: now, paymentMethod: 'cash',
    priceSnapshot: { totalPaise: 100000, commissionPaise: 10000 },
  });
  await PetBooking.collection.insertOne({
    reference: 'PB-EARN-1', userId: oid(), shopId, workerId: tech.insertedId, status: 'PAYMENT_COMPLETED', paymentMethod: 'online',
    pricing: { providerAmountPaise: 50000 }, execution: { completedAt: now },
  });

  const today = await getShopEarnings(String(shopId), 'today');
  expect(today.jobs).toBe(2);
  expect(today.earningsPaise).toBe(90000 + 50000);
  expect(today.breakdown.pet).toEqual({ jobs: 1, earningsPaise: 50000 });
  expect(today.dailyBreakdown.reduce((s, d) => s + d.earningsPaise, 0)).toBe(140000);
});
