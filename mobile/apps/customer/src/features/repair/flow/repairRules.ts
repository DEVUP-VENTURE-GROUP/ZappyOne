/**
 * The rules of the repair booking (the website's RepairFlowPage), as plain
 * data and functions. One engine for every vertical: the extra steps appear
 * when the catalog has something to put in them, never by vertical name.
 */

/**
 * The funnel is built, not declared: `fuel`, `type`, `family`, `config` and
 * `addons` remove themselves when the catalog has nothing to ask.
 */
export function buildSteps(deep: boolean): string[] {
  return deep
    ? ['brand', 'type', 'family', 'model', 'config', 'fuel', 'problem', 'diagnose', 'mode', 'provider', 'addons', 'confirm']
    : ['brand', 'model', 'problem', 'diagnose', 'mode', 'provider', 'addons', 'confirm'];
}

/** How each vertical talks about the thing being repaired; unknown verticals get generic words. */
const NOUNS: Record<string, { brand: string; type: string; build: string; it: string }> = {
  mobile: { brand: 'phone brand', type: 'kind of device', build: 'build', it: 'your phone' },
  laptop: { brand: 'laptop brand', type: 'kind of machine', build: 'build', it: 'your laptop' },
  two_wheeler: { brand: 'brand', type: 'kind of vehicle', build: 'variant', it: 'your vehicle' },
  four_wheeler: { brand: 'car brand', type: 'body type', build: 'variant', it: 'your car' },
};
const DEFAULT_NOUNS = { brand: 'brand', type: 'type', build: 'variant', it: 'it' };
export const nounsFor = (vertical: string) => NOUNS[vertical] || DEFAULT_NOUNS;

export const FUEL_LABELS: Record<string, string> = { petrol: 'Petrol', diesel: 'Diesel', cng: 'CNG', hybrid: 'Hybrid', electric: 'Electric' };

/** One name per service mode, shared by every screen that shows one. */
export const MODE_LABEL: Record<string, string> = { doorstep: 'Home Service', pickup_repair: 'Pickup & repair', workshop: 'Workshop', diagnosis_only: 'Inspection' };
export const MODE_BLOCKED_REASON: Record<string, string> = {
  doorstep: 'it needs workshop equipment that does not travel.',
  pickup_repair: 'this one is quick enough to finish on the spot.',
};

export function stepTitles(vertical: string, brandName: string | undefined, serviceMode: string): Record<string, string> {
  const noun = nounsFor(vertical);
  const inspection = serviceMode === 'diagnosis_only';
  return {
    brand: `Which ${noun.brand}?`,
    type: `What ${noun.type}?`,
    family: `Which ${brandName || ''} line?`,
    model: `Which ${brandName || ''} model?`,
    config: `Which ${noun.build} do you have?`,
    fuel: 'Which engine does it have?',
    problem: `What's wrong with ${noun.it}?`,
    diagnose: 'A few quick questions',
    mode: 'How should we do it?',
    provider: inspection ? 'Inspection' : 'Choose who repairs it',
    addons: 'Anything else?',
    confirm: inspection ? 'Confirm your inspection' : 'Confirm your booking',
  };
}

/** What the customer pays with a provider and grade, worked out by the server (shared/customer/repairBill). */
export interface RepairBill {
  totalPaise: number; travelPaise: number; pickupPaise: number; returnPaise: number;
  platformFeePaise: number; taxPaise: number; smallJobPaise: number; distanceKm: number | null;
}

export interface Provider {
  bill?: RepairBill | null;
  shopId?: string; workerId?: string; name: string; imageUrl?: string; totalPaise?: number | null; rating?: number | null;
  durationMinutes?: number; etaMinutes?: number; arrivalMinutes?: number | null; arrivalWithinPromise?: boolean; busy?: boolean; availableInMinutes?: number;
  distanceKm?: number | null; completedJobs?: number; warrantyDays?: number; zappyRecommended?: boolean; auto?: boolean;
  priceOptions?: { qualityCode?: string | null; label: string; totalPaise: number; warrantyDays?: number; isGenuine?: boolean; bill?: RepairBill | null }[];
}

/** Two results for the same shop or technician. */
export function samePlace(a?: Provider | null, b?: Provider | null) {
  if (!a || !b) return false;
  if (a.shopId && b.shopId) return String(a.shopId) === String(b.shopId);
  if (a.workerId && b.workerId) return String(a.workerId) === String(b.workerId);
  return false;
}

const priceOf = (p: Provider) => p.totalPaise ?? Math.min(...(p.priceOptions || []).map((o) => o.totalPaise ?? Infinity), Infinity);

/**
 * The full comparison list, in the order the customer asked for. 'best' keeps
 * the server's ranking with the recommended shop first; the other sorts reorder
 * the whole set, so choosing one never hides the pick.
 */
export function rankProviders(providers: Provider[], recommended: Provider | null | undefined, sortBy: 'best' | 'fast' | 'cheap'): Provider[] {
  const all = recommended ? [recommended, ...providers.filter((p) => !samePlace(p, recommended))] : [...providers];
  if (sortBy === 'fast') return [...all].sort((a, b) => (a.arrivalMinutes ?? a.etaMinutes ?? 1e9) - (b.arrivalMinutes ?? b.etaMinutes ?? 1e9));
  if (sortBy === 'cheap') return [...all].sort((a, b) => priceOf(a) - priceOf(b));
  return all;
}
