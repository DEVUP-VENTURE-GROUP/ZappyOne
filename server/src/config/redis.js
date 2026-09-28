const IORedis = require('ioredis');
const config = require('./index');
const logger = require('../core/logger');

// Main client for app operations (caching, GEO, pub/sub).
const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

// BullMQ requires maxRetriesPerRequest: null. Use a dedicated connection factory.
const createBullConnection = () =>
  new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

// Separate pub/sub pair for Socket.io Redis adapter.
const createPubSubPair = () => ({
  pubClient: new IORedis(config.redis.url),
  subClient: new IORedis(config.redis.url),
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

module.exports = { redis, createBullConnection, createPubSubPair };
