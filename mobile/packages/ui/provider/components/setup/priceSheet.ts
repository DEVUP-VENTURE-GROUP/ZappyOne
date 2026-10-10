/**
 * The rules of a shop's price sheet (the websites' PricingStep), as plain
 * functions so each is one pass over the shop's prices.
 *
 * A price is a cell: a repair, at a brand, at a model (or the whole brand when
 * the model is null), at a part grade. A brand-level row is what customers see
 * for any model of that brand with no row of its own.
 */

/** The part grades a repair can be quoted at, best first (the seeded PartQuality ranks). */
export const QUALITY_TIERS = [
  { code: 'oem', label: 'OEM / Genuine', hint: 'Manufacturer channel' },
  { code: 'premium', label: 'Premium', hint: 'High-grade compatible' },
  { code: 'standard', label: 'Standard', hint: 'Budget compatible' },
];
/** One flat price, for work that fits no part. */
export const FLAT_TIER = [{ code: '', label: 'Your price', hint: '' }];

export const WARRANTY_CHOICES = [0, 30, 60, 90, 180, 365];

export interface PriceRowData {
  _id: string; repairCode: string; brandCode?: string | null; modelCode?: string | null; qualityCode?: string | null;
  totalPaise: number; warrantyDays?: number; approvalStatus?: string;
}
export interface Suggestion { repairCode: string; qualityCode?: string | null; totalPaise: number }
export interface ClaimedRepair { code: string; name: string; usesPart?: boolean; warrantyDays?: number }

/** Key for one price cell: a repair at a grade. */
export const cellKey = (repairCode: string, qualityCode?: string | null) => `${repairCode}::${qualityCode || '_'}`;

export const tiersFor = (repair: ClaimedRepair) => (repair.usesPart ? QUALITY_TIERS : FLAT_TIER);

/** The shop's live rows for one sheet (a brand, and a model or the whole brand), by cell. */
export function existingFor(pricing: PriceRowData[], brand: string | null, model: string | null) {
  const map = new Map<string, PriceRowData>();
  for (const row of pricing) {
    if ((row.brandCode || null) !== brand || (row.modelCode || null) !== model) continue;
    map.set(cellKey(row.repairCode, row.qualityCode), row);
  }
  return map;
}

/** How many of the shop's rows land on each model of a brand ('__brand__' for the brand-wide sheet). */
export function countsFor(pricing: PriceRowData[], brand: string | null) {
  const counts = new Map<string, number>();
  for (const row of pricing) {
    if ((row.brandCode || null) !== brand) continue;
    const key = row.modelCode || '__brand__';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** Market prices for every box that is empty and not already priced, in rupees as typed. */
export function marketFill(suggestions: Suggestion[], values: Record<string, string>, existing: Map<string, PriceRowData>) {
  const fill: Record<string, string> = {};
  for (const s of suggestions) {
    const k = cellKey(s.repairCode, s.qualityCode);
    if (values[k] || existing.has(k)) continue;
    fill[k] = String(Math.round(s.totalPaise / 100));
  }
  return fill;
}

/** What one Save sends: every positive rupee amount typed on the sheet, in paise. */
export function rowsFromValues(values: Record<string, string>, claimed: ClaimedRepair[], brand: string | null, model: string | null) {
  const warranty = new Map(claimed.map((r) => [r.code, r.warrantyDays || 0]));
  const rows = [];
  for (const [key, raw] of Object.entries(values)) {
    const amount = Number(raw);
    if (!raw || !(amount > 0)) continue;
    const [repairCode, grade] = key.split('::');
    rows.push({
      repairCode, brandCode: brand, modelCode: model, qualityCode: grade === '_' ? null : grade,
      totalPaise: Math.round(amount * 100), warrantyDays: warranty.get(repairCode) || 0,
    });
  }
  return rows;
}

/** A brand's baseline at market prices, for every cell the shop has not priced at brand level. */
export function brandBaselineRows(suggestions: Suggestion[], pricing: PriceRowData[], brand: string, claimed: ClaimedRepair[]) {
  const have = new Set(pricing.filter((r) => r.brandCode === brand && !r.modelCode).map((r) => cellKey(r.repairCode, r.qualityCode)));
  const warranty = new Map(claimed.map((r) => [r.code, r.warrantyDays || 0]));
  return suggestions
    .filter((x) => !have.has(cellKey(x.repairCode, x.qualityCode)))
    .map((x) => ({ repairCode: x.repairCode, brandCode: brand, modelCode: null, qualityCode: x.qualityCode, totalPaise: x.totalPaise, warrantyDays: warranty.get(x.repairCode) || 0 }));
}

/** The warranty the shop gives on a repair: the longest on any of its prices, else the catalog's. */
export function warrantyOf(pricing: PriceRowData[], code: string, fallback = 0) {
  let best = -1;
  for (const r of pricing) if (r.repairCode === code) best = Math.max(best, r.warrantyDays || 0);
  return best >= 0 ? best : fallback;
}
