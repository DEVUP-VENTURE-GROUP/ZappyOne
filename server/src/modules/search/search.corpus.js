/**
 * Search corpus — the in-memory index the engine matches against, built from
 * the LIVE catalog (the same service lines customers see on Home), so search
 * can never offer something that isn't bookable.
 *
 * Entry types:
 *   service   a live service line          → its booking flow
 *   category  a problem heading in a line   → that heading's page (repair)
 *   problem   a specific problem            → the flow with that problem picked
 *
 * Every entry carries `lineCode` (to filter by what's live at a location) and
 * `path` (where the result takes the customer). Rebuilt every 60s.
 */
const { loadLiveLines } = require('../onboarding/coverage.service');
const { ProblemCategory, Problem } = require('../repair/models/problem.model');
const { SYNONYMS, conceptsForLine } = require('./search.engine');
const logger = require('../../core/logger');

const REFRESH_MS = 60_000;

let _corpus = [];
let _builtAt = 0;
let _building = null;

// Reverse the synonym map so a word also indexes its everyday aliases.
const ALIASES_FOR = {};
for (const [word, canon] of Object.entries(SYNONYMS)) {
  (ALIASES_FOR[canon] = ALIASES_FOR[canon] || []).push(word);
}

const splitWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** name terms are the strong signal; recall terms add context and aliases. */
function termsFor(name, ...context) {
  const nameTerms = new Set(splitWords(name));
  const terms = new Set(nameTerms);
  context.forEach((c) => splitWords(c).forEach((w) => terms.add(w)));
  for (const t of [...terms]) (ALIASES_FOR[t] || []).forEach((a) => terms.add(a));
  for (const t of [...nameTerms]) (ALIASES_FOR[t] || []).forEach((a) => nameTerms.add(a));
  return { _nameTerms: nameTerms, _terms: terms };
}

function entry({ type, id, title, subtitle, path, lineCode, order = 0, popular = false, lineTerms, vertical = null, problemCode = null, categoryCode = null }, ...context) {
  const terms = termsFor(title, subtitle, ...context);
  // A service is known by its everyday names ("bike" for the 2-Wheeler line).
  if (type === 'service' && lineTerms) lineTerms.forEach((w) => terms._nameTerms.add(w));
  return {
    type, id, code: id, title, subtitle, path, lineCode, sortOrder: order, isPopular: popular,
    vertical, problemCode, categoryCode,
    _name: String(title).toLowerCase(),
    _code: String(id).toLowerCase().replace(/[_:]/g, ' '),
    _lineTerms: lineTerms || new Set(),
    ...terms,
  };
}

async function build() {
  const { domains, lines } = await loadLiveLines();
  const domainName = new Map(domains.map((d) => [d.code, d.name]));

  const verticals = [...new Set(lines.map((l) => l.repairVertical).filter(Boolean))];
  const [categories, problems] = verticals.length ? await Promise.all([
    ProblemCategory.find({ vertical: { $in: verticals }, isActive: true, isArchived: false })
      .select('code name vertical displayOrder').lean(),
    Problem.find({ vertical: { $in: verticals }, isActive: true, isArchived: false })
      .select('code name vertical categoryCode isPopular displayOrder').lean(),
  ]) : [[], []];

  const entries = [];
  for (const line of lines) {
    const lineTerms = conceptsForLine(line);
    splitWords(line.name).forEach((w) => lineTerms.add(w));
    entries.push(entry({
      type: 'service', id: line.code, title: line.name, subtitle: domainName.get(line.domainCode) || '',
      path: line.customerPath, lineCode: line.code, order: line.displayOrder || 0, popular: !!line.isPopular,
      lineTerms, vertical: line.repairVertical || null,
    }, line.description, line.tagline, line.code.replace(/_/g, ' ')));

    if (!line.repairVertical) continue;
    const art = line.artKey || line.repairVertical;
    const published = new Set();
    for (const c of categories.filter((x) => x.vertical === line.repairVertical)) {
      published.add(c.code);
      entries.push(entry({
        type: 'category', id: `${line.code}:${c.code}`, title: c.name, subtitle: line.name,
        path: `/repair/category/${art}/${c.code}`, lineCode: line.code, order: c.displayOrder || 0,
        lineTerms, vertical: line.repairVertical, categoryCode: c.code,
      }));
    }
    for (const p of problems.filter((x) => x.vertical === line.repairVertical && published.has(x.categoryCode))) {
      entries.push(entry({
        type: 'problem', id: `${line.code}:${p.code}`, title: p.name, subtitle: line.name,
        path: `${line.customerPath}?problem=${encodeURIComponent(p.code)}`, lineCode: line.code,
        order: p.displayOrder || 0, popular: !!p.isPopular,
        lineTerms, vertical: line.repairVertical, problemCode: p.code, categoryCode: p.categoryCode,
      }, line.name));
    }
  }

  _corpus = entries;
  _builtAt = Date.now();
  logger.info({ lines: lines.length, entries: entries.length }, '[SEARCH] Corpus rebuilt from the live catalog');
  return entries;
}

async function getCorpus() {
  if (_corpus.length && Date.now() - _builtAt < REFRESH_MS) return _corpus;
  if (_building) return _building; // coalesce concurrent rebuilds
  _building = build().finally(() => { _building = null; });
  // Serve a stale corpus immediately and refresh in the background.
  if (_corpus.length) { _building.catch(() => {}); return _corpus; }
  return _building;
}

function startAutoRefresh() {
  build().catch((e) => logger.warn({ err: e.message }, '[SEARCH] Initial corpus build failed'));
  const t = setInterval(() => build().catch(() => {}), REFRESH_MS);
  if (t.unref) t.unref();
  return t;
}

module.exports = { getCorpus, startAutoRefresh, _forceRebuild: build };
