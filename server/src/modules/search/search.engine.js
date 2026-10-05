/**
 * Search engine — tokenization, intent/synonym expansion, typo tolerance, and
 * a single tiered scoring function. Pure functions, no I/O — fed a prebuilt
 * corpus by search.corpus.js and called by search.service.js.
 *
 * Design goals: sub-millisecond per query over a few-hundred-entry corpus,
 * Zepto-style "always understand, never dead-end".
 */

// Command/filler words that carry no service meaning.
const STOPWORDS = new Set([
  'book', 'booking', 'need', 'needed', 'want', 'wanted', 'get', 'getting', 'a', 'an', 'the',
  'please', 'pls', 'for', 'me', 'my', 'i', 'to', 'can', 'could', 'you', 'find', 'some', 'someone',
  'service', 'services', 'near', 'nearby', 'around', 'at', 'home', 'house', 'guy', 'person', 'help',
  'with', 'of', 'do', 'does', 'is', 'are', 'any', 'show', 'order', 'fix', 'fixing', 'repairing',
  'it', 'and', 'call', 'now', 'today', 'urgent', 'urgently', 'asap', 'broke', 'broken', 'not',
  'working', 'issue', 'issues', 'problem', 'problems', 'wala', 'wale', 'wont', 'cant', 'in',
  'has', 'have', 'had', 'got', 'gone', 'went', 'there', 'this', 'that', 'on', 'very', 'so', 'just', 'also',
  // Common Hindi and Telugu fillers in spoken requests (bike ka puncture ho gaya).
  'ka', 'ki', 'ke', 'hai', 'hua', 'hui', 'ho', 'gaya', 'gayi', 'mera', 'meri', 'mere', 'karna', 'chahiye',
  'kar', 'karo', 'do', 'nahi', 'raha', 'rahi', 'lo', 'avvaledu', 'ledu',
]);

// Everyday term → canonical keyword(s) that appear in service names/codes.
const SYNONYMS = {
  tyre: 'puncture', tire: 'puncture', flat: 'puncture', wheel: 'puncture', tube: 'puncture',
  bike: 'bike', motorcycle: 'bike', motorbike: 'bike', scooter: 'bike', scooty: 'bike', activa: 'bike',
  car: 'car', vehicle: 'car', auto: 'car', four: 'car',
  wash: 'wash', clean: 'wash', cleaning: 'wash', detailing: 'detailing',
  fuel: 'fuel', petrol: 'fuel', diesel: 'fuel', gas: 'fuel',
  breakdown: 'breakdown', tow: 'towing', towing: 'towing', jumpstart: 'jump', jump: 'jump',
  chain: 'chain', brake: 'brake', brakes: 'brake',
  phone: 'phone', mobile: 'phone', cellphone: 'phone', smartphone: 'phone', cell: 'phone',
  iphone: 'phone', android: 'phone', display: 'screen', glass: 'screen', touch: 'screen',
  laptop: 'laptop', computer: 'laptop', notebook: 'laptop', macbook: 'laptop', pc: 'laptop',
  ssd: 'ssd', ram: 'ram', virus: 'virus', keyboard: 'keyboard', motherboard: 'motherboard',
  slow: 'slow', hang: 'slow', hanging: 'slow',
  battery: 'battery', charging: 'charging', charger: 'charging', charge: 'charging',
  tv: 'tv', television: 'tv', led: 'tv',
  cctv: 'cctv', surveillance: 'cctv', security: 'cctv',
  wifi: 'router', internet: 'router', router: 'router', network: 'router',
  lock: 'lock', automation: 'automation', smart: 'smart',
  electrician: 'electrical', electric: 'electrical', electrical: 'electrical', wiring: 'electrical',
  current: 'electrical', short: 'electrical', circuit: 'electrical', mcb: 'electrical', switchboard: 'electrical',
  fan: 'electrical', light: 'electrical', bulb: 'electrical', switch: 'electrical', socket: 'electrical',
  plumber: 'plumbing', plumbing: 'plumbing', pipe: 'plumbing', tap: 'plumbing', leak: 'plumbing',
  leakage: 'plumbing', drain: 'plumbing', toilet: 'plumbing', bathroom: 'plumbing', sink: 'plumbing',
  carpenter: 'carpenter', wood: 'carpenter', furniture: 'carpenter', door: 'carpenter', wardrobe: 'carpenter',
  paint: 'painting', painting: 'painting', painter: 'painting',
  mason: 'mason', cement: 'mason', wall: 'mason', tiles: 'mason', construction: 'mason',
  pet: 'pet', dog: 'pet', cat: 'pet', puppy: 'pet', grooming: 'grooming', groom: 'grooming', walking: 'walk',
  elder: 'elder', elderly: 'elder', senior: 'elder', oldage: 'elder', grandfather: 'elder',
  grandmother: 'elder', parent: 'elder', medicine: 'medicine', hospital: 'hospital', grocery: 'grocery',
  party: 'event', birthday: 'event', decoration: 'event', decor: 'event', event: 'event',
  wedding: 'event', anniversary: 'event', balloon: 'event', celebration: 'event',
  ac: 'ac', cooler: 'ac', aircon: 'ac', airconditioner: 'ac',
  tank: 'tank', sump: 'tank', water: 'water',
};

/**
 * Intent phrases → the keywords a natural-language complaint should surface.
 * Matched as ordered substrings against the raw (lowercased) query so
 * "my bike won't start" → bike + battery + towing.
 */
const INTENTS = [
  { phrases: ["won't start", 'wont start', 'not starting', 'not turning on', 'dead battery'], keywords: ['battery', 'jump', 'breakdown', 'towing'] },
  { phrases: ['not cooling', 'no cooling', 'ac not working', 'ac repair', 'gas filling'], keywords: ['ac'] },
  { phrases: ['tyre burst', 'tire burst', 'flat tyre', 'flat tire', 'puncture'], keywords: ['puncture', 'towing'] },
  { phrases: ['no power', 'power gone', 'short circuit', 'sparking', 'shock'], keywords: ['electrical'] },
  { phrases: ['water leak', 'pipe leak', 'tap leak', 'clogged', 'blockage'], keywords: ['plumbing'] },
  { phrases: ['screen broken', 'screen crack', 'cracked screen', 'broken display'], keywords: ['screen', 'phone'] },
  { phrases: ['need decoration', 'birthday party', 'wedding setup', 'event tomorrow'], keywords: ['event'] },
  { phrases: ['water tank', 'tank cleaning', 'sump cleaning'], keywords: ['tank', 'water'] },
  { phrases: ['stuck on road', 'car stopped', 'vehicle stopped', 'engine problem'], keywords: ['breakdown', 'towing'] },
];

function tokenize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Bounded Damerau-Levenshtein — returns edit distance, early-exits past `max`.
function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const al = a.length, bl = b.length;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev[j - 1] + cost); // approx (prev-prev)
      }
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

// True when `token` fuzzily matches `term` (short words need exactness).
function fuzzyEq(token, term) {
  return fuzzyTier(token, term) > 0;
}

// Graded fuzzy match: closer edits score higher so `punctr`→puncture clearly
// beats an incidental 2-edit collision. Returns a 0..0.7 tier (0 = no match).
function fuzzyTier(token, term) {
  if (token === term) return 0.7;
  if (term.includes(token) && token.length >= 4) return 0.6;   // strong substring
  const maxDist = token.length <= 4 ? 1 : 2;
  const d = editDistance(token, term, maxDist);
  if (d > maxDist) return 0;
  return d === 1 ? 0.6 : 0.4;                                    // 1-edit strong, 2-edit weaker
}

/**
 * Expand a raw phrase into a de-duped keyword set: meaningful tokens + their
 * synonyms + naive singular + any triggered intent keywords.
 */
function expandQuery(raw) {
  const toks = tokenize(raw).filter((t) => !STOPWORDS.has(t));
  const out = new Set();
  for (const t of toks) {
    out.add(t);
    if (SYNONYMS[t]) out.add(SYNONYMS[t]);
    if (t.length > 3 && t.endsWith('s')) {
      const sing = t.slice(0, -1);
      out.add(sing);
      if (SYNONYMS[sing]) out.add(SYNONYMS[sing]);
    }
  }
  const lower = String(raw || '').toLowerCase();
  for (const intent of INTENTS) {
    if (intent.phrases.some((p) => lower.includes(p))) {
      intent.keywords.forEach((k) => out.add(k));
    }
  }
  return { keywords: [...out], tokens: toks };
}

/**
 * Tiered text score for one corpus entry against the expanded keywords.
 * Returns { text, matched } where text is 0..1-ish tier weight (pre-ranking).
 */
function textScore(entry, keywords, tokens) {
  const name = entry._name;                     // lowercased once at build time
  const code = entry._code;
  const nameTerms = entry._nameTerms || entry._terms; // strong signal (title/code)
  const terms = entry._terms;                   // recall signal (desc/skills/aliases)
  let best = 0;
  let matched = false;

  // Whole-query prefix/substring against the display name (strongest signal).
  const joined = tokens.join(' ');
  if (joined) {
    if (name === joined) { best = Math.max(best, 1.0); matched = true; }
    else if (name.startsWith(joined)) { best = Math.max(best, 0.9); matched = true; }
    else if (name.includes(joined)) { best = Math.max(best, 0.75); matched = true; }
  }

  for (const k of keywords) {
    if (!k) continue;
    if (nameTerms.has(k)) { best = Math.max(best, 0.95); matched = true; continue; } // exact in NAME
    if (name.includes(k) || code.includes(k)) { best = Math.max(best, 0.8); matched = true; continue; }
    if (terms.has(k)) { best = Math.max(best, 0.6); matched = true; continue; }       // exact in peripheral
    // fuzzy (typo tolerance): a name-term match dominates a peripheral one.
    let fz = 0;
    for (const t of nameTerms) { const v = fuzzyTier(k, t); if (v > fz) fz = v; }
    if (fz > 0) { best = Math.max(best, fz); matched = true; continue; }
    for (const t of terms) { const v = fuzzyTier(k, t); if (v > fz) fz = v; }
    if (fz > 0) { best = Math.max(best, fz * 0.5); matched = true; }                   // peripheral fuzzy halved
  }
  return { text: best, matched };
}

/**
 * The words people use for each service, beyond its catalog name. A problem
 * inside a service carries them too, so "bike puncture" finds the two-wheeler
 * puncture and not the car one. Keyed by repair vertical or line code.
 */
const LINE_CONCEPTS = {
  two_wheeler: 'bike motorcycle motorbike scooter scooty two wheeler 2 activa ev',
  four_wheeler: 'car vehicle four wheeler 4 suv jeep',
  mobile: 'phone mobile smartphone iphone android cellphone',
  laptop: 'laptop computer notebook macbook pc',
  water_tank_care: 'tank water sump overhead',
  pet: 'pet dog cat puppy kitten',
  helping: 'shopping pickup delivery errand return exchange courier',
  event: 'party birthday decoration decor event celebration',
};
function conceptsForLine(line) {
  const keys = [line.repairVertical, line.code, line.code?.split('_')[0], line.domainCode];
  const words = new Set();
  for (const k of keys) for (const w of (LINE_CONCEPTS[k] || '').split(' ').filter(Boolean)) words.add(w);
  return words;
}

/**
 * Turn a phrase into concepts: each meaningful word the customer typed, with
 * its everyday synonyms. Intent words ("towing" for a puncture) are extras:
 * they can lift a result but never count against one.
 */
function parseQuery(raw) {
  const tokens = tokenize(raw).filter((t) => !STOPWORDS.has(t));
  const concepts = tokens.map((t) => {
    const words = new Set([t]);
    if (SYNONYMS[t]) words.add(SYNONYMS[t]);
    if (t.length > 3 && t.endsWith('s')) { words.add(t.slice(0, -1)); if (SYNONYMS[t.slice(0, -1)]) words.add(SYNONYMS[t.slice(0, -1)]); }
    return { token: t, words };
  });
  const lower = String(raw || '').toLowerCase();
  const extras = new Set();
  for (const intent of INTENTS) if (intent.phrases.some((ph) => lower.includes(ph))) intent.keywords.forEach((k) => extras.add(k));
  // Only filler words typed ("fix it now"): the intent is all we have.
  if (!concepts.length) for (const k of extras) concepts.push({ token: k, words: new Set([k]) });
  return { tokens, concepts, extras, joined: tokens.join(' ') };
}

/** How strongly one word matches an entry, and the catalog word it was corrected to (typos). */
function wordMatch(entry, w, allowFuzzy) {
  if (entry._nameTerms.has(w)) return { s: 1 };
  if (w.length >= 3 && (entry._name.includes(w) || entry._code.includes(w))) return { s: 0.85 };
  if (entry._lineTerms?.has(w)) return { s: 0.7 };
  if (entry._terms.has(w)) return { s: 0.6 };
  if (!allowFuzzy || w.length < 4) return { s: 0 };
  let best = { s: 0 };
  for (const t of entry._nameTerms) { const v = fuzzyTier(w, t); if (v > best.s) best = { s: v, fixed: t }; }
  return best;
}

/**
 * Score one entry: the share of the customer's concepts it covers, weighted by
 * how well each matched, plus whole-phrase and intent bonuses. A result that
 * matches every word beats one that matches one word strongly.
 */
function scoreEntry(entry, query) {
  const { concepts, extras, joined } = query;
  if (!concepts.length) return { text: 0, coverage: 0, matched: false };
  let sum = 0;
  let hit = 0;
  const fixed = {};
  const hits = [];
  for (const c of concepts) {
    let best = { s: 0 };
    for (const w of c.words) {
      const m = wordMatch(entry, w, w === c.token && c.fuzzy !== false);
      if (m.s > best.s) best = m;
      if (best.s === 1) break;
    }
    if (best.s > 0) { hit += 1; sum += best.s; hits.push(c.token); if (best.fixed) fixed[c.token] = best.fixed; }
  }
  if (!hit) return { text: 0, coverage: 0, matched: false, hits };
  let text = sum / concepts.length;
  if (joined && entry._name === joined) text += 0.4;
  else if (joined && entry._name.startsWith(joined)) text += 0.3;
  else if (joined.length > 3 && entry._name.includes(joined)) text += 0.2;
  for (const k of extras) if (entry._nameTerms.has(k)) { text += 0.05; break; }
  // A title with words the customer did not say ("Slow puncture" for "puncture")
  // is a narrower case; the plain match comes first. Synonyms count as said.
  const said = new Set([...concepts.flatMap((c) => [...c.words]), ...Object.values(fixed)]);
  const extra = tokenize(entry._name).filter((w) => w.length > 2 && !said.has(w) && !said.has(SYNONYMS[w])).length;
  text -= Math.min(0.2, 0.04 * extra);
  return { text, coverage: hit / concepts.length, matched: true, fixed, hits };
}

module.exports = {
  tokenize, editDistance, fuzzyEq, expandQuery, textScore, parseQuery, scoreEntry, conceptsForLine,
  SYNONYMS, STOPWORDS, INTENTS, LINE_CONCEPTS,
};
