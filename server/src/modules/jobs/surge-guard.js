/**
 * Keeping surge honest, both ways (jobs/surge). Surge is money, so it gets gamed:
 *
 *   switch-off    providers go offline together so an area looks empty and
 *                 prices rise → supply is read against its last hour: a sudden
 *                 drop counts only slowly (steadySupply).
 *   fake demand   searches from extra accounts, often a provider's own, push an
 *                 area "busy" → only signed-in customers count, never an account
 *                 sharing a phone number with a provider (countsAsDemand).
 *   farming       a provider and a friend book each other in surge to collect
 *                 the fee → the same pair surging again and again holds the
 *                 provider's share and raises a fraud alert; admin dismisses it
 *                 (paid out) or confirms it (kept back) (payoutCheck, releaseHeld).
 *   hopping       switch off, wait for the price to rise, switch back on and
 *                 take the surge job → own "go online" taps are noted; several
 *                 around a surge booking hold the share the same way (hopCheck).
 *
 * The customer side was already guarded in surge itself: a hard ceiling (never
 * above the price), a locked quote, every reason its own line, and "when in
 * doubt, no charge". Every guard here fails open for the customer (no extra
 * surge) and closed for the payout (held, never lost).
 */
const logger = require('../../core/logger');

const SUPPLY_MINUTES = 60;   // the memory supply is read against
const FLOOR = 0.7;           // supply never reads below 70% of its recent median
const PAIR_DAYS = 30;
const PAIR_LIMIT = 3;        // the third surge job between the same two in 30 days is held
const HOP_LIMIT = 3;         // this many own "go online" taps…
const HOP_WINDOW_MIN = 120;  // …in the two hours before a surge booking (and its first 30 min)

const r = () => require('../../config/redis');
const k = (s) => r().scoped(`surge:${s}`);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The supply surge should use for an area: what is there now, but never less
 * than FLOOR of the last hour's median. Returns { supply, damped }.
 */
async function steadySupply(line, zone, have) {
  try {
    const { redis } = r();
    const key = k(`sh:${line}:${zone}`);
    const [, , past] = await redis.multi()
      .lpush(key, have).ltrim(key, 0, SUPPLY_MINUTES - 1).lrange(key, 0, -1).expire(key, 2 * 3600).exec()
      .then((res) => res.map(([, v]) => v));
    const floor = Math.floor(median((past || [have]).map(Number)) * FLOOR);
    return floor > have ? { supply: floor, damped: true } : { supply: have, damped: false };
  } catch {
    return { supply: have, damped: false };
  }
}

/** Does this person's search count as demand? Signed in, and not a provider. Cached a day. */
async function countsAsDemand(userId) {
  if (!userId) return false;
  try {
    const { redis } = r();
    const key = k(`real:${userId}`);
    const cached = await redis.get(key);
    if (cached != null) return cached === '1';
    const user = await require('../user/user.model').findById(userId).select('phone').lean();
    const phone = user?.phone;
    const provider = !phone || /^deleted-/.test(phone) ? false : !!(
      await require('../worker/worker.model').exists({ phone })
      || await require('../shop/shop.model').exists({ phone })
    );
    const real = !!phone && !provider;
    await redis.set(key, real ? '1' : '0', 'EX', 86400);
    return real;
  } catch {
    return true; // never block real demand on a lookup failure
  }
}

/** A worker switched from offline to online themselves (worker.service goOnline). Kept a day. */
async function noteOnline(workerId) {
  const { redis } = r();
  const key = k(`on:${workerId}`);
  const now = Date.now();
  await redis.multi().zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`).zremrangebyscore(key, 0, now - 86400000).expire(key, 86400).exec();
}

/** How many times this worker switched on in the hop window around a booking made at `at`. */
async function hopsAround(workerId, at) {
  try {
    const t = new Date(at || Date.now()).getTime();
    return await r().redis.zcount(k(`on:${workerId}`), t - HOP_WINDOW_MIN * 60000, t + 30 * 60000);
  } catch {
    return 0;
  }
}

/**
 * At payout: hold the provider's share and raise an alert when this customer
 * had PAIR_LIMIT or more surge jobs with the same provider in PAIR_DAYS (this
 * one included), or the worker switched on HOP_LIMIT or more times around the
 * booking. Returns { held, count }.
 */
async function payoutCheck(kind, doc) {
  const hops = doc.workerId && !doc.shopId ? await hopsAround(doc.workerId, doc.createdAt) : 0;
  const provider = doc.shopId ? { field: 'shopId', id: doc.shopId, actorKind: 'shop' } : doc.workerId ? { field: 'workerId', id: doc.workerId, actorKind: 'worker' } : null;
  if (!provider || !doc.userId) return { held: false, count: 0 };
  try {
    const { KINDS } = require('./kinds');
    const since = new Date(Date.now() - PAIR_DAYS * 86400000);
    const counts = await Promise.all(['repair', 'pet', 'helping'].map((kd) => KINDS[kd].model().countDocuments({
      userId: doc.userId, [provider.field]: provider.id, 'surge.paise': { $gt: 0 }, createdAt: { $gte: since },
    })));
    const count = counts.reduce((a, n) => a + n, 0);
    const reasons = [count >= PAIR_LIMIT && 'same_pair', hops >= HOP_LIMIT && 'on_off_switching'].filter(Boolean);
    if (!reasons.length) return { held: false, count };
    await require('../fraud/fraud.service').logSurgeFarming({
      actorKind: provider.actorKind, actorId: provider.id, severity: count >= PAIR_LIMIT * 2 || reasons.length > 1 ? 'high' : 'medium',
      details: { kind, bookingId: String(doc._id), reference: doc.reference || null, customerId: String(doc.userId), reasons, surgeJobs: count, days: PAIR_DAYS, onlineSwitches: hops, heldPaise: doc.surge?.providerPaise || 0 },
    });
    return { held: true, count };
  } catch (e) {
    logger.warn({ err: e.message }, '[surge-guard] pair check failed; paying normally');
    return { held: false, count: 0 };
  }
}

module.exports = { steadySupply, countsAsDemand, noteOnline, hopsAround, payoutCheck, PAIR_LIMIT, PAIR_DAYS, HOP_LIMIT, FLOOR };
