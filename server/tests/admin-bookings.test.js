/**
 * Admin → Bookings: one list across every engine, and platform cancellations
 * that never charge the customer.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const User = require('../src/modules/user/user.model');
const Order = require('../src/modules/order/order.model');
const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { ServiceLine } = require('../src/modules/onboarding/onboarding.model');
const petService = require('../src/modules/pet/services/booking.service');
const { PetBooking } = require('../src/modules/pet/models/booking.model');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/admin', require('../src/modules/admin-portal/admin-portal.routes'));
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, code: err.code }));

let customer;
beforeAll(async () => {
  await startMongo();
  customer = await User.create({ phone: '9876500001', name: 'Priya' });
  await ServiceLine.create({ code: 'mobile_repair', name: 'Mobile Repair', domainCode: 'electronics', repairVertical: 'mobile', status: 'live' });
  const repair = (reference, status) => RepairBooking.create({
    reference, vertical: 'mobile', userId: customer._id, status, paymentMethod: 'cash',
    brandCode: 'samsung', modelCode: 'galaxy-s24', problemCodes: ['screen_cracked'], serviceMode: 'doorstep',
    location: { address: 'Madhapur', coordinates: [78.39, 17.45] },
    priceSnapshot: { subtotalPaise: 150000, totalPaise: 150000, commissionPaise: 15000 },
  });
  await repair('ZRACTIVE1', 'CONFIRMED');
  await repair('ZRDONE01', 'COMPLETED');
});
afterAll(stopMongo);

test('the list merges engines, names services from the catalog, and attaches the customer', async () => {
  const res = await request(app).get('/admin/bookings').query({ source: 'repair' });
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(2);
  expect(res.body.rows[0]).toMatchObject({ source: 'repair', serviceName: 'Mobile Repair', customer: { name: 'Priya' } });
});

test('the status filter runs in the database', async () => {
  const res = await request(app).get('/admin/bookings').query({ bucket: 'completed' });
  expect(res.body.rows.map((r) => r.reference)).toEqual(['ZRDONE01']);
});

test('search finds a booking by reference or by the customer phone', async () => {
  const byRef = await request(app).get('/admin/bookings').query({ q: 'zractive' });
  expect(byRef.body.rows.map((r) => r.reference)).toEqual(['ZRACTIVE1']);
  const byPhone = await request(app).get('/admin/bookings').query({ q: '98765 00001' });
  expect(byPhone.body.total).toBe(2);
});

test('detail offers cancel only while active, and refund only for captured online payments', async () => {
  const active = await RepairBooking.findOne({ reference: 'ZRACTIVE1' });
  const res = await request(app).get(`/admin/bookings/repair/${active._id}`);
  expect(res.body.actions).toMatchObject({ cancel: true, refund: false });

  const cashOrder = await Order.collection.insertOne({
    userId: customer._id, service: 'plumbing', status: 'completed', createdAt: new Date(),
    payment: { method: 'cash', status: 'paid' }, pricing: { total: 500 },
  });
  const cash = await request(app).get(`/admin/bookings/order/${cashOrder.insertedId}`);
  expect(cash.body.actions).toMatchObject({ cancel: false, refund: false });
});

test('an admin cancelling a pet booking never costs the customer', async () => {
  const b = await PetBooking.collection.insertOne({
    reference: 'ZPTEST1', userId: customer._id, categoryCode: 'pet_grooming', status: 'BOOKED', serviceMode: 'doorstep',
    pricing: { totalPaise: 90000 }, pets: [], statusHistory: [], createdAt: new Date(),
  });
  const out = await petService.cancelBooking({ bookingId: b.insertedId, actorId: new mongoose.Types.ObjectId(), by: 'admin', reason: 'Provider unavailable' });
  expect(out).toMatchObject({ refundPaise: 90000, penaltyPaise: 0, tier: 'platform_cancelled' });
  expect(out.booking.cancelledBy).toBe('admin');
});
