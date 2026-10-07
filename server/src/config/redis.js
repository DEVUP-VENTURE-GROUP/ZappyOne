const IORedis = require('ioredis');
const config = require('./index');
const logger = require('../core/logger');

/*
 * One Redis can be shared by more than one environment (a developer's API and
 * production did share one). Without a namespace, a local API's workers took
 * production's queued jobs and ran them against the wrong database, caches
 * crossed over, and every live event was relayed twice. With one, everything
 * this process stores or publishes sits under `<namespace>:`. Production has
 * no namespace, so its keys, queues and channels are exactly as before.
 */
const NS = String(config.redis.namespace || '').trim();
const P = NS ? `${NS}:` : '';
/** BullMQ's own key prefix: give it to every Queue, Worker and QueueEvents. */
const bullPrefix = NS ? `${NS}:bull` : 'bull';
/** Socket.io adapter channel key. */
const socketKey = NS ? `${NS}:socket.io` : 'socket.io';

/**
 * Publish and subscribe inside the namespace. Channel names in the code stay
 * as they are; messages arrive with the namespace taken off again. A no-op in
 * production.
 */
function scoped(client) {
  if (!P || client.__scoped) return client;
  client.__scoped = true;
  const strip = (ch) => (typeof ch === 'string' && ch.startsWith(P) ? ch.slice(P.length) : ch);
  const publish = client.publish.bind(client);
  client.publish = (ch, ...rest) => publish(P + ch, ...rest);
  for (const m of ['subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe']) {
    const orig = client[m].bind(client);
    client[m] = (...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const chans = args.flat().map((c) => P + c);
      return cb ? orig(...chans, cb) : orig(...chans);
    };
  }
  const on = client.on.bind(client);
  client.on = (ev, fn) => {
    if (ev === 'message') return on(ev, (ch, msg) => fn(strip(ch), msg));
    if (ev === 'pmessage') return on(ev, (pat, ch, msg) => fn(strip(pat), strip(ch), msg));
    return on(ev, fn);
  };
  client.addListener = client.on;
  const duplicate = client.duplicate.bind(client);
  client.duplicate = (...a) => scoped(duplicate(...a));
  // KEYS and SCAN take patterns, which ioredis never prefixes: do it here, and
  // hand back keys without the prefix so a later get/del adds it exactly once.
  const keys = client.keys.bind(client);
  client.keys = (pattern) => keys(P + pattern).then((ks) => ks.map(strip));
  const scanStream = client.scanStream.bind(client);
  client.scanStream = (opts = {}) => {
    const stream = scanStream({ ...opts, match: P + (opts.match || '*') });
    const on2 = stream.on.bind(stream);
    stream.on = (ev, fn) => (ev === 'data' ? on2(ev, (ks) => fn(ks.map(strip))) : on2(ev, fn));
    return stream;
  };
  return client;
}

// Main client for app operations (caching, GEO, pub/sub).
const redis = scoped(new IORedis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  ...(P ? { keyPrefix: P } : {}),
}));

// BullMQ requires maxRetriesPerRequest: null. Use a dedicated connection factory.
// No keyPrefix here (BullMQ refuses one; it gets `prefix: bullPrefix` instead),
// but scoped for the places that use these connections to subscribe.
const createBullConnection = () =>
  scoped(new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }));

// Separate pub/sub pair for Socket.io Redis adapter (namespaced by its `key`).
const createPubSubPair = () => ({
  pubClient: new IORedis(config.redis.url),
  subClient: new IORedis(config.redis.url),
});

redis.on('connect', () => logger.info(NS ? `Redis connected (namespace "${NS}")` : 'Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

module.exports = { redis, createBullConnection, createPubSubPair, bullPrefix, socketKey, scoped };
