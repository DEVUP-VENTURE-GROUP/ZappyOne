/**
 * Category ↔ service matching.
 * ----------------------------------------------------------------------------
 * Mirrors the server's own grouping rules from `category.model.js`, so mobile
 * groups services exactly as the website does:
 *
 *   1. `matchCategories` when present, else the category `key`
 *   2. legacy `codePrefixes` fallback, for services whose `category` field
 *      hasn't been backfilled
 *
 * A naive `service.category === category.key` is WRONG and silently drops
 * services: the `family` group owns `helper`, `commercial` owns `vehicle`, and
 * several groups rely purely on the prefix match.
 *
 * Lives here — not inside a screen — because the Services tab and the Category
 * screen both need it and the logic must not diverge between them.
 * ----------------------------------------------------------------------------
 */

import type { ServiceCatalogItem, ServiceCategory } from '../../types/api';

export function serviceMatchesCategory(
  service: ServiceCatalogItem,
  category: ServiceCategory,
): boolean {
  const owned =
    category.matchCategories && category.matchCategories.length > 0
      ? category.matchCategories
      : [category.key];

  if (owned.includes(service.category)) return true;

  return (category.codePrefixes ?? []).some((prefix) => service.code.startsWith(prefix));
}

/** The category that owns a service, or null. First match wins, as on the web. */
export function categoryForService(
  service: ServiceCatalogItem,
  categories: ServiceCategory[],
): ServiceCategory | null {
  return categories.find((c) => serviceMatchesCategory(service, c)) ?? null;
}

/** Service count per category key. */
export function countByCategory(
  services: ServiceCatalogItem[],
  categories: ServiceCategory[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of categories) {
    counts[category.key] = services.filter((s) =>
      serviceMatchesCategory(s, category),
    ).length;
  }
  return counts;
}
