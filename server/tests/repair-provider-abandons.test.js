/**
 * When a provider backs out, the customer's job must not die with it.
 *
 * Reported from production: a shop cancelled and the booking simply ended. The
 * customer had done nothing wrong, still needed their device fixed, and was
 * sent back to the first screen to re-enter their device, their fault and their
 * address — while Zappy had other providers sitting idle nearby.
 *
 * A provider cancelling is a SUPPLY failure. The platform's whole job at that
 * moment is to find other supply, which is exactly what already happened when a
 * provider declined an offer or let one time out. Cancelling was the one path
 * that gave up.
 *
 * The line that matters is CUSTODY: up to arrival nothing has changed hands and
 * anyone can take the work; once the device is collected or opened, handing the
 * booking to someone else is meaningless and it really is a cancellation.
 */

const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

const { RepairBooking } = require('../src/modules/repair/models/booking.model');
const { RepairConfig } = require('../src/modules/repair/models/config.model');
const bookingService = require('../src/modules/repair/services/booking.service');

jest.setTimeout(60000);

beforeAll(async () => {
  await startMongo();
  await RepairConfig.create({ vertical: 'mobile' });
});
afterAll(async () => { await stopMongo(); });

const shopId = new mongoose.Types.ObjectId();

/** A booking already in a provider's hands, at a given stage. */
async function booking(status) {
  return RepairBooking.create({
    reference: `A${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    userId: new mongoose.Types.ObjectId(),
    vertical: 'mobile',
    brandCode: 'samsung', modelCode: 'samsung-s23', serviceMode: 'doorstep',
    shopId,
    status,
    location: { type: 'Point', coordinates: [78.4, 17.4], address: 'Test' },
    priceSnapshot: { subtotalPaise: 100000, totalPaise: 118000 },
    statusHistory: [{ status, at: new Date() }],
  });
}

describe('a provider abandoning a job it has not yet taken custody of', () => {
  it.each(['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'PICKUP_SCHEDULED'])(
    'releases it back to the pool from %s instead of cancelling',
    async (status) => {
      const b = await booking(status);
      const result = await bookingService.releaseToPool({
        bookingId: b._id, actorRole: 'shop', actorId: shopId, reason: 'too busy',
      });

      expect(result.released).toBe(true);
      // Alive and unassigned — ready for whoever is next.
      expect(result.booking.status).toBe('CONFIRMED');
      expect(result.booking.status).not.toBe('CANCELLED');
      expect(result.booking.shopId).toBeNull();
      expect(result.booking.workerId).toBeNull();
    },
  );

  it('records the abandonment against the provider who walked', async () => {
    const b = await booking('WORKER_ACCEPTED');
    const result = await bookingService.releaseToPool({
      bookingId: b._id, actorRole: 'shop', actorId: shopId, reason: 'van broke down',
    });

    // It has to be on the record: a provider who accepts and then abandons
    // costs the customer more than one who never accepted at all.
    expect(result.booking.declines).toHaveLength(1);
    expect(String(result.booking.declines[0].providerId)).toBe(String(shopId));
    expect(result.booking.declines[0].providerKind).toBe('shop');
    expect(result.booking.declines[0].reason).toBe('van broke down');
  });

  it('keeps the customer, the device and the price exactly as they were', async () => {
    const b = await booking('ON_THE_WAY');
    const result = await bookingService.releaseToPool({
      bookingId: b._id, actorRole: 'shop', actorId: shopId,
    });

    // The whole point: the customer does not re-enter anything.
    expect(String(result.booking.userId)).toBe(String(b.userId));
    expect(result.booking.modelCode).toBe('samsung-s23');
    expect(result.booking.reference).toBe(b.reference);
    expect(result.booking.priceSnapshot.totalPaise).toBe(118000);
    expect(result.booking.location.address).toBe('Test');
  });
});

describe('once the provider has the device, it is a real cancellation', () => {
  it.each(['DEVICE_PICKED_UP', 'AT_WORKSHOP', 'REPAIR_IN_PROGRESS', 'DIAGNOSING', 'QA_PENDING'])(
    'refuses to reassign from %s',
    async (status) => {
      const b = await booking(status);
      const result = await bookingService.releaseToPool({
        bookingId: b._id, actorRole: 'shop', actorId: shopId,
      });

      // Handing this to another provider would be a lie — the device is in the
      // first one's van.
      expect(result.released).toBe(false);
      // And nothing was disturbed on the way to finding that out.
      const after = await RepairBooking.findById(b._id).lean();
      expect(after.status).toBe(status);
      expect(String(after.shopId)).toBe(String(shopId));
    },
  );
});

describe('the custody boundary is explicit', () => {
  it('agrees with the state machine about which states are reassignable', () => {
    expect(bookingService.canReleaseToPool({ status: 'ARRIVED' })).toBe(true);
    expect(bookingService.canReleaseToPool({ status: 'DEVICE_PICKED_UP' })).toBe(false);
    expect(bookingService.canReleaseToPool({ status: 'COMPLETED' })).toBe(false);
    expect(bookingService.canReleaseToPool({ status: 'CANCELLED' })).toBe(false);
  });

  it('never lists a terminal state as reassignable', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'FAILED', 'REFUNDED']) {
      expect(bookingService.RELEASABLE_FROM).not.toContain(s);
    }
  });
});
