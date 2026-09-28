const { VisitorSession, SearchEvent } = require('./telemetry.model');
const { resolveGeo, resolveGeoFromIp, parseUA, normaliseReferrer } = require('./telemetry.geo');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const ONLINE_KEY = 'viz:online';          // ZSET member=sessionId score=lastSeenMs
const ONLINE_WINDOW_MS = 60_000;          // "active right now" = seen in last 60s
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const OBJECTID_RE = /^[a-f\d]{24}$/i;
// Only accept a real ObjectId — a bad string would throw a CastError and drop the whole write.
const safeUserId = (id) => (typeof id === 'string' && OBJECTID_RE.test(id) ? id : null);

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
}

function validCoord(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number'
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Mark a session present in the live ZSET (and opportunistically prune stale members). */
async function touchOnline(sessionId) {
  try {
    const now = Date.now();
    await redis.zadd(ONLINE_KEY, now, sessionId);
    // Cheap probabilistic prune to keep the set bounded without a cron.
    if (Math.random() < 0.1) await redis.zremrangebyscore(ONLINE_KEY, 0, now - ONLINE_WINDOW_MS * 3);
    await redis.expire(ONLINE_KEY, 600);
  } catch (_) { /* live presence is best-effort */ }
}

/** Count of sessions seen within the live window. Reused by the admin intelligence controller. */
async function activeNowCount() {
  try {
    const now = Date.now();
    await redis.zremrangebyscore(ONLINE_KEY, 0, now - ONLINE_WINDOW_MS * 3);
    return await redis.zcount(ONLINE_KEY, now - ONLINE_WINDOW_MS, '+inf');
  } catch (_) {
    return 0;
  }
}

/**
 * Resolve district/city/state for a session ONCE (when coords first arrive),
 * fire-and-forget so it never blocks the ingest response.
 */
function enrichGeoAsync(sessionId, lat, lng) {
  resolveGeo(lat, lng)
    .then((geo) => {
      if (!geo || (!geo.city && !geo.district && !geo.state)) return;
      return VisitorSession.updateOne({ sessionId }, { $set: {
        district: geo.district ?? null,
        city:     geo.city ?? null,
        state:    geo.state ?? null,
        country:  geo.country ?? 'India',
      } });
    })
    .catch((err) => logger.warn({ err: err.message, sessionId }, 'telemetry geo enrich failed'));
}

/**
 * Locate a web visitor from their IP when no GPS coords are available — this is
 * what fills the "where visitors come from" breakdown for ordinary browsing.
 */
function enrichGeoFromIpAsync(sessionId, ip) {
  resolveGeoFromIp(ip)
    .then((geo) => {
      if (!geo || (!geo.city && !geo.state)) return;
      return VisitorSession.updateOne({ sessionId }, { $set: {
        city:    geo.city ?? null,
        state:   geo.state ?? null,
        country: geo.country ?? 'India',
      } });
    })
    .catch((err) => logger.warn({ err: err.message, sessionId }, 'telemetry ip geo enrich failed'));
}

/* POST /api/telemetry/pageview */
async function pageview(req, res) {
  res.status(204).end(); // respond immediately — ingest is fire-and-forget
  try {
    const { sessionId, path, referrer, lat, lng, userType, userId, prevDwellMs } = req.body || {};
    if (!sessionId || !SESSION_RE.test(sessionId)) return;

    const ua = parseUA(req.headers['user-agent']);
    const now = new Date();
    const hasCoord = validCoord(lat, lng);

    const setOnInsert = {
      sessionId,
      firstSeen: now,
      referrer: normaliseReferrer(referrer),
      ip: clientIp(req),
      ...ua,
    };
    const set = {
      lastSeen: now,
      currentPath: typeof path === 'string' ? path.slice(0, 200) : '/',
      pageEnteredAt: now,
      ...(userType && ['guest', 'user', 'worker', 'admin'].includes(userType) ? { userType } : {}),
      ...(safeUserId(userId) ? { userId: safeUserId(userId) } : {}),
      ...(hasCoord ? { lat, lng } : {}),
    };

    const existing = await VisitorSession.findOneAndUpdate(
      { sessionId },
      { $setOnInsert: setOnInsert, $set: set, $inc: { pageCount: 1 } },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    ).select('city lat').lean();

    await touchOnline(sessionId);

    // Resolve geo once the city is still unknown: prefer precise GPS coords,
    // otherwise locate the visitor from their IP (ordinary web browsing).
    if (!existing || !existing.city) {
      if (hasCoord) enrichGeoAsync(sessionId, lat, lng);
      else enrichGeoFromIpAsync(sessionId, clientIp(req));
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'telemetry pageview failed');
  }
}

/* POST /api/telemetry/heartbeat */
async function heartbeat(req, res) {
  res.status(204).end();
  try {
    const { sessionId } = req.body || {};
    if (!sessionId || !SESSION_RE.test(sessionId)) return;
    await Promise.all([
      VisitorSession.updateOne({ sessionId }, { $set: { lastSeen: new Date() } }),
      touchOnline(sessionId),
    ]);
  } catch (err) {
    logger.warn({ err: err.message }, 'telemetry heartbeat failed');
  }
}

/* POST /api/telemetry/search */
/**
 * One row per service search. result='no_service' is the unmet-demand signal
 * (user saw "No Service Available"). Geo is resolved synchronously-ish via the
 * 48h-cached resolver so unmet-demand-by-city works without a follow-up job.
 */
async function search(req, res) {
  res.status(202).end();
  try {
    const { sessionId, category, query, lat, lng, userType, userId, result } = req.body || {};
    if (!category || typeof category !== 'string') return;

    const hasCoord = validCoord(lat, lng);
    const geo = hasCoord ? await resolveGeo(lat, lng) : {};
    const ua = parseUA(req.headers['user-agent']);
    const bucket = hasCoord ? `${lat.toFixed(2)}:${lng.toFixed(2)}` : null;

    await SearchEvent.create({
      sessionId: sessionId && SESSION_RE.test(sessionId) ? sessionId : null,
      userId: safeUserId(userId),
      userType: ['guest', 'user', 'worker', 'admin'].includes(userType) ? userType : 'guest',
      device: ua.device,
      category: category.slice(0, 80),
      query: typeof query === 'string' ? query.slice(0, 120) : null,
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      bucket,
      district: geo.district ?? null,
      city: geo.city ?? null,
      state: geo.state ?? null,
      result: result === 'no_service' ? 'no_service' : 'served',
    });

    if (sessionId && SESSION_RE.test(sessionId)) touchOnline(sessionId);
  } catch (err) {
    logger.warn({ err: err.message }, 'telemetry search failed');
  }
}

// Client-side crash beacon (from the app's ErrorBoundary). Logged for monitoring;
// never blocks and never trusts the payload beyond logging.
async function clientError(req, res) {
  res.status(204).end();
  try {
    const { message, stack, errorStack, path } = req.body || {};
    logger.warn({
      msg: typeof message === 'string' ? message.slice(0, 500) : null,
      errorStack: typeof errorStack === 'string' ? errorStack.slice(0, 1500) : null,
      componentStack: typeof stack === 'string' ? stack.slice(0, 1000) : null,
      path: typeof path === 'string' ? path.slice(0, 220) : null,
      ua: req.headers['user-agent'],
    }, '[CLIENT-ERROR] React error boundary tripped');
  } catch { /* best-effort */ }
}

module.exports = {
  pageview,
  heartbeat,
  search,
  clientError,
  // shared helpers for the admin intelligence controller
  activeNowCount,
  ONLINE_KEY,
  ONLINE_WINDOW_MS,
};
