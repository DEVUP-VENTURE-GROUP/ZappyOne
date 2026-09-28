/**
 * Search corpus — the in-memory, always-warm index the engine matches against.
 * Rebuilt from the live catalog every 60s (and lazily on first use) so search
 * never touches Mongo on the hot path. Entries are pre-lowercased and given a
 * `_terms` Set so scoring is allocation-free per query.
 *
 * Entry types: 'service' | 'category' | 'intent'. Workers/businesses are NOT
 * here — they are dynamic/geo and joined live by search.service.js.
 */
const ServiceCatalog = require('../service/service-catalog.model');
const { SYNONYMS, INTENTS } = require('./search.engine');
const logger = require('../../core/logger');

const REFRESH_MS = 60_000;

let _corpus = [];
let _builtAt = 0;
let _building = null;

const CATEGORY_LABELS = {
  vehicle: 'Vehicle & Bike', home: 'Home Services', helper: 'Helpers & Movers',
  beauty: 'Beauty & Grooming', mobile: 'Mobile Repair', construction: 'Construction',
  other: 'Other Services',
};

// Reverse the synonym map so a service's own words also index their everyday aliases.
const ALIASES_FOR = {};
for (const [word, canon] of Object.entries(SYNONYMS)) {
  (ALIASES_FOR[canon] = ALIASES_FOR[canon] || []).push(word);
}

const splitWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// name terms = the strong signal (title + code). recall terms = everything +
// everyday aliases (broad matching). Scoring weights name matches far higher so
// a service that merely *mentions* a word never outranks the one named after it.
function termsFor({ name, code, category, description, requiredSkills }) {
  const nameTerms = new Set([...splitWords(name), ...splitWords(code.replace(/_/g, ' '))]);
  const terms = new Set(nameTerms);
  [category, description].forEach((s) => splitWords(s).forEach((w) => terms.add(w)));
  (requiredSkills || []).forEach((s) => splitWords(s).forEach((w) => terms.add(w)));
  for (const t of [...terms]) (ALIASES_FOR[t] || []).forEach((a) => terms.add(a));
  // aliases of a NAME term are also strong (e.g. "bike" → motorcycle/scooter).
  for (const t of [...nameTerms]) (ALIASES_FOR[t] || []).forEach((a) => nameTerms.add(a));
  return { nameTerms, terms };
}

async function build() {
  const services = await ServiceCatalog.find({ isActive: true })
    .select('code name category description requiredSkills priceRangeMinPaise estimatedDurationMinutes sortOrder')
    .lean();

  const entries = [];
  const catCounts = {};

  for (const s of services) {
    catCounts[s.category] = (catCounts[s.category] || 0) + 1;
    const { nameTerms, terms } = termsFor(s);
    entries.push({
      type: 'service',
      id: s.code,
      code: s.code,
      title: s.name,
      subtitle: CATEGORY_LABELS[s.category] || s.category,
      category: s.category,
      priceMinPaise: s.priceRangeMinPaise || 0,
      durationMin: s.estimatedDurationMinutes || null,
      sortOrder: s.sortOrder || 0,
      _name: (s.name || '').toLowerCase(),
      _code: s.code,
      _nameTerms: nameTerms,
      _terms: terms,
    });
  }

  // Category entries — searching "home" or "vehicle" should surface the group.
  for (const [cat, count] of Object.entries(catCounts)) {
    const label = CATEGORY_LABELS[cat] || cat;
    entries.push({
      type: 'category',
      id: cat,
      code: cat,
      title: label,
      subtitle: `${count} services`,
      category: cat,
      _name: label.toLowerCase(),
      _code: cat,
      ...(() => { const { nameTerms, terms } = termsFor({ name: label, code: cat, category: cat, requiredSkills: (ALIASES_FOR[cat] || []) }); return { _nameTerms: nameTerms, _terms: terms }; })(),
    });
  }

  // Intent entries — surface a helpful "problem" card for natural-language queries.
  for (const intent of INTENTS) {
    const kw = intent.keywords.join(' ');
    entries.push({
      type: 'intent',
      id: `intent:${intent.keywords.join('_')}`,
      code: intent.keywords[0],
      title: intent.phrases[0].replace(/\b\w/g, (c) => c.toUpperCase()),
      subtitle: 'We can help with this',
      keywords: intent.keywords,
      _name: intent.phrases[0].toLowerCase(),
      _code: kw,
      _nameTerms: new Set([...intent.keywords, ...intent.phrases.flatMap((p) => p.split(/\s+/))]),
      _terms: new Set([...intent.keywords, ...intent.phrases.flatMap((p) => p.split(/\s+/))]),
    });
  }

  _corpus = entries;
  _builtAt = Date.now();
  logger.info({ services: services.length, entries: entries.length }, '[SEARCH] Corpus rebuilt');
  return entries;
}

async function getCorpus() {
  if (_corpus.length && Date.now() - _builtAt < REFRESH_MS) return _corpus;
  if (_building) return _building;              // coalesce concurrent rebuilds
  _building = build().finally(() => { _building = null; });
  // If we already have a (stale) corpus, serve it immediately and refresh in bg.
  if (_corpus.length) { _building.catch(() => {}); return _corpus; }
  return _building;
}

// Background keep-warm so the first user of each window never waits.
function startAutoRefresh() {
  build().catch((e) => logger.warn({ err: e.message }, '[SEARCH] Initial corpus build failed'));
  const t = setInterval(() => build().catch(() => {}), REFRESH_MS);
  if (t.unref) t.unref();
  return t;
}

module.exports = { getCorpus, startAutoRefresh, _forceRebuild: build };
