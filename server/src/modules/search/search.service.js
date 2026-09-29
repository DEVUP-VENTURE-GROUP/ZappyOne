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
const { expandQuery, textScore } = require('./search.engine');
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

/** Lines this customer has opened before — a light personal boost. */
async function getAffinity(userId) {
  if (!userId) return new Set();
  const rows = await SearchEvent.distinct('category', { userId, category: { $ne: 'all_services' } }).catch(() => []);
  return new Set(rows.map(String));
}

/** Which lines are live at this point; null when we don't know the location. */
async function liveLinesAt(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  try {
    const svc = await serviceabilityAt({ lat: Number(lat), lng: Number(lng) });
    return { status: svc.status, codes: new Set((svc.lines || []).map((l) => l.code)) };
  } catch (err) {
    logger.warn({ err: err.message }, '[SEARCH] serviceability lookup failed; not filtering by location');
    return null;
  }
}

function toResult(e) {
  return { type: e.type, code: e.code, title: e.title, subtitle: e.subtitle, path: e.path, lineCode: e.lineCode };
}

async function search({ q, lat, lng, userId, limit = 8 }) {
  const raw = String(q || '').trim();
  const [corpus, pop, affinity, here] = await Promise.all([getCorpus(), getPopularity(), getAffinity(userId), liveLinesAt(lat, lng)]);
  if (here && here.status === 'not_here') {
    return { query: raw, notHere: true, services: [], problems: [], categories: [], suggestions: [] };
  }
  const pool = here ? corpus.filter((e) => here.codes.has(e.lineCode)) : corpus;
  const rank = (e, text) => 55 * text * TYPE_WEIGHT[e.type] + 15 * (pop.get(e.lineCode) || 0)
    + 3 * (affinity.has(e.lineCode) ? 1 : 0) + (e.isPopular ? 2 : 0);

  if (!raw) {
    // Discovery: what's live here, most-booked first.
    const services = pool.filter((e) => e.type === 'service')
      .sort((a, b) => rank(b, 0) - rank(a, 0) || a.sortOrder - b.sortOrder)
      .slice(0, limit).map(toResult);
    return { query: '', discovery: true, services, problems: [], categories: [], suggestions: [] };
  }

  const { keywords, tokens } = expandQuery(raw);
  const scored = [];
  for (const e of pool) {
    const { text, matched } = textScore(e, keywords, tokens);
    if (matched) scored.push({ e, score: rank(e, text) });
  }
  scored.sort((a, b) => b.score - a.score);
  const pick = (type, n) => scored.filter((x) => x.e.type === type).slice(0, n).map((x) => toResult(x.e));
  const services = pick('service', limit);
  const problems = pick('problem', limit);
  const categories = pick('category', 4);
  const empty = !services.length && !problems.length && !categories.length;

  // No match: say so, and offer what's popular here, labelled as suggestions.
  const suggestions = empty
    ? pool.filter((e) => e.type === 'service').sort((a, b) => rank(b, 0) - rank(a, 0)).slice(0, 6).map(toResult)
    : [];

  return {
    query: raw,
    corrected: keywords.join(' ') !== tokens.join(' ') ? keywords.filter(Boolean).join(' ') : null,
    empty,
    services,
    problems,
    categories,
    suggestions,
  };
}

/** Autocomplete: titles only, fast, prefix-weighted. */
async function suggest({ q, lat, lng, limit = 6 }) {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return (await trending({ lat, lng })).slice(0, limit);
  const [corpus, pop, here] = await Promise.all([getCorpus(), getPopularity(), liveLinesAt(lat, lng)]);
  const pool = here ? corpus.filter((e) => here.codes.has(e.lineCode)) : corpus;
  const { keywords, tokens } = expandQuery(raw);
  return pool
    .map((e) => {
      const { text, matched } = textScore(e, keywords, tokens);
      return { e, s: matched ? text + (e._name.startsWith(raw) ? 0.3 : 0) + 0.2 * (pop.get(e.lineCode) || 0) : 0 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => toResult(x.e));
}

/** What people here are opening most — live services only. */
async function trending({ lat, lng } = {}) {
  const [corpus, pop, here] = await Promise.all([getCorpus(), getPopularity(), liveLinesAt(lat, lng)]);
  return corpus
    .filter((e) => e.type === 'service' && (!here || here.codes.has(e.lineCode)))
    .sort((a, b) => (pop.get(b.lineCode) || 0) - (pop.get(a.lineCode) || 0) || a.sortOrder - b.sortOrder)
    .slice(0, 8)
    .map(toResult);
}

module.exports = { search, suggest, trending, getPopularity, liveLinesAt };
