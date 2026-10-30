// What a partner's ServicePro dashboard shows, from the domains they are verified in: the extra sections each domain needs and the words its trade uses. A domain's own `dashboard` (admin-editable) wins over these defaults; a new domain with neither gets the plain dashboard.
const { ServiceDomain, ServiceLine, ProviderEnrolment } = require('./onboarding.model');

// Sections every partner has are in ServicePro's own menu; these are the ones a trade adds.
const OPTIONAL = ['pricereq', 'plans', 'insights'];
// How a trade's day looks on its home: a repair pipeline, a visit timeline, an hour-by-hour appointment book or a task list.
const HOMES = ['workshop', 'visits', 'appointments', 'tasks'];

const DEFAULTS = {
  electronics: { home: 'workshop', modules: ['pricereq', 'insights'], labels: { orders: 'Repairs', work: 'Repairs & prices', team: 'Technicians', shop: 'Shop & hours' } },
  vehicles: { home: 'workshop', modules: ['pricereq', 'plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Mechanics', shop: 'Garage & hours' } },
  home_services: { home: 'visits', modules: ['plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Technicians', shop: 'Business & hours' } },
  home_daily_help: { home: 'visits', modules: ['plans'], labels: { orders: 'Visits', work: 'Services & prices', team: 'Helpers', shop: 'Business & hours' } },
  beauty_care: { home: 'appointments', modules: ['plans'], labels: { orders: 'Appointments', work: 'Menu & prices', team: 'Stylists', shop: 'Salon & hours' } },
  errands_pickup: { home: 'tasks', modules: [], labels: { orders: 'Tasks', work: 'Services & prices', team: 'Runners', shop: 'Business & hours' } },
  family_assist: { home: 'visits', modules: ['plans'], labels: { orders: 'Visits', work: 'Services & prices', team: 'Helpers', shop: 'Business & hours' } },
  specialist_home: { home: 'visits', modules: ['plans', 'insights'], labels: { orders: 'Jobs', work: 'Services & prices', team: 'Crew', shop: 'Business & hours' } },
  local_pros: { home: 'appointments', modules: ['plans'], labels: { orders: 'Sessions', work: 'Classes & prices', team: 'Teachers', shop: 'Profile & hours' } },
  pet_services: { home: 'visits', modules: ['plans'], labels: { orders: 'Bookings', work: 'Services & prices', team: 'Groomers', shop: 'Business & hours' } },
};

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

module.exports = { workspaceFor, configOf, DEFAULTS, OPTIONAL, HOMES };
