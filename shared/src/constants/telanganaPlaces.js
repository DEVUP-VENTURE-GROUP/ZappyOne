/**
 * Where a provider can say they work, while ZappyOne launches in Telangana.
 *
 * Picked from a list rather than typed, so "Hyderabad", "hyd" and "Hydrabad"
 * are one place and a customer's search by city finds every provider who
 * covers it. Cities and towns only: "Hyderabad" covers the whole metro
 * (Secunderabad and Cyberabad included), because customers are matched by
 * city, not by neighbourhood. `slug` is stored; `name` is what people read.
 */
export const TELANGANA_PLACES = [
  { slug: 'hyderabad', name: 'Hyderabad (incl. Secunderabad & Cyberabad)' },
  { slug: 'warangal', name: 'Warangal / Hanamkonda' },
  { slug: 'karimnagar', name: 'Karimnagar' },
  { slug: 'nizamabad', name: 'Nizamabad' },
  { slug: 'khammam', name: 'Khammam' },
  { slug: 'mahbubnagar', name: 'Mahbubnagar' },
  { slug: 'nalgonda', name: 'Nalgonda' },
  { slug: 'sangareddy', name: 'Sangareddy' },
  { slug: 'siddipet', name: 'Siddipet' },
  { slug: 'vikarabad', name: 'Vikarabad' },
  { slug: 'suryapet', name: 'Suryapet' },
  { slug: 'adilabad', name: 'Adilabad' },
  { slug: 'mancherial', name: 'Mancherial' },
  { slug: 'ramagundam', name: 'Ramagundam' },
];

const BY_SLUG = new Map(TELANGANA_PLACES.map((p) => [p.slug, p]));

/** Short display name for a stored slug; older free-text values show as typed. */
export function placeName(slug) {
  const p = BY_SLUG.get(String(slug || '').toLowerCase());
  return p ? p.name.replace(/ \(.*\)$/, '') : slug;
}
