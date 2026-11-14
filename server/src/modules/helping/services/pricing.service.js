/**
 * Helping Services pricing (§20, §21, §52).
 *
 * Two numbers come out of here and they never merge:
 *
 *   SERVICE CHARGE — what ZappyOne is owed for the errand. Base + distance +
 *                    waiting + extra stops + overtime + handling, then platform
 *                    fee and tax. Commission comes out of THIS.
 *
 *   ITEM MONEY     — what the shop charged for the goods. Not revenue, not
 *                    earnings, not commissionable. It passes through.
 *
 * Every figure is read from HelpingConfig. There is no fee literal in this
 * file, which is the point of §51 — an operator retunes the category from
 * admin without a deploy.
 */

const { HelpingConfig } = require('../models/config.model');
const { kmBetween } = require('../../../core/geo/distance');
const { httpError } = require('../../../core/errors');


const configCache = new Map();
const CACHE_MS = 30000;

async function getConfig(serviceType) {
  const hit = configCache.get(serviceType);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.doc;

  const doc = await HelpingConfig.findOne({ serviceType, isActive: true });
  if (!doc) {
    throw httpError(`No pricing is configured for ${serviceType}`, 503, 'NO_CONFIG');
  }
  configCache.set(serviceType, { doc, at: Date.now() });
  return doc;
}

/** Widest match radius across active helping services (km). */
async function maxMatchRadiusKm() {
  const hit = configCache.get('*radius');
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.doc;
  const [row] = await HelpingConfig.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, km: { $max: '$matchRadiusKm' } } },
  ]);
  const km = row?.km || HelpingConfig.schema.path('matchRadiusKm').defaultValue;
  configCache.set('*radius', { doc: km, at: Date.now() });
  return km;
}

function invalidateConfigCache(serviceType = null) {
  if (serviceType) { configCache.delete(serviceType); configCache.delete('*radius'); }
  else configCache.clear();
}

/**
 * Trip distance across every leg the helper actually travels.
 *
 * Pickup → each stop → destination, not a straight line from start to finish:
 * a two-stop errand covers more ground than its endpoints suggest, and
 * charging the endpoint distance would quietly underpay the helper on exactly
 * the tasks that take longest.
 */
function tripDistanceKm({ pickupLocation, destination, stops = [] }) {
  const legs = [
    pickupLocation?.coordinates,
    ...stops.map((s) => s.location?.coordinates).filter(Boolean),
    destination?.coordinates,
  ].filter((c) => Array.isArray(c) && c.length === 2);

  if (legs.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < legs.length; i += 1) total += kmBetween(legs[i - 1], legs[i]);
  return Math.round(total * 100) / 100;
}

/**
 * Price an errand.
 *
 * `waitingMinutes` and `overtimeMinutes` are ZERO at booking and non-zero only
 * when the task is re-priced at completion — a customer is quoted for the job
 * as described, and anything beyond it goes through an approval first (§36).
 */
async function quote({
  serviceType,
  pickupLocation = null,
  destination = null,
  stops = [],
  waitingMinutes = 0,
  overtimeMinutes = 0,
  specialHandling = false,
  discountPaise = 0,
  itemBudgetPaise = 0,
  waivePlatformFee = false,
  // A helper's own rates (helping/models/provider-rate): their fees replace ZappyOne's; the platform fee, tax and commission stay.
  rate = null,
}) {
  const cfg = await getConfig(serviceType);

  if (stops.length > cfg.maxStops) {
    throw httpError(
      `At most ${cfg.maxStops} stops can be planned on one task`, 400, 'TOO_MANY_STOPS',
    );
  }
  if (itemBudgetPaise > cfg.maxItemBudgetPaise) {
    throw httpError(
      `The item budget exceeds the limit for this service`, 400, 'BUDGET_TOO_HIGH',
      { maxItemBudgetPaise: cfg.maxItemBudgetPaise },
    );
  }

  const distanceKm = tripDistanceKm({ pickupLocation, destination, stops });
  // A trip past the last band is still quoted by a person, whoever's rates price it.
  const banded = cfg.distanceFeeFor(distanceKm);
  const distanceFeePaise = rate ? Math.round(rate.perKmPaise * Math.max(0, (distanceKm || 0) - (rate.includedKm || 0))) : banded.feePaise;
  const requiresQuote = banded.requiresQuote;

  // Only minutes BEYOND the free allowance are billable.
  const billableWaiting = Math.max(0, waitingMinutes - cfg.freeWaitingMinutes);
  const waitingFeePaise = billableWaiting * (rate ? rate.waitingPerMinutePaise || 0 : cfg.waitingPerMinutePaise);

  // The first stop is the errand itself; extras are extra work.
  const extraStops = Math.max(0, stops.length - cfg.includedStops);
  const multiStopFeePaise = extraStops * (rate ? rate.extraStopPaise || 0 : cfg.additionalStopFeePaise);

  const blocks = overtimeMinutes > 0
    ? Math.ceil(overtimeMinutes / cfg.timeExtensionBlockMinutes)
    : 0;
  const timeExtensionPaise = rate ? 0 : blocks * cfg.timeExtensionFeePaise;

  const specialHandlingPaise = specialHandling ? (rate ? rate.specialHandlingPaise || 0 : cfg.specialHandlingFeePaise) : 0;
  const baseFeePaise = rate ? rate.baseFeePaise : cfg.baseFeePaise;

  const feesPaise = baseFeePaise
    + distanceFeePaise
    + waitingFeePaise
    + multiStopFeePaise
    + timeExtensionPaise
    + specialHandlingPaise;

  const platformFeePaise = waivePlatformFee ? 0 : (cfg.platformFeePaise || 0);
  const discounted = Math.max(0, feesPaise + platformFeePaise - (discountPaise || 0));
  const taxPaise = Math.round((discounted * (cfg.taxPct || 0)) / 100);
  const serviceChargePaise = discounted + taxPaise;

  /*
   * Commission is a slice of the FEES, not of the service charge including the
   * platform fee and tax — Zappy does not take a commission on its own fee or
   * on the government's tax. And never, under any circumstance, on item money.
   */
  // A partner at their own rates pays their partner commission (shop/partner-commission); the service's rate is for ZappyOne staff.
  const pc = require('../../shop/partner-commission');
  const partnerPct = rate ? await pc.forBase(await pc.pctFor(rate.shopId ? { shopId: rate.shopId } : { workerId: rate.workerId }), feesPaise) : null;
  const commissionPaise = Math.round((feesPaise * (partnerPct ?? cfg.commissionPct ?? 0)) / 100);
  const workerEarningPaise = Math.max(0, feesPaise - commissionPaise);

  return {
    baseFeePaise,
    distanceFeePaise,
    waitingFeePaise,
    multiStopFeePaise,
    timeExtensionPaise,
    specialHandlingPaise,
    platformFeePaise,
    taxPaise,
    discountPaise: discountPaise || 0,

    serviceChargePaise,
    commissionPaise,
    commissionBasePaise: feesPaise,
    workerEarningPaise,

    currency: 'INR',
    distanceKm,
    waitingMinutes,
    quoteRequired: requiresQuote,
    snapshotAt: new Date(),
  };
}

/**
 * What the customer authorises up front: the errand, plus the ceiling on the
 * shopping. Presented as two lines, never one, so nobody reads the item budget
 * as ZappyOne's price (§9).
 */
function authorisationTotal(charge, itemBudgetPaise = 0) {
  return {
    serviceChargePaise: charge.serviceChargePaise,
    itemBudgetPaise,
    maxAuthorisationPaise: charge.serviceChargePaise + itemBudgetPaise,
    note: "Item cost is separate from ZappyOne's service fee and is charged at actual.",
  };
}

/**
 * Is this helper allowed to front this much cash? (§35)
 *
 * Returns the decision AND the limit, because the customer-facing message has
 * to say what the cap is — "too much" with no number is not actionable.
 */
async function advanceCheck(serviceType, amountPaise) {
  const cfg = await getConfig(serviceType);
  const limit = cfg.maxWorkerAdvancePaise;
  return {
    allowed: amountPaise <= limit,
    limitPaise: limit,
    requiresCustomerFunding: amountPaise > limit,
  };
}

/**
 * May the helper pay this without asking? (§6, §61)
 *
 * The default tolerance is zero, so any overspend asks. A configured
 * tolerance exists for operators who would rather not interrupt a customer
 * over a few rupees — it is a deliberate, tunable trade, not a silent one.
 */
async function withinTolerance(serviceType, approvedPaise, actualPaise) {
  const cfg = await getConfig(serviceType);
  if (actualPaise <= approvedPaise) return true;
  if (!cfg.priceTolerancePct) return false;
  const ceiling = approvedPaise + Math.round((approvedPaise * cfg.priceTolerancePct) / 100);
  return actualPaise <= ceiling;
}

// Helpers verified for this errand near its start who set their own rates, each with their rate.
async function ratedHelpersNear(serviceType, at) {
  const Rate = require('../models/provider-rate.model');
  const cfg = await getConfig(serviceType);
  const line = await require('../../jobs/kinds').KINDS.helping.line({ serviceType });
  const approved = line ? await require('../../onboarding/eligibility').approvedProviders(line).catch(() => []) : [];
  const workerIds = approved.filter((p) => p.kind === 'worker').map((p) => p.id);
  const shopIds = approved.filter((p) => p.kind === 'shop').map((p) => p.id);
  if (!workerIds.length && !shopIds.length) return [];
  const rates = await Rate.find({ serviceType, $or: [{ workerId: { $in: workerIds } }, { shopId: { $in: shopIds } }] }).lean();
  if (!at?.coordinates?.length) return rates.map((rate) => ({ rate }));
  const [Worker, Shop] = [require('../../worker/worker.model'), require('../../shop/shop.model')];
  const [workers, shops] = await Promise.all([
    Worker.find({ _id: { $in: rates.filter((r) => r.workerId).map((r) => r.workerId) } }).select('currentLocation').lean(),
    Shop.find({ _id: { $in: rates.filter((r) => r.shopId).map((r) => r.shopId) } }).select('address.location').lean(),
  ]);
  const where = new Map([...workers.map((w) => [String(w._id), w.currentLocation?.coordinates]), ...shops.map((s) => [String(s._id), s.address?.location?.coordinates])]);
  return rates.filter((r) => {
    const c = where.get(String(r.workerId || r.shopId));
    return !c || c.length !== 2 || kmBetween(c, at.coordinates) <= (cfg.matchRadiusKm || 15);
  }).map((rate) => ({ rate }));
}

// The cheapest quote among nearby helpers' own rates, for an errand any of them may take; null when nobody has priced it.
async function cheapestNearby(args) {
  const near = await ratedHelpersNear(args.serviceType, args.pickupLocation);
  // An errand ZappyOne's own staff do is offered at ZappyOne's price for its staff, beside any partner's own rates.
  const line = await require('../../jobs/kinds').KINDS.helping.line({ serviceType: args.serviceType });
  const { ServiceLine } = require('../../onboarding/onboarding.model');
  const staffOn = await require('../../feature-flags/feature-flag.service').isEnabled('own_staff');
  const staffDone = staffOn && line && await ServiceLine.exists({ code: line, $or: [{ staffOnly: true }, { staffDoes: true }] });
  let best = staffDone ? await quote(args).catch(() => null) : null;
  for (const { rate } of near) {
    const q = await quote({ ...args, rate }).catch(() => null);
    if (q && (!best || q.serviceChargePaise < best.serviceChargePaise)) best = q;
  }
  return best;
}

module.exports = {
  ratedHelpersNear,
  cheapestNearby,
  maxMatchRadiusKm,
  getConfig,
  invalidateConfigCache,
  quote,
  tripDistanceKm,
  authorisationTotal,
  advanceCheck,
  withinTolerance,
};
