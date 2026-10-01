/**
 * Who in the admin team may do what.
 *
 *   permission  = `${area}:${action}`   action: read | write
 *   role        → a set of permissions ('*' = everything, 'area:*' = both actions)
 *   admin       → a role, optional extra permissions, and a scope (markets / cities)
 *
 * Every admin API path belongs to exactly one area (AREA_RULES). A request
 * needs `area:read` for GET and `area:write` for anything else. A path no rule
 * matches is super-admin only, so a new endpoint is closed until someone
 * decides who should have it.
 */

const AREAS = {
  overview: 'Dashboard headline numbers',
  insights: 'Analytics and reports',
  intelligence: 'Intelligence platform: forecasts, expansion, simulations, AI',
  catalog: 'Services, prices and what is offered',
  customers: 'Customer accounts',
  bookings: 'Bookings and live jobs',
  support: 'Tickets and disputes',
  providers: 'Provider verification, shops and workers',
  events: 'Event commerce',
  marketing: 'Promos, rewards, plans, notifications, ads and content',
  money: 'Payments, refunds, payouts, wallets',
  operations: 'Service areas, fraud, cancellation policy, live operations',
  system: 'Feature flags, platform health, audit',
  admins: 'Admin team and roles',
};

const ROLES = {
  super_admin: { label: 'Super admin', permissions: ['*'] },
  ops: {
    label: 'Operations',
    permissions: ['overview:read', 'insights:read', 'intelligence:read', 'catalog:*', 'customers:*', 'bookings:*', 'support:*',
      'providers:*', 'events:*', 'operations:*', 'marketing:read', 'money:read', 'system:read'],
  },
  finance: {
    label: 'Finance',
    permissions: ['overview:read', 'insights:read', 'intelligence:read', 'money:*', 'bookings:read', 'customers:read',
      'providers:read', 'marketing:read', 'events:read', 'system:read'],
  },
  support: {
    label: 'Support',
    permissions: ['overview:read', 'bookings:*', 'customers:*', 'support:*', 'providers:read', 'operations:read'],
  },
  marketing: {
    label: 'Marketing',
    permissions: ['overview:read', 'insights:read', 'intelligence:read', 'marketing:*', 'customers:read', 'events:read'],
  },
  analyst: {
    label: 'Analyst',
    permissions: ['overview:read', 'insights:read', 'intelligence:read', 'catalog:read', 'customers:read', 'bookings:read',
      'providers:read', 'events:read', 'marketing:read', 'money:read', 'operations:read'],
  },
  city_manager: {
    label: 'City manager',
    permissions: ['overview:read', 'insights:read', 'intelligence:read', 'bookings:*', 'customers:read', 'support:*',
      'providers:*', 'operations:read'],
  },
  board_member: { label: 'Board member', permissions: ['overview:read', 'insights:read', 'intelligence:read'] },
};

/** First match wins; order specific paths before general ones. Paths are relative to the admin API root. */
const AREA_RULES = [
  [/^\/(me|admins)(\/|$)/, 'admins'],
  [/^\/(metrics|revenue|alerts)(\/|$)/, 'overview'],
  [/^\/intelligence(\/|$)/, 'intelligence'],
  [/^\/(analytics|business|demand-patterns|geo-analytics|heatmap|otp-analytics|retention|search-analytics)(\/|$)/, 'insights'],
  // Each engine's bookings live under its catalog prefix but are bookings work.
  [/^\/(pet\/bookings|helping\/tasks|repair\/bookings)(\/|$)/, 'bookings'],
  [/^\/onboarding\/(overview|domains|lines)(\/|$)/, 'catalog'],
  [/^\/onboarding(\/|$)/, 'providers'],
  [/^\/(repair|pet|helping|verticals|pricing|pricing-config|toggles|dispatch)(\/|$)/, 'catalog'],
  [/^\/users(\/|$)/, 'customers'],
  [/^\/(bookings|orders|sos)(\/|$)/, 'bookings'],
  [/^\/(support|disputes)(\/|$)/, 'support'],
  [/^\/(workers|kyc|shops|worker|worker-ops|incentives)(\/|$)/, 'providers'],
  [/^\/events(\/|$)/, 'events'],
  [/^\/(promos|cashback|referrals|rewards-config|plans|notifications|ads|content|cities)(\/|$)/, 'marketing'],
  [/^\/(payments|payouts|wallet|shield|emergency-fund|audit)(\/|$)/, 'money'],
  [/^\/(zones|launch-interest|fraud|cancellation-config|liveops|stuck-jobs)(\/|$)/, 'operations'],
  [/^\/(feature-flags|system|audit-logs)(\/|$)/, 'system'],
];

function areaFor(path) {
  const hit = AREA_RULES.find(([re]) => re.test(path));
  return hit ? hit[1] : null;
}

/** Everything an admin may do: their role's permissions plus any granted individually. */
function permissionsOf(admin) {
  const role = ROLES[admin?.role];
  return new Set([...(role ? role.permissions : []), ...(admin?.permissions || [])]);
}

function can(admin, area, action) {
  const perms = permissionsOf(admin);
  return perms.has('*') || perms.has(`${area}:*`) || perms.has(`${area}:${action}`);
}

/** The areas an admin can see, for the console to show only what they may open. */
function visibleAreas(admin) {
  return Object.keys(AREAS).filter((a) => can(admin, a, 'read'));
}

module.exports = { AREAS, ROLES, AREA_RULES, areaFor, permissionsOf, can, visibleAreas };
