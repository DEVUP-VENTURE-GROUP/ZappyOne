/**
 * Single source of truth for grouping the live service catalog into the same
 * customer-facing categories the booking flow shows (Phone, Laptop, Car, Bike,
 * Smart Devices, Family, Events, Pets) plus the home/commercial verticals.
 *
 * Dispatch matches a worker to an order by exact `service` code equality
 * (worker.skills must contain order.service). So the worker portal must let a
 * worker opt into services BY CODE — and it must stay in lockstep with whatever
 * the admin catalog currently offers. Both WorkerSkillsPage and WorkerOnboarding
 * build their selectors from this module against `/api/catalog/services`, so a
 * new service added to the catalog automatically appears for workers with no
 * code change.
 *
 * Matchers are evaluated in order, first match wins, and a catch-all guarantees
 * no service is ever silently dropped from the worker portal.
 */

export const SERVICE_CATEGORY_GROUPS = [
  { key: 'mobile',     label: 'Phone Repair',           match: (s) => s.category === 'mobile' },
  { key: 'laptop',     label: 'Laptop Repair',          match: (s) => s.category === 'laptop' || s.code?.startsWith('laptop_') },
  { key: 'car',        label: 'Car Services',           match: (s) => s.category === 'car' || s.code?.startsWith('car_') || s.code === 'periodic_car_service' },
  { key: 'bike',       label: 'Bike Services',          match: (s) => s.category === 'bike' || s.code?.startsWith('bike_') },
  { key: 'event',      label: 'Event Crew',             match: (s) => s.code?.startsWith('event_') },
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

/** Device-repair groups where brand + years-of-experience matter to customers. */
export const DEVICE_EXPERTISE_GROUPS = ['mobile', 'laptop'];

export const CATEGORY_BRANDS = {
  mobile: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Google', 'Motorola', 'Nothing'],
  laptop: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI'],
};

/** The group key a single service belongs to (first matcher wins). */
export function groupKeyForService(service) {
  const g = SERVICE_CATEGORY_GROUPS.find((grp) => grp.match(service));
  return g ? g.key : CATCH_ALL.key;
}

/**
 * Partition a flat catalog list into ordered, non-empty groups.
 * Returns `[{ key, label, services: [...] }]` in display order; every service
 * lands in exactly one group and nothing is dropped.
 */
export function groupCatalog(list = []) {
  const buckets = new Map();
  const order = [...SERVICE_CATEGORY_GROUPS, CATCH_ALL];
  for (const grp of order) buckets.set(grp.key, { key: grp.key, label: grp.label, services: [] });

  for (const svc of list) {
    buckets.get(groupKeyForService(svc)).services.push(svc);
  }

  return order
    .map((grp) => buckets.get(grp.key))
    .filter((b) => b.services.length > 0);
}
