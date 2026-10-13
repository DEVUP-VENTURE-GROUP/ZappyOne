/**
 * What a customer pays for a repair, as the server works it out for each
 * provider and part grade (repair providers list → `bill`), for the website and
 * the app alike. The server builds the bill with the booking's own price
 * function, so the card, the confirm screen and the final bill are one number.
 */

/**
 * The price chosen with this provider: the grade the customer picked, else the provider's own.
 * @param {any} provider
 * @param {string | null | undefined} [qualityCode]
 */
export function chosenPrice(provider, qualityCode) {
  if (!provider) return { pricePaise: null, bill: null };
  const grade = (provider.priceOptions || []).find((o) => (o.qualityCode || null) === (qualityCode || null));
  const src = grade || provider;
  return { pricePaise: src.totalPaise ?? null, bill: src.bill || null };
}

/** The total to show: the server's full bill when it has one, else the bare price. */
export const totalOf = ({ pricePaise, bill }) => (bill?.totalPaise ?? pricePaise ?? null);

/**
 * What the bill adds on top of the repair, the way delivery apps show it: one
 * fee line (journey, platform fee, any small-job top-up together, never the
 * kilometres) and taxes. Providers and admin still see the full breakdown.
 */
export function billExtras(bill) {
  if (!bill) return [];
  const journeyPaise = (bill.travelPaise || 0) + (bill.pickupPaise || 0) + (bill.returnPaise || 0);
  const feePaise = journeyPaise + (bill.smallJobPaise || 0) + (bill.platformFeePaise || 0);
  return [
    [feeLabel(bill), feePaise],
    ['Taxes', bill.taxPaise],
  ].filter(([, paise]) => paise > 0).map(([label, paise]) => ({ label, paise }));
}

/** The one fee line's name, from what is in it. */
export function feeLabel(b = {}) {
  if ((b.pickupPaise || 0) + (b.returnPaise || 0) > 0) return 'Pickup, return & service fee';
  return b.travelPaise > 0 ? 'Visit & service fee' : 'Service fee';
}

/** Nearby enough that the visit costs nothing: worth saying ("Free visit"). */
export const freeVisit = (bill, serviceMode) => !!bill && ['doorstep', 'roadside'].includes(serviceMode) && !bill.travelPaise;
