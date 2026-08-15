/**
 * Facet engine for the Zappy service catalog.
 *
 * The catalog is 100% DB-driven (`/api/catalog/services`) — the frontend never
 * hardcodes a service list. So the sub-filters a category shows ("AC Service",
 * "Battery", "Tyres & Wheels", …) can't be a static list either: they're
 * *declared* per category in `constants/catalogCategories.js` and then
 * *resolved* here against whatever the catalog currently returns. A facet with
 * zero matching services never renders, and a newly-seeded service is picked up
 * with no code change.
 *
 * Everything in this module reads only fields the catalog model actually has
 * (code, name, subcategory, descriptions, price range, duration, isFeatured,
 * checklist) — nothing is invented.
 */

/**
 * The text a keyword rule is matched against.
 *
 * `identity` — code, name and subcategory: what the service *is*.
 * `full`     — plus both descriptions: what it happens to mention.
 *
 * The split matters because descriptions are prose and match far too eagerly.
 * "Car Wash" describes itself as including "interior vacuuming", which made a
 * naive full-text match classify it as an interior-cleaning job. Callers that
 * need precision (illustration routing) match on identity first; callers that
 * want reach (filter facets, search) use the full text.
 */
export function haystack(service, scope = 'full') {
  const parts = [service.code, service.name, service.subcategory];
  if (scope !== 'identity') parts.push(service.shortDescription, service.description);
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Keyword matcher: true when any of `words` appears in the service's text.
 * The returned function takes an optional `scope` (see `haystack`); omitting it
 * matches the full text, which is what facets want.
 */
export function kw(...words) {
  const needles = words.map((w) => w.toLowerCase());
  return (service, scope) => {
    const h = haystack(service, scope);
    return needles.some((w) => h.includes(w));
  };
}

/** Facet matcher: admin-flagged featured services. */
export const isFeatured = (service) => Boolean(service.isFeatured);

/** Facet matcher: jobs that finish inside `mins`. */
export const fasterThan = (mins) => (service) =>
  Number(service.estimatedDurationMinutes) > 0 &&
  Number(service.estimatedDurationMinutes) <= mins;

/** Facet matcher: entry price at or below `rupees`. */
export const cheaperThan = (rupees) => (service) =>
  Number(service.priceRangeMinPaise) > 0 &&
  Number(service.priceRangeMinPaise) <= rupees * 100;

/**
 * Resolve declared facets against a live service list.
 * Returns `[{ key, label, count, match }]` — always led by "All", and with
 * empty facets dropped so the rail never shows a filter that finds nothing.
 */
export function buildFacets(defs = [], services = []) {
  const resolved = defs
    .map((def) => ({
      ...def,
      count: services.reduce((n, s) => n + (def.match(s) ? 1 : 0), 0),
    }))
    .filter((def) => def.count > 0);

  return [
    { key: 'all', label: 'All', count: services.length, match: () => true },
    ...resolved,
  ];
}

/** Narrow a list by the active facet key (unknown key = no filtering). */
export function applyFacet(services, facets, activeKey) {
  if (!activeKey || activeKey === 'all') return services;
  const facet = facets.find((f) => f.key === activeKey);
  return facet ? services.filter(facet.match) : services;
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

export const paiseToRupees = (paise) => Math.round(Number(paise || 0) / 100);

/** "₹1,299" — Indian digit grouping, no decimals (catalog prices are whole ₹). */
export function formatRupees(paise) {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

/** Entry price for a card. Falls back to a quote CTA when unpriced. */
export function startingPrice(service) {
  const min = Number(service.priceRangeMinPaise || 0);
  return min > 0 ? formatRupees(min) : null;
}

/** "45 min" / "1h 30m" / "3 hrs" */
export function formatDuration(minutes) {
  const m = Number(minutes || 0);
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!rest) return `${h} ${h === 1 ? 'hr' : 'hrs'}`;
  return `${h}h ${rest}m`;
}

/**
 * The one-line supporting copy under a service title.
 * Prefers the admin-authored short description, then the long one.
 */
export function serviceBlurb(service, fallback = 'Verified professional at your doorstep') {
  return service.shortDescription || service.description || fallback;
}

/**
 * Real trust signals derived from catalog data — never fabricated.
 * `checklist` is the admin-defined job checklist the worker must complete.
 */
export function serviceProofPoints(service) {
  const points = [];
  const checks = Array.isArray(service.checklist) ? service.checklist.length : 0;
  if (checks) points.push(`${checks}-point checklist`);
  const duration = formatDuration(service.estimatedDurationMinutes);
  if (duration) points.push(duration);
  return points;
}

/**
 * Headline facts for a category, computed from the services it actually
 * contains. Everything here is measured, never claimed — if the catalog has no
 * priced service the price fact simply doesn't appear.
 */
export function categoryStats(services = []) {
  if (!services.length) return [];

  const priced = services.map((s) => Number(s.priceRangeMinPaise || 0)).filter((p) => p > 0);
  const timed = services
    .map((s) => Number(s.estimatedDurationMinutes || 0))
    .filter((m) => m > 0);
  const withChecklist = services.filter((s) => (s.checklist?.length || 0) > 0).length;

  const stats = [
    { key: 'count', label: `${services.length} ${services.length === 1 ? 'service' : 'services'}` },
  ];
  if (priced.length) stats.push({ key: 'price', label: `From ${formatRupees(Math.min(...priced))}` });
  if (timed.length) stats.push({ key: 'time', label: `Fastest ${formatDuration(Math.min(...timed))}` });
  if (withChecklist) stats.push({ key: 'checks', label: `${withChecklist} with job checklists` });

  return stats;
}

/** Sort: featured first, then admin sortOrder, then name — matches API intent. */
export function sortForDisplay(services = []) {
  return [...services].sort((a, b) => {
    if (Boolean(b.isFeatured) !== Boolean(a.isFeatured)) return b.isFeatured ? 1 : -1;
    const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (order) return order;
    return String(a.name).localeCompare(String(b.name));
  });
}
