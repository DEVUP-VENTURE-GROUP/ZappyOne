/**
 * Which drawing belongs to which service.
 * ----------------------------------------------------------------------------
 * Port of `illustrationFor()` plus the rule tables it consumes
 * (`CAR_/MOBILE_/LAPTOP_/APPLIANCE_/EVENT_/GENERIC_ILLUSTRATION_RULES` in
 * `client/src/constants/catalogCategories.js`). Keyword lists, their ORDER and
 * the comments explaining the sharp edges are carried across unchanged — the
 * order is load-bearing, and several entries exist to defeat a specific
 * mis-match that was found in the real catalog.
 *
 * ── WHY TWO PASSES ─────────────────────────────────────────────────────────
 * From the website's own note: rules run first against the service's IDENTITY
 * (code, name, subcategory) and only then against the FULL text including
 * descriptions. Descriptions are prose and match far too eagerly — "Car Wash"
 * describes itself as including "interior vacuuming", which a single full-text
 * pass classified as an interior-cleaning job. Identity-first fixes that.
 * ----------------------------------------------------------------------------
 */

import { CATEGORY_THEME, DEFAULT_THEME } from './palette';
import { DRAWINGS } from './drawings';

/** Minimum shape a rule needs. Matches the catalog model's real fields. */
export interface MatchableService {
  code?: string;
  name?: string;
  subcategory?: string;
  shortDescription?: string;
  description?: string;
}

type Scope = 'identity' | 'full';
type Rule = [(s: MatchableService, scope: Scope) => boolean, string];

/** `haystack()` — identity is what the service IS, full is what it MENTIONS. */
function haystack(service: MatchableService, scope: Scope): string {
  const parts = [service.code, service.name, service.subcategory];
  if (scope !== 'identity') parts.push(service.shortDescription, service.description);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function kw(...words: string[]) {
  const needles = words.map((w) => w.toLowerCase());
  return (service: MatchableService, scope: Scope) => {
    const h = haystack(service, scope);
    return needles.some((w) => h.includes(w));
  };
}

const CAR_RULES: Rule[] = [
  [kw('ac gas', 'gas refill', 'refrigerant', 'r134'), 'ac-gas'],
  [kw('ac ', ' ac', 'air conditioning', 'cooling'), 'car-ac'],
  [kw('periodic', 'general service', 'full service', 'maintenance', 'scheduled'), 'periodic-service'],
  [kw('jump', 'jumpstart', 'jump start'), 'jumpstart'],
  [kw('battery'), 'battery'],
  [kw('alignment', 'align'), 'wheel-align'],
  [kw('balanc'), 'wheel-balance'],
  [kw('tyre', 'tire', 'puncture', 'wheel', 'stepney'), 'tyre'],
  [kw('foam wash', 'pressure wash'), 'foam-wash'],
  [kw('interior', 'vacuum', 'upholstery'), 'interior-clean'],
  [kw('ceramic', 'coating', 'polish', 'teflon'), 'ceramic'],
  [kw('detail'), 'detailing'],
  [kw('wash', 'clean'), 'car-wash'],
  [kw('scratch', 'buff'), 'scratch'],
  [kw('dent', 'denting'), 'dent'],
  [kw('paint'), 'paint'],
  [kw('windshield', 'windscreen', 'glass'), 'windshield'],
  // Not bare 'light' — it matches "taillight", "lighting", and any prose that
  // happens to mention lights.
  [kw('headlight', 'head lamp', 'head light'), 'headlight'],
  [kw('brake'), 'brake'],
  [kw('suspension', 'shock', 'strut'), 'suspension'],
  [kw('oil change', 'engine oil', 'lubric'), 'oil'],
  [kw('engine', 'diagnostic', 'scan'), 'engine'],
  [kw('insurance', 'claim'), 'insurance'],
  [kw('towing', 'tow'), 'towing'],
  [kw('fuel', 'petrol', 'diesel'), 'fuel'],
  [kw('roadside', 'breakdown', 'emergency'), 'roadside'],
  [kw('inspection', 'inspect', 'pre-purchase', 'pre purchase', 'checkup', 'health'), 'inspection'],
];

const MOBILE_RULES: Rule[] = [
  [kw('camera', 'lens'), 'phone-camera'],
  // Board BEFORE audio: "Micro-soldering" contains "mic", and the board terms
  // are more specific. 'mic ' (trailing space) avoids matching "micro".
  [kw('motherboard', 'mother board', 'logic board', ' ic ', 'micro-solder', 'microsolder', 'chip'), 'phone-board'],
  [kw('charging', 'charge', 'wireless charg', 'charging port'), 'phone-charging'],
  [kw('microphone', 'mic ', 'speaker', 'earpiece', 'loudspeaker', 'audio', 'sound'), 'phone-audio'],
  [kw('water', 'liquid'), 'phone-water'],
  [kw('screen', 'display', 'touch', 'digitizer', 'glass', 'panel', 'line'), 'phone-screen'],
  [kw('battery'), 'battery'],
  // software / os / data / buttons / dead device → the plain handset
  [kw('phone', 'device', 'software', 'os', 'data', 'button', 'volume', 'turning', 'power'), 'phone'],
];

const LAPTOP_RULES: Rule[] = [
  [kw('screen', 'display', 'panel'), 'laptop-screen'],
  [kw('ssd', 'ram', 'nvme', 'storage', 'upgrade', 'memory'), 'laptop-storage'],
  // 'motherboard'/'logic board' — NOT bare 'board' (that matches "keyboard").
  [kw('motherboard', 'mother board', 'logic board', 'chip'), 'phone-board'],
  [kw('battery', 'charging', 'magsafe', 'adapter', 'power', 'port'), 'battery'],
  [kw('laptop', 'keyboard', 'trackpad', 'thermal', 'fan', 'dust', 'clean', 'slow', 'virus', 'malware', 'data', 'software'), 'laptop'],
];

const APPLIANCE_RULES: Rule[] = [
  [kw('cctv', 'surveillance', 'camera'), 'cctv'],
  [kw('tv', 'television'), 'tv'],
  [kw('router', 'wifi', 'network', 'internet'), 'router'],
  [kw('washing', 'laundry', 'dryer', 'fridge', 'refrigerator', 'freezer', 'geyser', 'water heater', 'purifier', 'microwave', 'oven', 'chimney', 'stove', 'dishwasher'), 'appliance'],
];

const EVENT_RULES: Rule[] = [
  [kw('sound', 'light', 'dj', ' av', 'lighting'), 'event-av'],
  [kw('photo', 'video', 'camera'), 'cctv'],
  [kw('security', 'usher', 'guard'), 'helper'],
  [kw('clean'), 'cleaning'],
];

const GENERIC_RULES: Rule[] = [
  [kw('screen', 'display', 'touch'), 'phone-screen'],
  [kw('battery', 'charging', 'charger'), 'battery'],
  [kw('laptop', 'macbook', 'notebook'), 'laptop'],
  [kw('phone', 'mobile'), 'phone'],
  [kw('tv', 'television'), 'tv'],
  [kw('router', 'wifi', 'network', 'internet'), 'router'],
  [kw('cctv', 'camera', 'surveillance'), 'cctv'],
  [kw('lock', 'door'), 'lock'],
  [kw('automation', 'smart home'), 'smart-home'],
  [kw('bike', 'scooter', 'motorcycle'), 'bike'],
  [kw('pet', 'dog', 'grooming'), 'pet'],
  [kw('event', 'decor', 'wedding', 'birthday'), 'event'],
  [kw('sound', 'light', 'dj'), 'event-av'],
  [kw('tank', 'sump', 'sofa', 'cleaning', 'wash'), 'cleaning'],
  [kw('tap', 'pipe', 'leak', 'plumb', 'drain'), 'plumbing'],
  [kw('wiring', 'switch', 'electric', 'fan', 'mcb'), 'electrical'],
  [kw('carpent', 'wood', 'furniture', 'hinge'), 'carpentry'],
  [kw('washing machine', 'fridge', 'refrigerator', 'microwave', 'geyser', 'appliance'), 'appliance'],
  [kw('elder', 'companion', 'hospital', 'medicine', 'grocery'), 'helper'],
  [kw('inspection', 'diagnostic', 'check'), 'inspection'],
];

/** Category key → its ordered rule table, exactly as the website's CONFIG maps them. */
const RULES_BY_CATEGORY: Record<string, Rule[]> = {
  car: CAR_RULES,
  bike: CAR_RULES,
  commercial: CAR_RULES,
  mobile: MOBILE_RULES,
  laptop: LAPTOP_RULES,
  appliance: APPLIANCE_RULES,
  smart: APPLIANCE_RULES,
  event: EVENT_RULES,
};

/**
 * Resolve a service to a drawing key. Pure lookup — safe inside a render loop.
 * Falls back to the category's default drawing, then to `tools`.
 */
export function illustrationFor(
  service: MatchableService | null | undefined,
  categoryKey?: string | null,
): string {
  const fallback =
    (categoryKey && CATEGORY_THEME[categoryKey]?.illustration) || DEFAULT_THEME.illustration;
  if (!service) return fallback;

  const rules = (categoryKey && RULES_BY_CATEGORY[categoryKey]) || GENERIC_RULES;

  for (const scope of ['identity', 'full'] as Scope[]) {
    for (const [match, key] of rules) {
      if (match(service, scope) && DRAWINGS[key]) return key;
    }
    for (const [match, key] of GENERIC_RULES) {
      if (match(service, scope) && DRAWINGS[key]) return key;
    }
  }
  return DRAWINGS[fallback] ? fallback : 'tools';
}

export const hasIllustration = (name: string): boolean => Boolean(DRAWINGS[name]);
