/**
 * Quote normalisation.
 * ----------------------------------------------------------------------------
 * `GET /orders/quote` does NOT return one shape. The pricing engine has a
 * per-vertical path, and each returns a different set of keys. Verified against
 * the live catalog (all 13 service categories):
 *
 *   legacy      baseFee, distanceFee, timeFee, platformFee, surgeMultiplier,
 *   (no         subtotal, total, distanceKm, etaMinutes, isUserPremium
 *    `vertical`) — electrical, carpentry, appliance, plumbing
 *   vehicle     baseVisitFee, distanceFee, emergencySurcharge, nightSurcharge,
 *               subtotal, total, distanceKm
 *   mobile      inspectionFee, laborFee, sparePartFee, urgentSurcharge,
 *               subtotal, total, warrantyDays, partsTier, pricingSource
 *   laptop      visitFee, diagnostic, labourFee, urgentSurcharge, total, note
 *   smart_device visitFee, labourFee, urgentSurcharge, total
 *   family_assist baseFee, serviceFee, urgentSurcharge, total
 *   pet         visitFee, serviceFee, urgentSurcharge, total
 *   event_crew  crewSize, estimatedHours, perHourPerMember, urgentSurcharge,
 *               total, note, ceilingApplied
 *
 * Note `laborFee` (mobile) vs `labourFee` (laptop, smart_device) — both
 * spellings are live, so both are mapped.
 *
 * ── THE PART THAT MATTERS ──────────────────────────────────────────────────
 * THE LINE ITEMS DO NOT ALWAYS SUM TO THE TOTAL. For `car_wash` the server
 * returns baseVisitFee ₹50 + distanceFee ₹1 = subtotal ₹51, but total ₹300 —
 * the total is floored to the service's catalog price, and the components were
 * only inputs to that decision. Printing "₹50 + ₹1" beside "₹300" would be
 * arithmetic nonsense to a customer and would misstate what they are paying.
 *
 * So `linesReconcile` is computed honestly: a breakdown renders ONLY when the
 * charges actually add up to the total. Otherwise the screen shows the total —
 * which is the number the server will charge — plus the contextual facts, and
 * says nothing it cannot back up.
 *
 * `total` is ALWAYS the server's figure. Nothing here recomputes a price.
 * ----------------------------------------------------------------------------
 */

export interface QuoteLine {
  key: string;
  label: string;
  /** Rupees, exactly as the server returned them. */
  value: number;
  group: ChargeGroup;
}

export interface QuoteSection {
  group: ChargeGroup;
  title: string;
  lines: QuoteLine[];
  /** Sum of this section only. Presentational — never the authoritative total. */
  subtotal: number;
}

export interface QuoteFact {
  key: string;
  label: string;
  value: string;
}

export interface NormalizedQuote {
  /** The server's authoritative total, in rupees. Never computed here. */
  total: number;
  currency: string;
  /** Charge components the server returned, in a stable display order. */
  lines: QuoteLine[];
  /** The same lines bucketed for display. Empty groups are omitted. */
  sections: QuoteSection[];
  /** True only when `lines` sum to `total` — see the header note. */
  linesReconcile: boolean;
  /** Non-monetary context: distance, ETA, warranty, crew size, parts tier. */
  facts: QuoteFact[];
  /** Server-authored caveat, e.g. "Parts cost quoted separately". */
  note?: string;
  vertical?: string;
  /** > 1 when surge pricing is in effect. */
  surgeMultiplier?: number;
}

/**
 * Charge keys → customer-facing labels, in display order.
 * Ordering is deliberate: what the visit costs, then the work, then travel,
 * then platform, then surcharges last.
 *
 * GROUPING. Charges are bucketed so the customer can see what the work costs
 * separately from what getting there costs and what the platform takes:
 *
 *   service   what the job itself costs
 *   extra     what the circumstances add — travel, time, night, urgency
 *   fee       what Zappy charges on top
 *
 * There is deliberately NO tax group. `pricing.service.js` emits no GST, VAT
 * or tax field of any kind for any vertical — every rupee key it can produce is
 * listed below — so a "Taxes" row would be an invented one.
 *
 * There is also no discount amount here. `discountPaise` and
 * `subtotalBeforeDiscount` exist only on the ORDER, written after a promo is
 * validated at creation (`order.service.js`); `GET /orders/quote` never carries
 * either. The quote can say a promo will apply, and must not print a figure.
 */
type ChargeGroup = 'service' | 'extra' | 'fee';

const CHARGE_LABELS: ReadonlyArray<readonly [string, string, ChargeGroup]> = [
  // ── What the job costs ──────────────────────────────────────────────────
  ['baseFee', 'Base fee', 'service'],
  ['baseVisitFee', 'Visit fee', 'service'],
  ['visitFee', 'Visit fee', 'service'],
  ['baseHookupFee', 'Hook-up fee', 'service'],
  ['inspectionFee', 'Inspection', 'service'],
  ['diagnostic', 'Diagnostics', 'service'],
  ['laborFee', 'Labour', 'service'],
  ['labourFee', 'Labour', 'service'],
  ['serviceFee', 'Service charge', 'service'],
  ['sparePartFee', 'Spare parts', 'service'],
  // ── What the circumstances add ──────────────────────────────────────────
  ['towFee', 'Towing', 'extra'],
  ['distanceFee', 'Travel', 'extra'],
  ['timeFee', 'Time', 'extra'],
  ['emergencySurcharge', 'Emergency surcharge', 'extra'],
  ['nightSurcharge', 'Night surcharge', 'extra'],
  ['urgentSurcharge', 'Urgent surcharge', 'extra'],
  // ── What Zappy charges on top ───────────────────────────────────────────
  ['platformFee', 'Platform fee', 'fee'],
];

/** Anything numeric that is NOT a charge — totals, metadata, nested paise. */
const NON_CHARGE_KEYS = new Set([
  'total',
  'subtotal',
  'totalPaise',
  'boostedTotal',
  'subtotalBeforeDiscount',
  'discountPaise',
  'tipPaise',
  'paise',
  'distanceKm',
  'etaMinutes',
  'warrantyDays',
  'crewSize',
  'estimatedHours',
  'perHourPerMember',
  'surgeMultiplier',
  'tierMultiplier',
  'snapshotCommissionRate',
  'teamSize',
]);

/** Turns an unmapped camelCase fee key into something readable. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reduce any quote payload to something a screen can render without knowing
 * which vertical it came from.
 */
export function normalizeQuote(
  raw: Record<string, unknown> | null | undefined,
): NormalizedQuote | null {
  if (!raw) return null;

  const total = num(raw.total);
  if (total == null) return null;

  const seen = new Set<string>();
  const lines: QuoteLine[] = [];

  // Mapped charges first, in the curated order above.
  for (const [key, label, group] of CHARGE_LABELS) {
    const value = num(raw[key]);
    seen.add(key);
    // Zero-value surcharges are noise — the server returns them as 0 by default.
    if (value != null && value > 0) lines.push({ key, label, value, group });
  }

  // Any fee the server adds later still shows up rather than silently vanishing.
  // An unmapped charge is filed under `extra`: calling it part of the service
  // price would be a guess, and calling it a platform fee would be worse.
  for (const [key, value] of Object.entries(raw)) {
    if (seen.has(key) || NON_CHARGE_KEYS.has(key)) continue;
    const amount = num(value);
    if (amount != null && amount > 0) {
      lines.push({ key, label: humanizeKey(key), value: amount, group: 'extra' });
    }
  }

  // Rounding across paise conversions can leave sub-rupee drift; ₹1 is the
  // tightest tolerance that doesn't produce false mismatches.
  const sum = lines.reduce((acc, line) => acc + line.value, 0);
  const linesReconcile = lines.length > 0 && Math.abs(sum - total) <= 1;

  const SECTION_TITLES: Record<ChargeGroup, string> = {
    service: 'Service price',
    extra: 'Additional charges',
    fee: 'Fees',
  };
  const sections: QuoteSection[] = (['service', 'extra', 'fee'] as const)
    .map((group) => {
      const groupLines = lines.filter((line) => line.group === group);
      return {
        group,
        title: SECTION_TITLES[group],
        lines: groupLines,
        subtotal: groupLines.reduce((acc, line) => acc + line.value, 0),
      };
    })
    .filter((section) => section.lines.length > 0);

  const facts: QuoteFact[] = [];
  const distanceKm = num(raw.distanceKm);
  if (distanceKm != null && distanceKm > 0) {
    facts.push({
      key: 'distanceKm',
      label: 'Distance',
      value: `${distanceKm < 1 ? distanceKm.toFixed(2) : distanceKm.toFixed(1)} km`,
    });
  }

  const etaMinutes = num(raw.etaMinutes);
  if (etaMinutes != null && etaMinutes > 0) {
    facts.push({ key: 'etaMinutes', label: 'Travel time', value: `${Math.round(etaMinutes)} min` });
  }

  const crewSize = num(raw.crewSize);
  const estimatedHours = num(raw.estimatedHours);
  const perHour = num(raw.perHourPerMember);
  if (crewSize != null && crewSize > 0) {
    facts.push({
      key: 'crewSize',
      label: 'Crew',
      value: `${crewSize} ${crewSize === 1 ? 'person' : 'people'}`,
    });
  }
  if (estimatedHours != null && estimatedHours > 0) {
    facts.push({ key: 'estimatedHours', label: 'Estimated', value: `${estimatedHours} h` });
  }
  if (perHour != null && perHour > 0) {
    facts.push({ key: 'perHourPerMember', label: 'Rate', value: `₹${perHour} / person / h` });
  }

  const warrantyDays = num(raw.warrantyDays);
  if (warrantyDays != null && warrantyDays > 0) {
    facts.push({ key: 'warrantyDays', label: 'Warranty', value: `${warrantyDays} days` });
  }

  if (typeof raw.partsTier === 'string' && raw.partsTier) {
    facts.push({ key: 'partsTier', label: 'Parts', value: raw.partsTier });
  }

  const surgeMultiplier = num(raw.surgeMultiplier) ?? undefined;

  return {
    total,
    currency: typeof raw.currency === 'string' ? raw.currency : 'INR',
    lines,
    sections,
    linesReconcile,
    facts,
    note: typeof raw.note === 'string' && raw.note ? raw.note : undefined,
    vertical: typeof raw.vertical === 'string' ? raw.vertical : undefined,
    surgeMultiplier: surgeMultiplier && surgeMultiplier > 1 ? surgeMultiplier : undefined,
  };
}

/**
 * Booking tiers, mirroring `TIER_MULTIPLIERS` in
 * `server/src/modules/order/order.service.js`.
 *
 * The quote endpoint accepts no tier param, so the server cannot price a tier
 * ahead of time — and by design it expects the client to send back the
 * TIER-ADJUSTED total as `quotedTotalRupees` so its surge guard compares like
 * with like (see the comment on `quotedTotalRupees` in `order.routes.js`).
 * That is why this constant exists on the client. It is used for the displayed
 * estimate and for that echo only; the amount actually charged is recomputed
 * server-side on every order.
 */
export const TIER_MULTIPLIERS = {
  standard: 1.0,
  priority: 1.2,
  express: 1.4,
} as const;

export type BookingTierKey = keyof typeof TIER_MULTIPLIERS;

/**
 * The total to display and to echo back as `quotedTotalRupees`.
 *
 * IMPORTANT — this deliberately does NOT subtract a promo discount. The server
 * applies promos AFTER its surge check (`order.service.js`: guard at the
 * `quotedTotalRupees` block, promo further down), so sending a discounted
 * figure makes the fresh total look inflated by exactly the discount and the
 * booking is rejected with PRICE_CHANGED. Tier and tip ARE applied before the
 * guard, so both belong in this number.
 */
export function quotedTotalForGuard(
  serverTotal: number,
  tier: BookingTierKey,
  tipRupees = 0,
): number {
  return Math.round(serverTotal * TIER_MULTIPLIERS[tier]) + Math.round(tipRupees);
}
