// What a partner's ServicePro dashboard shows, from the domains they are verified in: the extra sections each domain needs and the words its trade uses. A domain's own `dashboard` (admin-editable) wins over these defaults; a new domain with neither gets the plain dashboard.
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('./onboarding.model');

// Sections every partner has are in ServicePro's own menu; these are the ones a trade adds.
const OPTIONAL = ['pricereq', 'plans', 'insights'];
// How a trade's day looks on its home: a repair pipeline, a visit timeline, an hour-by-hour appointment book or a task list.
const HOMES = ['workshop', 'visits', 'appointments', 'tasks'];

const DEFAULTS = {
  electronics: { home: 'workshop', modules: ['pricereq', 'insights'], labels: { orders: 'Repairs', work: 'Repairs & prices', team: 'Technicians', shop: 'Shop & hours' }, terms: { job: 'repair', pro: 'technician', warranty: true } },
  vehicles: { home: 'workshop', modules: ['pricereq', 'plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Mechanics', shop: 'Garage & hours' }, terms: { job: 'service', pro: 'mechanic', warranty: true } },
  home_services: { home: 'visits', modules: ['plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Technicians', shop: 'Business & hours' }, terms: { job: 'service', pro: 'technician', warranty: true } },
  home_daily_help: { home: 'visits', modules: ['plans'], labels: { orders: 'Visits', work: 'Services & prices', team: 'Helpers', shop: 'Business & hours' }, terms: { job: 'visit', pro: 'helper', warranty: false } },
  beauty_care: { home: 'appointments', modules: ['plans'], labels: { orders: 'Appointments', work: 'Menu & prices', team: 'Stylists', shop: 'Salon & hours' }, terms: { job: 'appointment', pro: 'stylist', warranty: false } },
  errands_pickup: { home: 'tasks', modules: [], labels: { orders: 'Tasks', work: 'Services & prices', team: 'Runners', shop: 'Business & hours' }, terms: { job: 'task', pro: 'runner', warranty: false } },
  family_assist: { home: 'visits', modules: ['plans'], labels: { orders: 'Visits', work: 'Services & prices', team: 'Helpers', shop: 'Business & hours' }, terms: { job: 'visit', pro: 'helper', warranty: false } },
  specialist_home: { home: 'visits', modules: ['plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Crew', shop: 'Business & hours' }, terms: { job: 'job', pro: 'specialist', warranty: true } },
  local_pros: { home: 'appointments', modules: ['plans'], labels: { orders: 'Sessions', work: 'Classes & prices', team: 'Teachers', shop: 'Profile & hours' }, terms: { job: 'class', pro: 'teacher', warranty: false } },
  moving: { home: 'visits', modules: ['insights'], labels: { orders: 'Moves', work: 'Services & prices', team: 'Crew', shop: 'Business & hours' }, terms: { job: 'move', pro: 'mover', warranty: false } },
  pet_services: { home: 'visits', modules: ['plans'], labels: { orders: 'Bookings', work: 'Services & prices', team: 'Groomers', shop: 'Business & hours' }, terms: { job: 'booking', pro: 'pet pro', warranty: false } },
};

// How customers read a booking in this trade (jobKinds, confirm, messages): what it is called, who comes, and whether a warranty applies. Repair words when nothing says otherwise.
const REPAIR_TERMS = { job: 'repair', pro: 'technician', warranty: true };
const TERM_KEYS = ['job', 'pro', 'warranty'];
function termsOf(domain) {
  const own = domain?.dashboard?.labels?.terms || {};
  const base = { ...REPAIR_TERMS, ...(DEFAULTS[domain?.code]?.terms || {}) };
  for (const k of TERM_KEYS) if (own[k] !== undefined && own[k] !== '') base[k] = k === 'warranty' ? !!own[k] : String(own[k]).toLowerCase();
  return base;
}

// A service line's words: its trade's, plus what a package service (one priced menu, no real device) changes.
// Services whose words differ from their category's: a bike wash has a washer, not a mechanic.
const LINE_TERMS = {
  bike_wash: { job: 'wash', pro: 'washer', warranty: false },
  car_wash: { job: 'wash', pro: 'washer', warranty: false },
  car_detailing: { job: 'detailing', pro: 'detailer', warranty: false },
  water_tank_care: { job: 'cleaning', pro: 'cleaner', warranty: false },
};

// What a job in this trade goes through, beyond its words: a diagnosis before the work, quotes for extra work, photos of the finished work. Repairs by default; a category, then a service, narrows it; admin can set a category's own (domain.dashboard.flow).
const REPAIR_FLOW = { diagnosis: true, quote: true, photos: true };
const DOMAIN_FLOW = {
  home_services: { diagnosis: false },
  home_daily_help: { diagnosis: false, quote: false },
  specialist_home: { diagnosis: false },
  beauty_care: { diagnosis: false, quote: false, photos: false },
  local_pros: { diagnosis: false, quote: false, photos: false },
  moving: { diagnosis: false },
};
const LINE_FLOW = {
  bike_wash: { diagnosis: false, quote: false },
  car_wash: { diagnosis: false, quote: false },
  car_detailing: { diagnosis: false, quote: false },
  home_cleaning: { quote: false },
  appliance_repair: { diagnosis: true },
  gadget_repair: { diagnosis: true },
};
const FLOW_KEYS = ['diagnosis', 'quote', 'photos'];
function flowOf(line, domain) {
  const flow = { ...REPAIR_FLOW, ...(DOMAIN_FLOW[domain?.code] || {}) };
  const own = domain?.dashboard?.flow || {};
  for (const k of FLOW_KEYS) if (typeof own[k] === 'boolean') flow[k] = own[k];
  return { ...flow, ...(LINE_FLOW[line?.repairVertical] || LINE_FLOW[line?.code] || {}) };
}

function lineTerms(line, domain) {
  const types = line?.packageDef?.types || [];
  return {
    ...termsOf(domain),
    ...(LINE_TERMS[line?.repairVertical] || LINE_TERMS[line?.code] || {}),
    packaged: !!line?.packageDef,
    singleType: types.length <= 1,
    typeWord: line?.typeWord || '',
    name: line?.name || '',
    flow: flowOf(line, domain),
  };
}

// For one repair vertical, from its line; repair words for a vertical with no line. Kept a minute: domains and lines change rarely.
const termCache = new Map();
async function termsForVertical(vertical) {
  const hit = termCache.get(vertical);
  if (hit && hit.at > Date.now() - 60000) return hit.terms;
  const line = await ServiceLine.findOne({ repairVertical: vertical }).select('code repairVertical name domainCode typeWord packageDef.types').lean();
  const domain = line ? await ServiceDomain.findOne({ code: line.domainCode }).select('code dashboard').lean() : null;
  const terms = line ? lineTerms(line, domain) : { ...REPAIR_TERMS, packaged: false, singleType: false, typeWord: '', name: '', flow: { ...REPAIR_FLOW } };
  if (termCache.size > 500) termCache.clear();
  termCache.set(vertical, { at: Date.now(), terms });
  return terms;
}

const configOf = (domain) => ({
  home: [domain.dashboard?.home, DEFAULTS[domain.code]?.home].find((h) => HOMES.includes(h)) || 'workshop',
  modules: (domain.dashboard?.modules || DEFAULTS[domain.code]?.modules || []).filter((m) => OPTIONAL.includes(m)),
  labels: { ...(DEFAULTS[domain.code]?.labels || {}), ...(domain.dashboard?.labels || {}) },
});

// Sections are the union of every domain the partner works in; words come from the domain with the most of their services, so a salon that also sells a plan still reads like a salon.
async function workspaceFor(owner) {
  const key = owner.kind === 'shop' ? { shopId: owner.id } : { workerId: owner.id };
  const enrolments = await ProviderEnrolment.find({ ...key, status: 'approved' }).select('lineCode').lean();
  if (!enrolments.length) return { domains: [], modules: [], labels: {}, home: 'workshop' };
  const lines = await ServiceLine.find({ code: { $in: enrolments.map((e) => e.lineCode) } }).select('domainCode').lean();
  const count = lines.reduce((m, l) => m.set(l.domainCode, (m.get(l.domainCode) || 0) + 1), new Map());
  const domains = await ServiceDomain.find({ code: { $in: [...count.keys()] } }).select('code name dashboard').lean();
  domains.sort((a, b) => count.get(b.code) - count.get(a.code));
  const configs = domains.map(configOf);
  return {
    domains: domains.map((d) => ({ code: d.code, name: d.name, services: count.get(d.code) })),
    modules: OPTIONAL.filter((m) => configs.some((c) => c.modules.includes(m))),
    labels: configs[0]?.labels || {},
    home: configs[0]?.home || 'workshop',
  };
}

module.exports = { workspaceFor, configOf, termsOf, lineTerms, termsForVertical, flowOf, REPAIR_FLOW, REPAIR_TERMS, DEFAULTS, OPTIONAL, HOMES };
