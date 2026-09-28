const { ZappyReferencePricing, ProviderPricing } = require('../models/pricing.model');
const { RepairConfig } = require('../models/config.model');
const { Repair } = require('../models/repair.model');
const { httpError } = require('../../../core/errors');


/**
 * Pricing resolution, deviation banding and snapshot construction.
 *
 * The resolution hierarchy (§54) is implemented as a SPECIFICITY SCORE rather
 * than a chain of if/else fallbacks. Each pricing row declares how narrowly it
 * applies (model+quality+mode+city is narrower than brand-only), every row that
 * *could* apply is fetched in one query, and the narrowest wins. Two reasons:
 *
 *   - It is one round trip instead of up to five sequential lookups.
 *   - Adding a new dimension later means adding one weight, not another branch
 *     in a five-deep fallback ladder that has to be kept in the same order in
 *     three different call sites.
 *
 * The precedence, highest first:
 *     city + model + quality + mode  →  … →  repair-only national default
 *
 * All arithmetic is integer paise. Currency never touches a float here.
 */

/** Weights are powers of two so a narrower match can never be outscored by a
 *  combination of broader ones. */
const SPECIFICITY = {
  modelCode: 16,
  cityCode: 8,
  qualityCode: 4,
  serviceMode: 2,
  brandCode: 1,
};

const CONFIG_CACHE_MS = 60_000;
const configCache = new Map();

/** Config is read on nearly every pricing call; cache briefly, per vertical. */
async function getConfig(vertical) {
  const hit = configCache.get(vertical);
  if (hit && hit.expires > Date.now()) return hit.value;

  let cfg = await RepairConfig.findOne({ vertical, supersededAt: null }).lean();
  if (!cfg) cfg = new RepairConfig({ vertical }).toObject(); // defaults, unsaved
  configCache.set(vertical, { value: cfg, expires: Date.now() + CONFIG_CACHE_MS });
  return cfg;
}

/** Invalidate after an admin edits configuration (§61 — never serve stale rules). */
function invalidateConfigCache(vertical = null) {
  if (vertical) configCache.delete(vertical);
  else configCache.clear();
}

/**
 * Does a stored row apply to this request? A null column on the row means
 * "any", so it matches; a set column must equal the request exactly.
 */
function rowApplies(row, ctx) {
  for (const key of Object.keys(SPECIFICITY)) {
    if (row[key] == null) continue;
    if (row[key] !== ctx[key]) return false;
  }
  return true;
}

function specificityOf(row) {
  let score = 0;
  for (const [key, weight] of Object.entries(SPECIFICITY)) {
    if (row[key] != null) score += weight;
  }
  return score;
}

/** Narrowest applicable row wins; ties break toward the most recently updated. */
function pickMostSpecific(rows, ctx) {
  let best = null;
  let bestScore = -1;
  for (const row of rows) {
    if (!rowApplies(row, ctx)) continue;
    const score = specificityOf(row);
    if (score > bestScore || (score === bestScore && best && row.updatedAt > best.updatedAt)) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

/** Human-readable trace of which dimensions the winning row matched on. */
function describeRow(row, label) {
  if (!row) return `${label}:none`;
  const dims = Object.keys(SPECIFICITY).filter((k) => row[k] != null);
  return `${label}:${dims.length ? dims.join('+') : 'default'}`;
}

/**
 * The Zappy reference band for a job. Returns null when no band is configured
 * at any level — callers must treat that as "cannot quote", not as free.
 */
/**
 * `ctx.vertical` is optional so existing mobile callers keep working, but it
 * should be passed: repair codes are unique per vertical, so without it a
 * laptop repair sharing a mobile repair's code could pick up mobile's band.
 */
async function resolveReferencePrice(ctx) {
  const rows = await ZappyReferencePricing.find({
    ...(ctx.vertical ? { vertical: ctx.vertical } : {}),
    repairCode: ctx.repairCode,
    supersededAt: null,
    isActive: true,
  }).lean();

  const row = pickMostSpecific(rows, ctx);
  if (!row) return null;

  return {
    minPaise: row.minPaise,
    recommendedPaise: row.recommendedPaise,
    maxPaise: row.maxPaise,
    partCostPaise: row.partCostPaise,
    labourPaise: row.labourPaise,
    warrantyDays: row.warrantyDays,
    referencePricingId: row._id,
    version: row.version,
    resolutionPath: describeRow(row, 'reference'),
  };
}

/** A specific provider's bookable price for a job, or null if they have none. */
async function resolveProviderPrice(ctx, { shopId = null, workerId = null } = {}) {
  if (!shopId && !workerId) return null;

  const rows = await ProviderPricing.find({
    ...(shopId ? { shopId } : { workerId }),
    ...(ctx.vertical ? { vertical: ctx.vertical } : {}),
    repairCode: ctx.repairCode,
    supersededAt: null,
    isActive: true,
    approvalStatus: { $in: ['approved', 'auto_approved'] },
  }).lean();

  const row = pickMostSpecific(rows, ctx);
  if (!row) return null;

  return shapePrice(row);
}

/** The shape every price resolver hands back, from one stored row. */
function shapePrice(row) {
  return {
    partPaise: row.partCostPaise,
    labourPaise: row.labourPaise,
    consumablesPaise: row.consumablesPaise,
    travelPaise: row.travelPaise,
    pickupPaise: row.pickupPaise,
    returnPaise: row.returnPaise,
    totalPaise: row.totalPaise,
    warrantyDays: row.warrantyDays,
    estimatedDurationMin: row.estimatedDurationMin,
    providerPricingId: row._id,
    version: row.version,
    resolutionPath: describeRow(row, 'provider'),
  };
}

/**
 * Every part grade this provider will do the repair at.
 *
 * resolveProviderPrice answers "what does this cost?" for ONE grade. But a
 * customer comparing shops has not picked a grade yet — that choice is half of
 * what they are comparing, because an original panel and a compatible one are
 * different prices and different warranties from the same technician.
 *
 * Worse, asking for a price with no grade would find nothing at all for a
 * provider who priced per grade: a row carrying qualityCode 'oem' does not
 * apply to a context asking for no grade, so a fully-priced shop would be
 * dropped as "no approved price". This resolves each grade the provider
 * actually priced and returns them together.
 *
 * Ordering is cheapest first — that is the number the customer scans, and it is
 * what the ranking below is scored on.
 */
async function resolveProviderPriceOptions(ctx, { shopId = null, workerId = null } = {}) {
  if (!shopId && !workerId) return [];

  const rows = await ProviderPricing.find({
    ...(shopId ? { shopId } : { workerId }),
    ...(ctx.vertical ? { vertical: ctx.vertical } : {}),
    repairCode: ctx.repairCode,
    supersededAt: null,
    isActive: true,
    approvalStatus: { $in: ['approved', 'auto_approved'] },
  }).lean();

  if (!rows.length) return [];

  const graded = [...new Set(rows.filter((r) => r.qualityCode).map((r) => r.qualityCode))];

  // No grade anywhere: one price, whatever part they fit. Said plainly rather
  // than invented as a grade the provider never claimed.
  if (!graded.length) {
    const row = pickMostSpecific(rows, { ...ctx, qualityCode: null });
    return row ? [{ qualityCode: null, ...shapePrice(row) }] : [];
  }

  const options = [];
  for (const qualityCode of graded) {
    const row = pickMostSpecific(rows, { ...ctx, qualityCode });
    if (row) options.push({ qualityCode, ...shapePrice(row) });
  }

  return options.sort((a, b) => a.totalPaise - b.totalPaise);
}

/**
 * Deviation of a provider's price from the reference recommendation, banded
 * per §12. Thresholds come from config — never hardcoded percentages.
 *
 * Only OVER-charging is penalised. A provider cheaper than reference is not a
 * consumer-protection problem, so a negative deviation is always green.
 */
async function evaluateDeviation({ vertical, totalPaise, referenceRecommendedPaise }) {
  const cfg = await getConfig(vertical);

  if (!referenceRecommendedPaise || referenceRecommendedPaise <= 0) {
    // No benchmark exists — a human must look at it rather than auto-approving.
    return { deviationPct: null, band: 'yellow', autoApprove: false, reason: 'no_reference' };
  }

  const deviationPct = ((totalPaise - referenceRecommendedPaise) / referenceRecommendedPaise) * 100;
  const rounded = Math.round(deviationPct * 100) / 100;

  if (rounded <= cfg.greenMaxDeviationPct) {
    return { deviationPct: rounded, band: 'green', autoApprove: !!cfg.autoApproveGreen, reason: 'within_band' };
  }
  if (rounded <= cfg.yellowMaxDeviationPct) {
    return { deviationPct: rounded, band: 'yellow', autoApprove: false, reason: 'above_normal' };
  }
  return {
    deviationPct: rounded,
    band: 'red',
    autoApprove: false,
    blocked: !!cfg.blockRed,
    reason: 'abnormal',
  };
}

/**
 * Build the immutable snapshot stored on a booking (§22).
 *
 * Fees, tax and commission are computed here from config at THIS moment and
 * frozen. Nothing downstream recomputes them — that is the whole guarantee the
 * snapshot exists to provide.
 */
/**
 * What collection and return cost for a journey of this length.
 *
 * A base to turn up, a per-kilometre rate after a free radius, and a ceiling so
 * nobody is ever shocked. Flat fees priced a two-street pickup the same as a
 * thirty-kilometre one, which is unfair in whichever direction you look at it.
 *
 * With no distance known — the provider has no pin, or the customer has not
 * placed one — it falls back to the configured flat fee rather than guessing a
 * journey length and billing for it.
 */
function logisticsFeePaise(cfg, distanceKm, legacyFlatPaise) {
  const perKm = cfg.pickupPerKmPaise || 0;
  if (!perKm || distanceKm == null || !Number.isFinite(distanceKm)) {
    return legacyFlatPaise || 0;
  }

  const chargeableKm = Math.max(0, distanceKm - (cfg.pickupFreeKm || 0));
  const fee = (cfg.pickupBaseFeePaise || 0) + Math.round(chargeableKm * perKm);
  const cap = cfg.pickupMaxFeePaise || 0;
  return cap > 0 ? Math.min(fee, cap) : fee;
}

async function buildPriceSnapshot({
  vertical,
  repairCode,
  providerPrice = null,
  referencePrice = null,
  serviceMode = 'doorstep',
  discountPaise = 0,
  distanceKm = null,
  addOnsTotalPaise = 0,
  addOnsCommissionPaise = 0,
}) {
  const cfg = await getConfig(vertical);
  const repair = repairCode ? await Repair.findOne({ code: repairCode, vertical }).lean() : null;
  const pricingMode = repair?.pricingMode || 'fixed';

  /**
   * Two different situations both bill only the inspection fee up-front, and
   * they must not be conflated:
   *
   *   diagnosis_only  — the CUSTOMER asked for an inspection and nothing more.
   *                     This is a complete, self-contained job.
   *   diagnosis_required — the customer wants a REPAIR, but it cannot be
   *                     honestly priced until someone opens the device.
   *
   * The money is the same today; the difference matters because an inspection
   * booking is finished when the report is delivered, whereas a
   * diagnosis-required booking is only just beginning.
   */
  const isInspectionOnly = serviceMode === 'diagnosis_only';
  if (isInspectionOnly || pricingMode === 'diagnosis_required') {
    const diagnosisFeePaise = cfg.diagnosisFeePaise || 0;
    const taxPaise = Math.round((diagnosisFeePaise * (cfg.taxPct || 0)) / 100);
    return {
      diagnosisFeePaise,
      subtotalPaise: diagnosisFeePaise,
      taxPaise,
      totalPaise: diagnosisFeePaise + taxPaise,
      platformFeePaise: 0,
      // The inspection fee is ZappyOne's, not the provider's, so no commission
      // is split out of it — the platform is the principal here.
      commissionPaise: 0,
      discountPaise: 0,
      currency: 'INR',
      pricingMode: isInspectionOnly ? 'fixed' : pricingMode,
      isEstimate: !isInspectionOnly,
      resolutionPath: isInspectionOnly ? 'inspection_only' : 'diagnosis_required',
      warrantyDays: isInspectionOnly ? 0 : (repair?.warrantyDays || 0),
      snapshotAt: new Date(),
    };
  }

  const source = providerPrice || referencePriceAsProvider(referencePrice);
  if (!source) return null;

  /**
   * A provider's price is ONE number, and it is final.
   *
   * Providers are no longer asked to split part from labour — they were told to
   * quote the finished job, part included, and that is what they typed. So when
   * the price came from a provider we do not invent a breakdown: the components
   * stay zero and the total is theirs. Showing a ₹700 "part" and a ₹600
   * "labour" against a shop that said ₹750 is describing a price nobody set.
   *
   * The reference band DOES carry a part/labour split, because that is how the
   * benchmark is researched and it is genuinely useful on an estimate — so the
   * breakdown survives only on that path.
   */
  const fromProvider = !!providerPrice;
  const partPaise = fromProvider ? 0 : (source.partPaise || 0);
  const labourPaise = fromProvider ? 0 : (source.labourPaise || 0);
  const consumablesPaise = fromProvider ? 0 : (source.consumablesPaise || 0);
  const travelPaise = source.travelPaise || 0;

  // Collection and return are the platform's logistics, priced by distance —
  // not part of what the provider quoted for the repair itself.
  const pickupPaise = serviceMode === 'pickup_repair'
    ? (source.pickupPaise || logisticsFeePaise(cfg, distanceKm, cfg.pickupFeePaise))
    : 0;
  const returnPaise = serviceMode === 'pickup_repair'
    ? (source.returnPaise || logisticsFeePaise(cfg, distanceKm, cfg.returnFeePaise))
    : 0;

  // Provider total is authoritative when present — the component breakdown is
  // declarative and may not sum exactly to it.
  const base = source.totalPaise != null
    ? source.totalPaise
    : partPaise + labourPaise + consumablesPaise;

  // Add-ons are part of the job the provider is doing, so they sit inside the
  // subtotal — taxed with it, and commissioned at the same rate (their own cut
  // is computed per line in buildAddOnSnapshots so a refund can name it).
  const subtotalPaise = base + travelPaise + pickupPaise + returnPaise + (addOnsTotalPaise || 0);
  const platformFeePaise = cfg.platformFeePaise || 0;
  const discounted = Math.max(0, subtotalPaise + platformFeePaise - (discountPaise || 0));
  const taxPaise = Math.round((discounted * (cfg.taxPct || 0)) / 100);
  const totalPaise = discounted + taxPaise;
  const commissionPaise = Math.round((base * (cfg.commissionPct || 0)) / 100)
    + (addOnsCommissionPaise || 0);

  return {
    partPaise,
    labourPaise,
    consumablesPaise,
    travelPaise,
    pickupPaise,
    returnPaise,
    diagnosisFeePaise: 0,
    platformFeePaise,
    taxPaise,
    discountPaise: discountPaise || 0,
    commissionPaise,
    subtotalPaise,
    totalPaise,
    currency: 'INR',
    providerPricingId: providerPrice?.providerPricingId || null,
    providerPricingVersion: providerPrice?.version || null,
    referencePricingId: referencePrice?.referencePricingId || null,
    referencePricingVersion: referencePrice?.version || null,
    /** How far the device has to travel, when that shaped the price. */
    distanceKm: serviceMode === 'pickup_repair' ? distanceKm : null,
    resolutionPath: providerPrice?.resolutionPath || referencePrice?.resolutionPath || 'unresolved',
    pricingMode,
    isEstimate: !providerPrice,
    /**
     * Never a band. See repair.model — the customer sees one number, and it is
     * either the provider's or it waits until someone has opened the device.
     * The columns stay on the booking schema so bookings sold under the old
     * rule still render their own history correctly.
     */
    rangeMinPaise: null,
    rangeMaxPaise: null,
    warrantyDays: providerPrice?.warrantyDays || referencePrice?.warrantyDays || repair?.warrantyDays || 0,
    snapshotAt: new Date(),
  };
}

/**
 * Price the add-on lines a customer chose alongside the primary repair.
 *
 * Each add-on is priced by the SAME provider doing the main job — a customer
 * adding disinfection to a tank clean is buying it from the shop that is
 * already coming, not from the cheapest disinfection provider in the city.
 * Where that provider has set no price for it, the reference band stands in
 * and the line is flagged `fromProvider: false` so it reads as an estimate.
 *
 * Eligibility is enforced here rather than trusted from the client: an add-on
 * must be marked `isAddOn`, live in the same vertical, and either name this
 * repair in `eligibleForRepairCodes` or name none at all.
 *
 * Returns the frozen snapshot lines plus the totals the main snapshot folds in.
 */
async function buildAddOnSnapshots({
  vertical,
  addOnCodes = [],
  primaryRepairCode = null,
  ctx = {},
  shopId = null,
  workerId = null,
}) {
  const codes = [...new Set((addOnCodes || []).filter(Boolean))];
  if (!codes.length) return { addOns: [], addOnsTotalPaise: 0, addOnsCommissionPaise: 0 };

  const cfg = await getConfig(vertical);
  const repairs = await Repair.find({
    code: { $in: codes }, vertical, isActive: true, isAddOn: true,
  }).lean();

  const found = new Map(repairs.map((r) => [r.code, r]));
  const unknown = codes.filter((c) => !found.has(c));
  if (unknown.length) {
    throw httpError(`Not an available add-on: ${unknown.join(', ')}`, 400, 'UNKNOWN_ADDON');
  }

  const addOns = [];
  let addOnsTotalPaise = 0;
  let addOnsCommissionPaise = 0;

  for (const code of codes) {
    const repair = found.get(code);

    const restricted = (repair.eligibleForRepairCodes || []).length > 0;
    if (restricted && !repair.eligibleForRepairCodes.includes(primaryRepairCode)) {
      throw httpError(
        `"${repair.name}" cannot be added to this service`, 400, 'ADDON_NOT_ELIGIBLE',
      );
    }

    const lineCtx = { ...ctx, repairCode: code };
    const providerPrice = (shopId || workerId)
      ? await resolveProviderPrice(lineCtx, { shopId, workerId })
      : null;
    const reference = providerPrice ? null : await resolveReferencePrice(lineCtx);
    const source = providerPrice || referencePriceAsProvider(reference);

    // An add-on nobody has priced is silently dropped rather than blocking the
    // whole booking — the customer still gets the primary repair they came for.
    if (!source || source.totalPaise == null) continue;

    const totalPaise = source.totalPaise;
    // Commission follows the same rule as the main job: Zappy's cut comes out
    // of the provider's number, and only when it IS a provider's number.
    const commissionPaise = providerPrice
      ? Math.round((totalPaise * (cfg.commissionPct || 0)) / 100)
      : 0;

    addOns.push({
      repairCode: code,
      name: repair.name,
      qualityCode: lineCtx.qualityCode || null,
      totalPaise,
      commissionPaise,
      estimatedDurationMin: source.estimatedDurationMin || repair.estimatedDurationMin || 0,
      warrantyDays: source.warrantyDays || repair.warrantyDays || 0,
      fromProvider: !!providerPrice,
    });
    addOnsTotalPaise += totalPaise;
    addOnsCommissionPaise += commissionPaise;
  }

  return { addOns, addOnsTotalPaise, addOnsCommissionPaise };
}

/** Reference band used as an indicative price when no provider is chosen yet. */
function referencePriceAsProvider(ref) {
  if (!ref) return null;
  return {
    partPaise: ref.partCostPaise || 0,
    labourPaise: ref.labourPaise || 0,
    totalPaise: ref.recommendedPaise,
    warrantyDays: ref.warrantyDays,
  };
}

module.exports = {
  getConfig,
  invalidateConfigCache,
  resolveReferencePrice,
  resolveProviderPrice,
  resolveProviderPriceOptions,
  evaluateDeviation,
  buildPriceSnapshot,
  buildAddOnSnapshots,
  // exported for tests
  _internals: { pickMostSpecific, specificityOf, rowApplies, SPECIFICITY },
};
