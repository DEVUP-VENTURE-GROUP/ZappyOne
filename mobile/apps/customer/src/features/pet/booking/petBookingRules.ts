/**
 * The rules of a pet booking (the website's PetBookingFlowPage), as plain
 * data. One adaptive flow for every category: which questions appear is
 * decided by the variant's own pricing unit (a stay asks for dates, transport
 * for a destination, a walk for a time), never by category name.
 */
export interface PetVariant { code: string; name: string; description?: string; species: string[]; isPopular?: boolean; pricingUnit?: string; allowedModes?: string[] }
export interface PetQuote { lines: { linePaise: number }[]; totalPaise: number; taxPaise?: number; platformFeePaise?: number; addonsPaise?: number; travelPaise?: number; pickupPaise?: number; returnPaise?: number; specialHandlingPaise?: number; stayDiscountPaise?: number; couponPaise?: number }
export interface PetProvider { capabilityId: string; workerId?: string; shopId?: string; name: string; rating?: number | null; distanceKm?: number | null; completedJobs?: number; arrivalMinutes?: number | null; arrivalWithinPromise?: boolean }

export const STEPS = ['pets', 'variant', 'addons', 'schedule', 'location', 'providers', 'confirm'];

export const needsDates = (v?: PetVariant) => v?.pricingUnit === 'per_night' || v?.pricingUnit === 'per_day';
export const needsTransport = (v?: PetVariant) => v?.pricingUnit === 'per_km';
export const modeOf = (v?: PetVariant) => v?.allowedModes?.[0] || 'doorstep';

/**
 * Everything on a quote besides each pet's own line, so the breakdown adds up
 * to the total. Peak pricing and waiting show as one balancing line.
 */
export function petExtraLines(q: PetQuote): [string, number][] {
  const lines = ([
    ['Add-ons', q.addonsPaise], ['Travel', q.travelPaise], ['Pickup', q.pickupPaise], ['Drop back', q.returnPaise],
    ['Special handling', q.specialHandlingPaise], ['Stay discount', -(q.stayDiscountPaise || 0)], ['Coupon', -(q.couponPaise || 0)],
    ['Platform fee', q.platformFeePaise], ['Taxes', q.taxPaise],
  ] as [string, number | undefined][]).filter(([, p]) => p) as [string, number][];
  const shown = q.lines.reduce((t, l) => t + (l.linePaise || 0), 0) + lines.reduce((t, [, p]) => t + p, 0);
  const gap = (q.totalPaise || 0) - shown;
  if (Math.abs(gap) >= 100) lines.splice(lines.length - 2, 0, [gap > 0 ? 'Peak time & waiting' : 'Adjustment', gap]);
  return lines;
}
