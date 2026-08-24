/**
 * Catalog facets — the category page's filter chips.
 * ----------------------------------------------------------------------------
 * A port of `client/src/lib/serviceFacets.js`. Its header note applies verbatim
 * here: every matcher reads fields the catalog actually returns — code, name,
 * subcategory, descriptions, price range, duration, isFeatured, checklist —
 * and nothing is invented.
 *
 * A facet with a zero count is dropped before render, so a category only ever
 * shows chips that lead somewhere. "All" is always first and always counts the
 * whole pool.
 * ----------------------------------------------------------------------------
 */

import type { ServiceCatalogItem } from '../../types/api';

export type FacetMatcher = (service: ServiceCatalogItem) => boolean;

export interface FacetDef {
  key: string;
  label: string;
  match: FacetMatcher;
}

export interface ResolvedFacet extends FacetDef {
  count: number;
}

/** The text a keyword rule is matched against. */
function haystack(service: ServiceCatalogItem): string {
  return [
    service.code,
    service.name,
    service.subcategory,
    service.shortDescription,
    service.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Facet matcher: any of `words` appears in the service's text. */
export function kw(...words: string[]): FacetMatcher {
  const needles = words.map((w) => w.toLowerCase());
  return (service) => {
    const h = haystack(service);
    return needles.some((w) => h.includes(w));
  };
}

/** Facet matcher: the catalog flags it as featured. */
export const isFeatured: FacetMatcher = (service) => Boolean(service.isFeatured);

/** Facet matcher: jobs that finish inside `mins`. */
export const fasterThan =
  (mins: number): FacetMatcher =>
  (service) =>
    Number(service.estimatedDurationMinutes) > 0 &&
    Number(service.estimatedDurationMinutes) <= mins;

/** Facet matcher: entry price at or below `rupees`. */
export const cheaperThan =
  (rupees: number): FacetMatcher =>
  (service) =>
    Number(service.priceRangeMinPaise) > 0 &&
    Number(service.priceRangeMinPaise) <= rupees * 100;

/** Resolve declared facets against a live service list, dropping empty ones. */
export function buildFacets(
  defs: FacetDef[] = [],
  services: ServiceCatalogItem[] = [],
): ResolvedFacet[] {
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
export function applyFacet(
  services: ServiceCatalogItem[],
  facets: ResolvedFacet[],
  activeKey: string,
): ServiceCatalogItem[] {
  if (!activeKey || activeKey === 'all') return services;
  const facet = facets.find((f) => f.key === activeKey);
  return facet ? services.filter(facet.match) : services;
}

/**
 * The hero's stat pills, measured from the services in this category —
 * the website's own comment on this row is "no claims".
 */
export interface CategoryStats {
  count: number;
  fromRupees: number | null;
  fastestMin: number | null;
  withChecklist: number;
}

export function categoryStats(services: ServiceCatalogItem[]): CategoryStats | null {
  if (services.length === 0) return null;

  let fromPaise = Infinity;
  let fastestMin = Infinity;
  let withChecklist = 0;

  for (const s of services) {
    const paise = s.servicePricePaise || s.priceRangeMinPaise || 0;
    if (paise > 0 && paise < fromPaise) fromPaise = paise;
    const mins = s.estimatedDurationMinutes || 0;
    if (mins > 0 && mins < fastestMin) fastestMin = mins;
    if ((s.checklist?.length ?? 0) > 0) withChecklist += 1;
  }

  return {
    count: services.length,
    fromRupees: Number.isFinite(fromPaise) ? Math.round(fromPaise / 100) : null,
    fastestMin: Number.isFinite(fastestMin) ? fastestMin : null,
    withChecklist,
  };
}

/**
 * Free-text search over the same haystack the keyword facets use.
 * Mirrors the website's behaviour of never dead-ending on a typo: the caller
 * falls back to the unsearched list and says so.
 */
export function searchServices(
  services: ServiceCatalogItem[],
  query: string,
): ServiceCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return services;
  return services.filter((s) => haystack(s).includes(q));
}
