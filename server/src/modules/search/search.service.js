/**
 * Search service — orchestrates a query end to end:
 *   corpus (in-memory) → engine scoring → live signals (popularity, personalization,
 *   nearby workers) → ranked, grouped, never-empty result.
 *
 * Sub-100ms path: static groups come from memory; the only optional DB touch is
 * the P2 nearby-workers join, which runs in parallel and degrades gracefully.
 */
const { redis } = require('../../config/redis');
const { getCorpus } = require('./search.corpus');
const { expandQuery, textScore } = require('./search.engine');
const { SearchEvent } = require('../telemetry/telemetry.model');
const geoService = require('../worker/geo.service');
const Worker = require('../worker/worker.model');
const Order = require('../order/order.model');
const logger = require('../../core/logger');

// Popularity (search demand, last 7d) — cached in Redis, category → 0..1
const POP_KEY = 'search:popularity';
const POP_TTL = 300;

async function getPopularity() {
  try {
    const cached = await redis.get(POP_KEY);
    if (cached) return new Map(Object.entries(JSON.parse(cached)));
  } catch { /* fall through */ }
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await SearchEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]);
    const max = Math.max(1, ...rows.map((r) => r.n));
    const map = {};
    rows.forEach((r) => { if (r._id) map[String(r._id).toLowerCase()] = r.n / max; });
    redis.set(POP_KEY, JSON.stringify(map), 'EX', POP_TTL).catch(() => {});
    return new Map(Object.entries(map));
  } catch (err) {
    logger.warn({ err: err.message }, '[SEARCH] popularity load failed');
    return new Map();
  }
}

// Personalization — services this user booked before (boost them)
async function getUserAffinity(userId) {
  if (!userId) return new Set();
  const key = `search:affinity:${userId}`;
  try {
    const cached = await redis.get(key);
    if (cached) return new Set(JSON.parse(cached));
  } catch { /* fall through */ }
  try {
    const orders = await Order.find({ userId }).select('service').sort({ createdAt: -1 }).limit(30).lean();
    const set = [...new Set(orders.map((o) => o.service))];
    redis.set(key, JSON.stringify(set), 'EX', 600).catch(() => {});
    return new Set(set);
  } catch { return new Set(); }
}

function popularityFor(entry, pop) {
  return pop.get((entry.category || entry.code || '').toLowerCase()) || 0;
}

// P2: nearby workers for the top matched service's skill
async function nearbyWorkersForSkill(skill, lat, lng) {
  if (!skill || lat == null || lng == null) return [];
  try {
    const ids = await geoService.findCandidates({ lat, lng, skill, radiusKm: 8 });
    const top = ids.slice(0, 6);
    if (!top.length) return [];
    const workers = await Worker.find({ _id: { $in: top } })
      .select('name rating completedJobs profilePhotoKey').lean();
    const byId = new Map(workers.map((w) => [String(w._id), w]));
    return top.map((id, i) => {
      const w = byId.get(String(id)); if (!w) return null;
      return {
        workerId: String(id), name: w.name || 'Pro',
        rating: Number((w.rating ?? 5).toFixed(1)),
        completedJobs: w.completedJobs || 0,
        recommended: i === 0,
      };
    }).filter(Boolean);
  } catch { return []; }
}

/**
 * Main search. Returns grouped, ranked, NEVER-empty results.
 */
async function search({ q, lat, lng, userId, limit = 8 }) {
  const raw = String(q || '').trim();
  const corpus = await getCorpus();

  // Empty query → trending + popular (discovery mode, still "results").
  if (!raw) {
    const [pop] = await Promise.all([getPopularity()]);
    const services = corpus.filter((e) => e.type === 'service')
      .map((e) => ({ e, s: popularityFor(e, pop) }))
      .sort((a, b) => b.s - a.s || a.e.sortOrder - b.e.sortOrder)
      .slice(0, limit).map((x) => toResult(x.e));
    return { query: '', empty: false, discovery: true, services, categories: [], intents: [], workers: [], suggestions: [] };
  }

  const { keywords, tokens } = expandQuery(raw);
  const [pop, affinity] = await Promise.all([getPopularity(), getUserAffinity(userId)]);

  const scored = [];
  for (const e of corpus) {
    const { text, matched } = textScore(e, keywords, tokens);
    if (!matched) continue;
    const typeBoost = e.type === 'service' ? 1 : e.type === 'category' ? 0.85 : 0.8;
    const score =
        55 * text * typeBoost
      + 15 * popularityFor(e, pop)
      + 3  * (affinity.has(e.code) ? 1 : 0)
      + 2  * (e.type === 'service' ? 1 : 0);
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const services = scored.filter((x) => x.e.type === 'service').slice(0, limit).map((x) => toResult(x.e));
  const categories = scored.filter((x) => x.e.type === 'category').slice(0, 3).map((x) => toResult(x.e));
  const intents = scored.filter((x) => x.e.type === 'intent').slice(0, 2).map((x) => toResult(x.e));

  // NEVER-EMPTY GUARANTEE (act like a PM: always give something bookable)
  // Real matches come first; then we top up to a minimum with related (same
  // category as the best match) and finally the most popular services. So even a
  // garbage/misspelled query returns a full, useful list — never "no results".
  const MIN_RESULTS = Math.min(6, limit);
  const empty = services.length === 0;
  const have = new Set(services.map((s) => s.code));
  const finalServices = [...services];

  if (finalServices.length < MIN_RESULTS) {
    // Prefer services in the best-matched category (relevant), else any popular.
    const hintCat = scored.find((x) => x.e.category)?.e.category
      || categories[0]?.code || intents[0]?.category || null;
    const pool = corpus
      .filter((e) => e.type === 'service' && !have.has(e.code))
      .map((e) => ({
        e,
        s: (hintCat && e.category === hintCat ? 1 : 0) + popularityFor(e, pop),
      }))
      .sort((a, b) => b.s - a.s);
    for (const { e } of pool) {
      if (finalServices.length >= MIN_RESULTS) break;
      finalServices.push(toResult(e));
      have.add(e.code);
    }
  }

  // P2 — join nearby workers for the strongest matched service (parallel-safe).
  const topService = scored.find((x) => x.e.type === 'service');
  const workers = topService ? await nearbyWorkersForSkill(topService.e.code, lat, lng) : [];

  return {
    query: raw,
    corrected: keywords.join(' ') !== tokens.join(' ') ? keywords.filter(Boolean).join(' ') : null,
    empty,
    services: finalServices,
    categories,
    intents,
    workers,
    suggestions: [],
  };
}

function toResult(e) {
  return {
    type: e.type,
    code: e.code,
    title: e.title,
    subtitle: e.subtitle,
    category: e.category || null,
    priceMinPaise: e.priceMinPaise || null,
    durationMin: e.durationMin || null,
    keywords: e.keywords || null,
  };
}

// Autocomplete — fast prefix/fuzzy over corpus titles, popularity-ranked
async function suggest({ q, limit = 6 }) {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return (await trending({})).map((t) => ({ title: t.title, code: t.code, type: t.type }));
  const corpus = await getCorpus();
  const { keywords, tokens } = expandQuery(raw);
  const pop = await getPopularity();
  const out = corpus
    .map((e) => {
      const { text, matched } = textScore(e, keywords, tokens);
      const prefix = e._name.startsWith(raw) ? 0.3 : 0;
      return { e, s: matched ? text + prefix + 0.2 * popularityFor(e, pop) : 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => ({ title: x.e.title, code: x.e.code, type: x.e.type, category: x.e.category || null }));
  return out;
}

// Trending — top searched categories (last 48h), Redis-cached
const TREND_KEY = 'search:trending';
async function trending() {
  try {
    const cached = await redis.get(TREND_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* fall through */ }
  try {
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const rows = await SearchEvent.aggregate([
      { $match: { createdAt: { $gte: since }, category: { $nin: [null, 'unknown', ''] } } },
      { $group: { _id: '$category', n: { $sum: 1 } } },
      { $sort: { n: -1 } }, { $limit: 8 },
    ]);
    const corpus = await getCorpus();
    const byCode = new Map(corpus.map((e) => [e.code, e]));
    const out = rows.filter((r) => r._id).map((r) => {
      const e = byCode.get(String(r._id));
      return { code: String(r._id), title: e?.title || String(r._id).replace(/_/g, ' '), type: e?.type || 'service' };
    });
    const result = out.length ? out : corpus.filter((e) => e.type === 'service').slice(0, 8).map((e) => ({ code: e.code, title: e.title, type: 'service' }));
    redis.set(TREND_KEY, JSON.stringify(result), 'EX', 180).catch(() => {});
    return result;
  } catch {
    const corpus = await getCorpus();
    return corpus.filter((e) => e.type === 'service').slice(0, 8).map((e) => ({ code: e.code, title: e.title, type: 'service' }));
  }
}

module.exports = { search, suggest, trending, getPopularity };
