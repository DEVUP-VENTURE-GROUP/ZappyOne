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

// A provider's own live price for a job: every provider sets theirs, and nothing stands in for a missing one.
async function ownPrice(owner, { vertical = 'mobile', repairCode, totalPaise, brandCode = null }) {
  const { ProviderPricing } = require('../src/modules/repair/models/pricing.model');
  return ProviderPricing.create({ ...owner, vertical, repairCode, brandCode, totalPaise, approvalStatus: 'auto_approved' });
}

// A verified shop covering a spot with its own price, so a booking any provider may take has a price near the customer.
// A photo of the finished work on a repair, as a pro saves it before moving past QA (repair lifecycle PHOTO_REQUIRED).
async function withProof(bookingId) {
  const { RepairBooking } = require('../src/modules/repair/models/booking.model');
  await RepairBooking.updateOne({ _id: bookingId }, { $set: { completionPhotos: ['order-proof/after.jpg'] } });
}

async function pricedShopNear({ lng, lat, vertical = 'mobile', lineCode = 'mobile_repair', domainCode = 'electronics', repairCode, totalPaise, phone = `9${Math.floor(100000000 + Math.random() * 899999999)}` }) {
  const Shop = require('../src/modules/shop/shop.model');
  const { ProviderServiceArea } = require('../src/modules/repair/models/config.model');
  const { ProviderEnrolment, ServiceLine } = require('../src/modules/onboarding/onboarding.model');
  await ServiceLine.updateOne({ code: lineCode }, { $setOnInsert: { code: lineCode, name: lineCode, domainCode, repairVertical: vertical, status: 'live' } }, { upsert: true });
  const shop = await Shop.create({ businessName: 'Nearby Pricer', ownerName: 'Owner', phone, isActive: true, kyc: { status: 'approved' } });
  await ProviderEnrolment.create({ providerKind: 'shop', shopId: shop._id, domainCode, lineCode, status: 'approved' });
  await ProviderServiceArea.create({ shopId: shop._id, cityCode: 'hyderabad', center: { type: 'Point', coordinates: [lng, lat] }, radiusKm: 15, serviceModes: ['doorstep', 'workshop', 'pickup_repair'] });
  await ownPrice({ shopId: shop._id }, { vertical, repairCode, totalPaise });
  // Saving a job on a menu records the capability with the price (provider-menu saveItem); matching needs both.
  const { ProviderCapability } = require('../src/modules/repair/models/capability.model');
  await ProviderCapability.updateOne({ shopId: shop._id, repairCode }, { $set: { vertical, isActive: true }, $setOnInsert: { shopId: shop._id, repairCode } }, { upsert: true });
  return shop;
}

// An approved helper next to `at` for these errands, so a task can be booked (the fare is ZappyOne's runner fare, whoever takes it).
async function ratedHelper({ serviceTypes, at = [78.4867, 17.385] }) {
  const { ProviderEnrolment } = require('../src/modules/onboarding/onboarding.model');
  const { KINDS } = require('../src/modules/jobs/kinds');
  const workerId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('workers').insertOne({ _id: workerId, name: 'Rated Helper', phone: `96${String(Date.now()).slice(-8)}`, currentLocation: { type: 'Point', coordinates: at } });
  for (const serviceType of serviceTypes) {
    const lineCode = await KINDS.helping.line({ serviceType });
    if (lineCode) await ProviderEnrolment.updateOne({ workerId, lineCode }, { $setOnInsert: { providerKind: 'individual', workerId, domainCode: 'family_assist', lineCode, status: 'approved' } }, { upsert: true });
  }
  return workerId;
}

module.exports = { withProof, startMongo, stopMongo, resetDb, passHandoverGates, adminToken, ownPrice, pricedShopNear, ratedHelper };
