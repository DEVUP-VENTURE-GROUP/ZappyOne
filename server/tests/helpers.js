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
const IORedisMock = require('ioredis-mock');

let mongoServer;

// Monkey-patch the redis module BEFORE the app imports it.
// Every require('./config/redis') will see the mock.
jest.mock('../src/config/redis', () => {
  // `jest.mock` is hoisted above every import, so its factory must NOT close
  // over out-of-scope variables (the top-level `IORedisMock` const). Require it
  // inside the factory instead — otherwise Jest throws and no test can run.
  const Redis = require('ioredis-mock');
  const base = new Redis();
  // rate-limit-redis (and a few call sites) use the raw `redis.call('GET', ...)`
  // form, which ioredis-mock doesn't expose. Shim it onto the command methods so
  // the full app can construct under the mock.
  const withCall = (client) => {
    client.call = (cmd, ...args) => {
      const name = String(cmd).toLowerCase();
      // ioredis-mock has no Lua support; rate-limit-redis loads a script at
      // construction. Hand back a dummy sha so the store can build, and let the
      // limiter fail-open at request time (it already skips when Redis isn't
      // 'ready' / on store errors). Other unsupported commands degrade to null
      // rather than throwing, so building the full app never blows up in tests.
      if (name === 'script') return Promise.resolve('mock-sha');
      const fn = client[name];
      if (typeof fn !== 'function') return Promise.resolve(null);
      try { return Promise.resolve(fn.call(client, ...args)); }
      catch { return Promise.resolve(null); }
    };
    return client;
  };
  withCall(base);
  return {
    redis: base,
    createBullConnection: () => new Redis(),
    createPubSubPair: () => ({ pubClient: new Redis(), subClient: new Redis() }),
  };
});

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

module.exports = { startMongo, stopMongo, resetDb };
