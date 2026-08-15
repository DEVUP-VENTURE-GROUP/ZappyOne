/**
 * Turns the live promo API (`GET /promos/available`) into per-service offers
 * for the catalog UI.
 *
 * Discount badges are only ever rendered from a real, currently-valid promo the
 * user can actually redeem — nothing is invented for decoration. A promo with
 * an empty `services` array applies to the whole catalog; otherwise it applies
 * only to the listed service codes. Promos the user has already used up are
 * dropped so the badge never promises something checkout will reject.
 */

import { formatRupees } from './serviceFacets';

/** Promos this user can still redeem, right now. */
export function usablePromos(promos = []) {
  return promos.filter((p) => !p.alreadyUsed && p.type !== 'loyalty');
}

/** Does this promo apply to this service code? */
function appliesTo(promo, code) {
  if (!Array.isArray(promo.services) || promo.services.length === 0) return true;
  return promo.services.includes(code);
}

/** Short badge copy for a promo — "20% OFF" / "₹200 OFF". */
export function promoBadge(promo) {
  if (!promo) return null;
  if (promo.type === 'percent') return `${promo.discountValue}% OFF`;
  return `${formatRupees(promo.discountValue)} OFF`;
}

/**
 * Rough comparable worth of a promo, used only to pick which badge to show when
 * several apply. Percent promos are scored against the service's entry price so
 * the comparison is like-for-like.
 */
function promoWorthPaise(promo, entryPricePaise) {
  if (promo.type === 'percent') {
    const raw = (entryPricePaise * promo.discountValue) / 100;
    return promo.maxDiscountPaise > 0 ? Math.min(raw, promo.maxDiscountPaise) : raw;
  }
  return promo.discountValue;
}

/**
 * Build `{ [serviceCode]: promo }` — the single best offer per service.
 * Services with no applicable promo are simply absent from the map.
 */
export function buildPromoMap(promos = [], services = []) {
  const live = usablePromos(promos);
  if (!live.length) return {};

  const map = {};
  for (const service of services) {
    const entry = Number(service.priceRangeMinPaise || 0);
    let best = null;
    let bestWorth = 0;
    for (const promo of live) {
      if (!appliesTo(promo, service.code)) continue;
      // A promo with a minimum order above this service's ceiling can never fire.
      const ceiling = Number(service.priceRangeMaxPaise || entry);
      if (promo.minOrderPaise > 0 && ceiling > 0 && promo.minOrderPaise > ceiling) continue;
      const worth = promoWorthPaise(promo, entry);
      if (worth > bestWorth) { best = promo; bestWorth = worth; }
    }
    if (best) map[service.code] = best;
  }
  return map;
}

/**
 * The headline offer for a category banner: the promo that covers the most
 * services in the current list, tie-broken by the one expiring soonest.
 */
export function headlinePromo(promoMap = {}, services = []) {
  const counts = new Map();
  for (const service of services) {
    const promo = promoMap[service.code];
    if (!promo) continue;
    const entry = counts.get(promo.code) || { promo, count: 0 };
    entry.count += 1;
    counts.set(promo.code, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return new Date(a.promo.expiresAt) - new Date(b.promo.expiresAt);
  });
  return ranked.length ? ranked[0].promo : null;
}

/** "Ends today" / "3 days left" — omitted when the promo runs longer than a fortnight. */
export function promoUrgency(promo) {
  if (!promo?.expiresAt) return null;
  const ms = new Date(promo.expiresAt) - Date.now();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / 86400000);
  if (days > 14) return null;
  if (days <= 1) return 'Ends today';
  return `${days} days left`;
}
