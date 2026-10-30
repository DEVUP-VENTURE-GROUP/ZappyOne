/**
 * Search: the live catalog, matched and ranked, limited to what can be booked
 * where the customer is.
 *
 *   corpus (live lines, problem headings, problems) → text score
 *   → popularity (what people here book) → personal affinity
 *   → filtered to lines served at the customer's point
 *
 * Nothing is padded in: when nothing matches, the response says so and offers
 * clearly labelled suggestions instead of pretending they were matches.
 */
const { redis } = require('../../config/redis');
const { getCorpus } = require('./search.corpus');
const { parseQuery, scoreEntry } = require('./search.engine');
const { SearchEvent } = require('../telemetry/telemetry.model');
const { serviceabilityAt } = require('../onboarding/coverage.service');
const logger = require('../../core/logger');

const POP_KEY = 'search:popularity';
const TYPE_WEIGHT = { service: 1, problem: 0.95, category: 0.85 };

/** Line code → share of recent demand (0..1), from what customers opened. */
async function getPopularity() {
  try {
    const cached = await redis.get(POP_KEY);
    if (cached) return new Map(JSON.parse(cached));
  } catch { /* recompute */ }
  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await SearchEvent.aggregate([
    { $match: { createdAt: { $gte: since }, category: { $nin: [null, '', 'all_services'] } } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
  ]).catch(() => []);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const map = new Map(rows.map((r) => [String(r._id), r.n / max]));
  redis.set(POP_KEY, JSON.stringify([...map]), 'EX', 300).catch(() => {});
  return map;
}

/**
 * Small in-process caches. Search runs on every pause in typing, so the
 * per-customer and per-place lookups are reused for a short while instead of
 * hitting the database on each keystroke.
 */
function ttlCache(ms, max = 2000) {
  const m = new Map();
  return {
    get(k) { const v = m.get(k); if (!v) return undefined; if (Date.now() > v.exp) { m.delete(k); return undefined; } return v.val; },
    set(k, val) { if (m.size >= max) m.delete(m.keys().next().value); m.set(k, { val, exp: Date.now() + ms }); return val; },
  };
}
const affinityCache = ttlCache(5 * 60_000);
const placeCache = ttlCache(60_000);
const resultCache = ttlCache(30_000, 5000);

/** Lines this customer has opened before — a light personal boost. */
async function getAffinity(userId) {
  if (!userId) return new Set();
  const hit = affinityCache.get(String(userId));
  if (hit) return hit;
  const rows = await SearchEvent.distinct('category', { userId, category: { $ne: 'all_services' } }).catch(() => []);
  return affinityCache.set(String(userId), new Set(rows.map(String)));
}

/** Which lines are live at this point (about 1 km cells); null when we don't know the location. */
async function liveLinesAt(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  const cell = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const hit = placeCache.get(cell);
  if (hit) return hit;
  try {
    const svc = await serviceabilityAt({ lat: Number(lat), lng: Number(lng) });
    return placeCache.set(cell, { status: svc.status, codes: new Set((svc.lines || []).map((l) => l.code)) });
  } catch (err) {
    logger.warn({ err: err.message }, '[SEARCH] serviceability lookup failed; not filtering by location');
    return null;
  }
}

function toResult(e) {
  return {
    type: e.type, code: e.code, title: e.title, subtitle: e.subtitle, path: e.path, lineCode: e.lineCode,
    // For the result's picture on screen.
    vertical: e.vertical || null, problemCode: e.problemCode || null, categoryCode: e.categoryCode || null,
  };
}

async function search({ q, lat, lng, userId, limit = 8 }) {
  const raw = String(q || '').trim();
  const [corpus, pop, affinity, here] = await Promise.all([getCorpus(), getPopularity(), getAffinity(userId), liveLinesAt(lat, lng)]);
  // Outside the launch region nothing is offered. Inside it, only what someone covers at this point is
  // found; a match nobody covers yet comes back as comingSoon, so the screen can say so.
  if (here && here.status === 'not_here') {
    return { query: raw, notHere: true, services: [], problems: [], categories: [], suggestions: [] };
  }
  const covered = (e) => !here || !e.lineCode || here.codes.has(e.lineCode);
  const pool = corpus.filter(covered);
  const liveHere = (e) => (here ? here.codes.has(e.lineCode) : false);
  const rank = (e, text) => 55 * text * TYPE_WEIGHT[e.type] + 15 * (pop.get(e.lineCode) || 0)
    + 3 * (affinity.has(e.lineCode) ? 1 : 0) + (e.isPopular ? 2 : 0) + (liveHere(e) ? 4 : 0);

  if (!raw) {
    // Discovery: what's live here, most-booked first.
    const services = pool.filter((e) => e.type === 'service')
      .sort((a, b) => rank(b, 0) - rank(a, 0) || a.sortOrder - b.sortOrder)
      .slice(0, limit).map(toResult);
    return { query: '', discovery: true, services, problems: [], categories: [], suggestions: [] };
  }

  const query = parseQuery(raw);
  const cacheKey = `${query.tokens.join(' ')}|${[...query.extras].join(',')}|${here ? [...here.codes].sort().join(',') : '-'}|${userId || ''}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return { ...cached, query: raw };

  // Typo correction only for words nothing in the catalog matches exactly
  // ("slow" is a real word here; it must not also match "low").
  for (const c of query.concepts) c.fuzzy = false;
  const exact = new Set();
  for (const e of pool) for (const t of scoreEntry(e, query).hits || []) exact.add(t);
  for (const c of query.concepts) c.fuzzy = !exact.has(c.token);

  const scored = [];
  for (const e of pool) {
    const r = scoreEntry(e, query);
    if (r.matched) scored.push({ e, r, score: rank(e, r.text) + 20 * r.coverage });
  }
  /*
   * Precision: when some results cover everything the customer said, the
   * ones covering only part of it are noise ("bike puncture" should not list
   * car tyres or laptop keys). Otherwise keep reasonable partial matches.
   */
  // Words nothing in the catalog matched ("has", a name) do not count against anyone.
  const recognised = new Set(scored.flatMap((x) => x.r.hits));
  for (const x of scored) x.r.coverage = recognised.size ? x.r.hits.filter((t) => recognised.has(t)).length / recognised.size : 0;
  for (const x of scored) x.score = rank(x.e, x.r.text) + 20 * x.r.coverage;
  const maxCoverage = scored.reduce((m, x) => Math.max(m, x.r.coverage), 0);
  const kept = scored.filter((x) => (maxCoverage === 1 ? x.r.coverage === 1 : x.r.coverage >= maxCoverage * 0.5) && x.r.text >= 0.3);
  kept.sort((a, b) => b.score - a.score);
  const pick = (type, n) => kept.filter((x) => x.e.type === type).slice(0, n).map((x) => toResult(x.e));
  const services = pick('service', limit);
  const problems = pick('problem', Math.max(limit, 12));
  const categories = pick('category', 4);
  const empty = !services.length && !problems.length && !categories.length;

  // A typo was corrected only when the best result needed one ("punctr" → "puncture").
  const fixed = kept[0]?.r.fixed || {};
  const corrected = Object.keys(fixed).length ? query.tokens.map((t) => fixed[t] || t).join(' ') : null;

  // No match: say so, and offer what's popular here, labelled as suggestions.
  const suggestions = empty
    ? pool.filter((e) => e.type === 'service').sort((a, b) => rank(b, 0) - rank(a, 0)).slice(0, 6).map(toResult)
    : [];

  const comingSoon = here && !services.length
    ? corpus.filter((e) => e.type === 'service' && !covered(e) && scoreEntry(e, query).matched).slice(0, 3).map(toResult)
    : [];

  return resultCache.set(cacheKey, { query: raw, corrected, empty, services, problems, categories, suggestions, comingSoon });
}

/** Autocomplete: titles only, fast, prefix-weighted. */
async function suggest({ q, lat, lng, limit = 6 }) {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return (await trending({ lat, lng })).slice(0, limit);
  const [corpus, pop, here] = await Promise.all([getCorpus(), getPopularity(), liveLinesAt(lat, lng)]);
  if (here && here.status === 'not_here') return [];
  const query = parseQuery(raw);
  return corpus
    .map((e) => {
      const r = scoreEntry(e, query);
      const live = here && here.codes.has(e.lineCode) ? 0.1 : 0;
      return { e, s: r.matched && r.coverage === 1 ? r.text + (e._name.startsWith(raw) ? 0.3 : 0) + 0.2 * (pop.get(e.lineCode) || 0) + live : 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => toResult(x.e));
}

/** What people are opening most; what is live here first. */
async function trending({ lat, lng } = {}) {
  const [corpus, pop, here] = await Promise.all([getCorpus(), getPopularity(), liveLinesAt(lat, lng)]);
  if (here && here.status === 'not_here') return [];
  const live = (e) => (here && here.codes.has(e.lineCode) ? 1 : 0);
  return corpus
    .filter((e) => e.type === 'service')
    .sort((a, b) => live(b) - live(a) || (pop.get(b.lineCode) || 0) - (pop.get(a.lineCode) || 0) || a.sortOrder - b.sortOrder)
    .slice(0, 8)
    .map(toResult);
}

module.exports = { search, suggest, trending, getPopularity, liveLinesAt };
