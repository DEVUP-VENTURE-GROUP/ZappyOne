/**
 * Creates all required indexes. Idempotent — safe to run on every deploy.
 * Run: node scripts/create-indexes.js
 */
require('dotenv').config();
const { connectMongo } = require('../src/config/mongo');
const Worker = require('../src/modules/worker/worker.model');
const Order = require('../src/modules/order/order.model');
const User = require('../src/modules/user/user.model');
const logger = require('../src/core/logger');

(async () => {
  await connectMongo();
  logger.info('Creating indexes…');

  await Promise.all([
    Worker.syncIndexes(),
    Order.syncIndexes(),
    User.syncIndexes(),
  ]);

  const workerIdx = await Worker.collection.indexes();
  const orderIdx = await Order.collection.indexes();
  logger.info({ workerIdx: workerIdx.map((i) => i.name) }, 'Worker indexes');
  logger.info({ orderIdx: orderIdx.map((i) => i.name) }, 'Order indexes');

  process.exit(0);
})().catch((err) => {
  logger.error({ err }, 'Index creation failed');
  process.exit(1);
});
