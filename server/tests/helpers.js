/**
 * Shared test helpers.
 *
 * Uses:
 *   - mongodb-memory-server → real MongoDB semantics, no external service
 *   - ioredis-mock         → in-process Redis that supports all the commands
 *                            we use (GEO, scripts, pub/sub, SET NX EX)
 *
 * NOTE on transactions: mongodb-memory-server's standalone doesn't support
 * multi-doc transactions. To test the Mongo txn path specifically, you'd
 * start a replica set via `MongoMemoryReplSet`. We keep the default here
 * because most tests don't need transactions; the transaction code path
 * is exercised via higher-level harnesses in integration environments.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Redis is the in-process mock for every test file (tests/mock-redis.js, a jest setup file).

// Disable BullMQ interactions during unit tests — the queues are mocked.
// The queues live in `src/jobs` (they moved from the old `src/queues` path,
// which is why this mock — and the whole suite — silently stopped running).
// The shape mirrors `src/jobs/index.js`'s real exports.
jest.mock('../src/jobs', () => {
  const q = () => ({ add: jest.fn().mockResolvedValue({ id: 'mock' }), getJob: jest.fn().mockResolvedValue(null) });
  const ev = () => ({ on: jest.fn(), off: jest.fn() });
  return {
    QUEUES: {
      DISPATCH: 'dispatch', DISPATCH_EMERGENCY: 'dispatch-emergency',
      NOTIFICATIONS: 'notifications', PAYMENTS: 'payments', DLQ: 'dlq', SHIELD: 'shield',
    },
    dispatchQueue: q(), emergencyDispatchQueue: q(), notificationsQueue: q(),
    paymentsQueue: q(), dlqQueue: q(), shieldQueue: q(),
    dispatchEvents: ev(), emergencyDispatchEvents: ev(),
  };
});

async function startMongo() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

async function stopMongo() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/**
 * Stand in for the customer reading their handover codes out.
 *
 * A repair cannot move a device without the owner's code — that is the point of
 * the gate, and `repair-journey-full.test.js` exercises it properly by issuing
 * and verifying each one. Suites whose subject is settlement, SLA or dispatch
 * should not have to re-enact that conversation to reach COMPLETED; they say
 * "the codes were given" in one line and get on with what they are testing.
 *
 * Deliberately marks the VERIFIED timestamps rather than bypassing the gate, so
 * it proves the same thing a real handover proves and no test can reach a state
 * the product cannot.
 */
async function passHandoverGates(bookingId) {
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  const at = new Date();
  await RepairBooking.updateOne(
    { _id: bookingId },
    { $set: { 'otpVerified.startAt': at, 'otpVerified.handoverAt': at, 'otpVerified.returnAt': at } },
  );
}

/**
 * A signed-in admin that really exists — admin routes check the account, not just the token.
 * Defaults to super_admin; pass a role to test what that role may do.
 */
async function adminToken(role = 'super_admin') {
  const Admin = require('../src/modules/admin/admin.model');
  const { signAccessToken } = require('../src/modules/auth/token.service');
  const admin = await Admin.create({
    email: `${role}-${new mongoose.Types.ObjectId()}@test.local`, name: `Test ${role}`, passwordHash: 'x', role,
  });
  return signAccessToken({ sub: String(admin._id), role: 'admin', email: admin.email });
}

module.exports = { startMongo, stopMongo, resetDb, passHandoverGates, adminToken };
