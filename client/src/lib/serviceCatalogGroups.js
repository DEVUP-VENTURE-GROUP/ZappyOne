/**
 * Single source of truth for grouping the live service catalog into customer-facing
 * categories (Phone, Laptop, Car, Bike, … and any NEW vertical an admin adds).
 *
 * The category taxonomy is now DB-driven: `GET /api/catalog/categories` returns the
 * admin-managed categories, and `applyCategoriesFromApi()` swaps them in at runtime.
 * The hardcoded BUILTIN_GROUPS below are only the pre-load fallback (and match the
 * seeded DB rows exactly, so there is no behaviour change until an admin edits).
 * Because the store notifies subscribers, a category an admin creates appears in the
 * customer catalog, the worker skill picker and the booking flow with no code change.
 *
 * Dispatch matches a worker to an order by exact `service` code equality, and a
 * service joins a category via its `category` field (set in the admin service
 * editor) — so grouping keys off `s.category`, with `codePrefixes` as a legacy
 * fallback. Matchers are evaluated in order, first match wins; a catch-all
 * guarantees no service is ever silently dropped.
 */
import { useSyncExternalStore } from 'react';

// Built-in fallback taxonomy (mirrors the seed-categories.js rows). Used until the
// DB categories load, and if the categories endpoint is unavailable.
const BUILTIN_GROUPS = [
  { key: 'mobile',     label: 'Phone Repair',           match: (s) => s.category === 'mobile' },
  { key: 'laptop',     label: 'Laptop Repair',          match: (s) => s.category === 'laptop' || s.code?.startsWith('laptop_') },
  { key: 'car',        label: 'Car Services',           match: (s) => s.category === 'car' || s.code?.startsWith('car_') || s.code === 'periodic_car_service' },
  { key: 'bike',       label: 'Bike Services',          match: (s) => s.category === 'bike' || s.code?.startsWith('bike_') },
  { key: 'event',      label: 'Event Crew',             match: (s) => s.category === 'event' || s.code?.startsWith('event_') },
  { key: 'pet',        label: 'Pet Care',               match: (s) => s.category === 'pet' || s.code?.startsWith('pet_') },
  { key: 'family',     label: 'Family & Elder Assist',  match: (s) => s.category === 'helper' },
  { key: 'smart',      label: 'Smart Home Devices',     match: (s) => s.category === 'other' },
  { key: 'appliance',  label: 'Appliances & Devices',   match: (s) => s.category === 'appliance' },
  { key: 'electrical', label: 'Electrical',             match: (s) => s.category === 'electrical' },
  { key: 'plumbing',   label: 'Plumbing',               match: (s) => s.category === 'plumbing' },
  { key: 'carpentry',  label: 'Carpentry & Locks',      match: (s) => s.category === 'carpentry' },
  { key: 'cleaning',   label: 'Cleaning & Tank Care',   match: (s) => s.category === 'cleaning' },
  { key: 'commercial', label: 'Commercial & Fleet',     match: (s) => s.category === 'vehicle' },
];

const CATCH_ALL = { key: 'other_services', label: 'Other Services' };

/** Kept for backward-compatible static imports; equals the built-in fallback. */
export const SERVICE_CATEGORY_GROUPS = BUILTIN_GROUPS;

/** Device-repair groups where brand + years-of-experience matter to customers. */
export const DEVICE_EXPERTISE_GROUPS = ['mobile', 'laptop'];

/** Built-in brand lists (fallback). Live brands come from the category record. */
export const CATEGORY_BRANDS = {
  mobile: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Google', 'Motorola', 'Nothing'],
  laptop: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI'],
};

/* ── Runtime store: DB categories replace the built-ins once loaded ──────────── */
let activeGroups = BUILTIN_GROUPS;
let brandsByKey = { ...CATEGORY_BRANDS };
const listeners = new Set();

/** Turn a DB category record into a group with a matcher. */
function toGroup(c) {
  const cats = (c.matchCategories && c.matchCategories.length) ? c.matchCategories : [c.key];
  const prefixes = c.codePrefixes || [];
  return {
    key: c.key,
    label: c.customerLabel,
    workerLabel: c.workerLabel || c.customerLabel,
    theme: c.theme,
    icon: c.icon,
    brands: c.brands || [],
    brandCategory: c.brandCategory || '',
    showInCustomer: c.showInCustomer !== false,
    match: (s) => cats.includes(s.category) || prefixes.some((p) => s.code?.startsWith(p)),
  };
}

/** Swap the taxonomy to the admin-managed categories (or back to built-ins). */
export function applyCategoriesFromApi(categories) {
  if (Array.isArray(categories) && categories.length) {
    activeGroups = categories
      .filter((c) => c.isActive !== false)
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(toGroup);
    brandsByKey = Object.fromEntries(activeGroups.filter((g) => g.brands?.length).map((g) => [g.key, g.brands]));
  } else {
    activeGroups = BUILTIN_GROUPS;
    brandsByKey = { ...CATEGORY_BRANDS };
  }
  listeners.forEach((l) => l());
}

export function getGroups() { return activeGroups; }
export function subscribeGroups(cb) { listeners.add(cb); return () => listeners.delete(cb); }

/** React hook — re-renders the caller whenever the taxonomy changes. */
export function useCategoryGroups() {
  return useSyncExternalStore(subscribeGroups, getGroups, () => BUILTIN_GROUPS);
}

/** Live brands for a category key (DB first, built-in fallback). */
export function getCategoryBrands(key) {
  return brandsByKey[key] || CATEGORY_BRANDS[key] || [];
}

/** The group key a single service belongs to (first matcher wins). */
export function groupKeyForService(service) {
  const g = activeGroups.find((grp) => grp.match(service));
  return g ? g.key : CATCH_ALL.key;
}

/**
 * Partition a flat catalog list into ordered, non-empty groups.
 * Returns `[{ key, label, services: [...] }]` in display order; every service
 * lands in exactly one group and nothing is dropped.
 */
export function groupCatalog(list = []) {
  const buckets = new Map();
  const order = [...activeGroups, CATCH_ALL];
  for (const grp of order) buckets.set(grp.key, { key: grp.key, label: grp.label, services: [] });

  for (const svc of list) {
    buckets.get(groupKeyForService(svc)).services.push(svc);
  }

  return order
    .map((grp) => buckets.get(grp.key))
    .filter((b) => b.services.length > 0);
}
