/**
 * The customer must be offered a cancellation whenever one is actually allowed.
 *
 * Reported from production: a booking sitting at PICKUP_SCHEDULED showed no
 * cancel button at all. Nothing was broken server-side — the API would have
 * accepted the request happily. The tracking screen simply kept its OWN list of
 * cancellable statuses, and it had drifted from the real one:
 *
 *   server  … ARRIVED, DIAGNOSING, QUOTE_PENDING, CUSTOMER_APPROVAL_PENDING, PICKUP_SCHEDULED
 *   client  … ARRIVED,                            CUSTOMER_APPROVAL_PENDING
 *
 * Three states short. A customer whose device collection was booked had no way
 * to ask for something they were entitled to, and no explanation on screen.
 *
 * The permission is now stated by the server on the booking itself, so there is
 * nothing left to drift. These tests pin that: every state the machine will
 * accept a cancellation from must come back as `canCancel: true`, and every
 * state it will not must come back false.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const { signAccessToken } = require('../src/modules/auth/token.service');
const buildApp = require('../src/app');

const { RepairBooking, CANCELLABLE_FROM } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');

jest.setTimeout(60000);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ctx = {};
let app;

async function bookingAt(status) {
  return RepairBooking.create({
    reference: `C${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    userId: ctx.userId,
    vertical: 'mobile',
    brandCode: 'samsung', modelCode: 'samsung-galaxy-s23-ultra',
    serviceMode: 'pickup_repair',
    status,
    location: { type: 'Point', coordinates: [77.905, 17.343], address: 'Test' },
    priceSnapshot: { subtotalPaise: 70000, totalPaise: 70000 },
    statusHistory: [{ status, at: new Date() }],
  });
}

beforeAll(async () => {
  await startMongo();
  app = buildApp();
  await RepairConfig.create({ vertical: 'mobile' });
  ctx.userId = new mongoose.Types.ObjectId();
  ctx.token = signAccessToken({ sub: ctx.userId.toString(), role: 'user' });
});

afterAll(async () => { await stopMongo(); });

const get = (id) => request(app).get(`/api/repair/bookings/${id}`).set(auth(ctx.token));

describe('canCancel comes from the server', () => {
  it('offers a cancellation at PICKUP_SCHEDULED — the reported case', async () => {
    const b = await bookingAt('PICKUP_SCHEDULED');
    const res = await get(b._id);
    expect(res.status).toBe(200);
    expect(res.body.canCancel).toBe(true);
  });

  it.each(CANCELLABLE_FROM)('offers a cancellation at %s', async (status) => {
    const b = await bookingAt(status);
    expect((await get(b._id)).body.canCancel).toBe(true);
  });

  it.each(['DEVICE_PICKED_UP', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'QA_PENDING', 'COMPLETED', 'CANCELLED'])(
    'does NOT offer a cancellation at %s',
    async (status) => {
      const b = await bookingAt(status);
      expect((await get(b._id)).body.canCancel).toBe(false);
    },
  );

  it('agrees with what the state machine will actually accept', async () => {
    // The guarantee that matters: the button is shown exactly when the
    // transition would succeed. Anything else either hides a right the
    // customer has, or offers one the server will refuse.
    for (const status of CANCELLABLE_FROM) {
      const b = await bookingAt(status);
      const shown = (await get(b._id)).body.canCancel;
      const accepted = b.canTransition('CANCELLED');
      expect(shown).toBe(accepted);
    }
  });

  it('still refuses the transition itself from a non-cancellable state', async () => {
    const b = await bookingAt('REPAIR_IN_PROGRESS');
    expect(b.canTransition('CANCELLED')).toBe(false);
    expect((await get(b._id)).body.canCancel).toBe(false);
  });
});
