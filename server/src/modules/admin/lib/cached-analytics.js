const { redis } = require('../../../config/redis');

// Analytics responses are cached in Redis to protect against expensive
// aggregation queries being fired on every dashboard refresh.
// Metrics: 30s TTL (near-real-time for ops). Revenue: 60s TTL.
// Requests that miss at the same moment share one computation instead of each running it (no stampede when a cache expires).
const inflight = new Map();

async function cachedAnalytics(key, ttlSec, computeFn) {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (_) {
    /* Redis miss — fall through to compute */
  }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const result = await computeFn();
    try {
      await redis.set(key, JSON.stringify(result), 'EX', ttlSec);
    } catch (_) {}
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

module.exports = cachedAnalytics;
