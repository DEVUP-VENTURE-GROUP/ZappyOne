/**
 * Pet Services pricing engine (§28, §52, §60).
 *
 * Every figure comes from a `PetPricingRule` row. There is no fee, rate or
 * multiplier literal in this file — §62 is absolute, and the test suite
 * asserts it by changing a rule and watching the price move.
 *
 * THE ORDER OF OPERATIONS MATTERS, so it is fixed and documented:
 *
 *   1. The base for the unit (flat / per-night / per-minute / per-km …)
 *   2. × size multiplier          — a large dog is proportionally more work
 *   3. × breed coat complexity    — a double coat genuinely takes longer
 *   4. + add-ons                  — themselves size-scaled where configured
 *   5. − additional-pet discount  — the second animal on one visit is cheaper
 *   6. + travel / pickup / return / waiting / overtime / handling
 *   7. − stay discount            — weekly and monthly boarding rates
 *   8. − coupon / discount
 *   9. + platform fee, then tax on the discounted subtotal
 *
 * Commission is taken from the SERVICE money only, never from tax or the
 * platform's own fee, and never from a travel cost the provider bore.
 */

const { PetPricingRule } = require('../models/config.model');
const { Breed, PetServiceVariant, PetServiceAddon, PetServicePackage } = require('../models/catalog.model');
const { kmBetween } = require('../../../core/geo/distance');
const { httpError } = require('../../../core/errors');


const ruleCache = new Map();
const CACHE_MS = 30000;

/**
 * The most specific active rule for this service.
 *
 * Specificity beats recency: a rule naming the exact variant and city is a
 * deliberate override and must win over a broad category default no matter
 * which was edited last.
 */
async function resolveRule({ categoryCode, variantCode = null, species = null, cityCode = null }) {
  const key = `${categoryCode}|${variantCode}|${species}|${cityCode}`;
  const hit = ruleCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rule;

  const candidates = await PetPricingRule.find({
    categoryCode,
    isActive: true,
    $and: [
      { $or: [{ variantCode: null }, { variantCode }] },
      { $or: [{ species: null }, { species }] },
      { $or: [{ cityCode: null }, { cityCode }] },
    ],
  });

  if (!candidates.length) {
    throw httpError(`No pricing is configured for ${categoryCode}`, 503, 'NO_PRICING_RULE');
  }

  const rule = candidates.sort((a, b) => b.specificity() - a.specificity())[0];
  ruleCache.set(key, { rule, at: Date.now() });
  return rule;
}

function invalidateRuleCache() {
  ruleCache.clear();
}

/** Nights between two dates, minimum one — a same-day stay is still a night. */
function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const ms = new Date(checkOut) - new Date(checkIn);
  return Math.max(1, Math.ceil(ms / 86400000));
}

/**
 * The base cost of one pet's service, before add-ons and shared costs.
 *
 * `unit` decides which rate applies; everything else is the same for all of
 * them, which is what keeps seven categories on one engine.
 */
function baseForUnit({ rule, variant, durationMinutes, nights, days, visits, distanceKm }) {
  switch (variant.pricingUnit) {
    case 'per_night':
      return rule.perNightPaise * Math.max(1, nights || 1);
    case 'per_day':
      return rule.perDayPaise * Math.max(1, days || 1);
    case 'per_visit':
      return rule.perVisitPaise * Math.max(1, visits || 1);
    case 'per_minute': {
      const mins = durationMinutes || variant.durationMinutes || variant.estimatedMinutes || 30;
      return rule.perMinutePaise * mins + rule.basePaise;
    }
    case 'per_km': {
      const billableKm = Math.max(0, (distanceKm || 0) - (rule.includedKm || 0));
      return rule.basePaise + Math.round(rule.perKmPaise * billableKm);
    }
    case 'quote':
      return null; // deliberately unpriceable — a human must quote it
    case 'flat':
    default:
      return rule.basePaise;
  }
}

/**
 * Price one pet's line.
 *
 * Returns the full breakdown rather than a total, because §60 requires the
 * customer to see every component and a support agent to be able to explain
 * any of them.
 */
async function priceOnePet({
  rule,
  variant,
  pet,
  addons = [],
  durationMinutes = null,
  nights = null,
  days = null,
  visits = null,
  distanceKm = null,
  isAdditionalPet = false,
}) {
  const base = baseForUnit({ rule, variant, durationMinutes, nights, days, visits, distanceKm });
  if (base == null) {
    throw httpError('This service is quoted individually', 409, 'QUOTE_REQUIRED');
  }

  const size = pet.size || 'medium';
  const sizeMultiplier = rule.sizeMultipliers?.[size] ?? 1;
  const afterSize = Math.round(base * sizeMultiplier);
  const sizeAdjustmentPaise = afterSize - base;

  /*
   * Coat complexity, only where the rule opts in. It applies to grooming,
   * where it is a real time cost, and not to a walk, where a Poodle and a
   * Beagle take exactly as long.
   */
  let breedMultiplier = 1;
  if (rule.applyBreedComplexity && pet.breedCode) {
    const breed = await Breed.findOne({ code: pet.breedCode, isActive: true }).lean();
    if (breed?.groomingComplexity) {
      breedMultiplier = Math.min(breed.groomingComplexity, rule.maxBreedComplexity || 2);
    }
  }
  const afterBreed = Math.round(afterSize * breedMultiplier);
  const breedAdjustmentPaise = afterBreed - afterSize;

  // Add-ons scale with size too where configured — de-shedding a giant dog is
  // not the same job as de-shedding a small one.
  let addonsPaise = 0;
  for (const addon of addons) {
    const price = addon.scalesWithSize
      ? Math.round(addon.pricePaise * sizeMultiplier)
      : addon.pricePaise;
    addonsPaise += price;
  }

  const beforeDiscount = afterBreed + addonsPaise;

  /*
   * The second animal on the same visit costs less, because the provider
   * travels once and sets up once. `additionalPetPct` is what fraction of
   * full price they pay — 70 means 30% off.
   */
  const additionalPetDiscountPaise = isAdditionalPet
    ? beforeDiscount - Math.round(beforeDiscount * ((rule.additionalPetPct ?? 100) / 100))
    : 0;

  const linePaise = beforeDiscount - additionalPetDiscountPaise;

  return {
    basePaise: base,
    sizeAdjustmentPaise,
    breedAdjustmentPaise,
    addonsPaise,
    additionalPetDiscountPaise,
    linePaise,
    appliedMultipliers: { size: sizeMultiplier, breed: breedMultiplier },
  };
}

/**
 * Price a whole booking.
 *
 * `pets` is an array of `{ pet, variantCode, addonCodes, durationMinutes }`.
 * The first pet pays full price; the rest get the additional-pet rate.
 */
async function quote({
  categoryCode,
  serviceMode,
  pets = [],
  cityCode = null,
  checkInAt = null,
  checkOutAt = null,
  visits = null,
  serviceLocation = null,
  providerLocation = null,
  needsPickup = false,
  needsReturn = false,
  specialHandling = false,
  waitingMinutes = 0,
  overtimeMinutes = 0,
  couponPaise = 0,
  packageCode = null,
  isPeak = false,
  isHoliday = false,
}) {
  if (!pets.length) throw httpError('A booking needs at least one pet', 400, 'NO_PETS');

  const nights = nightsBetween(checkInAt, checkOutAt);
  const days = nights;
  const distanceKm = (serviceLocation && providerLocation)
    ? kmBetween(providerLocation, serviceLocation)
    : null;

  const variantCodes = [...new Set(pets.map((p) => p.variantCode))];
  const variants = await PetServiceVariant.find({
    code: { $in: variantCodes }, isActive: true,
  }).lean();
  const variantByCode = new Map(variants.map((v) => [v.code, v]));

  const missing = variantCodes.filter((c) => !variantByCode.has(c));
  if (missing.length) {
    throw httpError(`Unknown service: ${missing.join(', ')}`, 400, 'UNKNOWN_VARIANT');
  }

  const allAddonCodes = [...new Set(pets.flatMap((p) => p.addonCodes || []))];
  const addonDocs = allAddonCodes.length
    ? await PetServiceAddon.find({ code: { $in: allAddonCodes }, isActive: true }).lean()
    : [];
  const addonByCode = new Map(addonDocs.map((a) => [a.code, a]));

  const lines = [];
  let servicesPaise = 0;
  let addonsTotalPaise = 0;
  let appliedMultipliers = null;

  for (const [i, entry] of pets.entries()) {
    const variant = variantByCode.get(entry.variantCode);
    const rule = await resolveRule({
      categoryCode,
      variantCode: entry.variantCode,
      species: entry.pet.species,
      cityCode,
    });

    const addons = (entry.addonCodes || [])
      .map((c) => addonByCode.get(c))
      .filter(Boolean);

    const line = await priceOnePet({
      rule,
      variant,
      pet: entry.pet,
      addons,
      durationMinutes: entry.durationMinutes,
      nights,
      days,
      visits,
      distanceKm,
      isAdditionalPet: i > 0,
    });

    lines.push({ ...line, petId: entry.pet._id, variantCode: entry.variantCode });
    // The service portion excludes add-ons so the breakdown stays readable.
    servicesPaise += line.linePaise - line.addonsPaise;
    addonsTotalPaise += line.addonsPaise;
    appliedMultipliers = appliedMultipliers || line.appliedMultipliers;
  }

  // Shared costs use the broadest rule for the category — travel is one trip
  // regardless of how many animals are at the other end.
  const sharedRule = await resolveRule({ categoryCode, cityCode });

  const travelPaise = distanceKm != null
    ? Math.round(sharedRule.perKmPaise * Math.max(0, distanceKm - (sharedRule.includedKm || 0)))
    : 0;
  const pickupPaise = needsPickup ? sharedRule.pickupPaise : 0;
  const returnPaise = needsReturn ? sharedRule.returnPaise : 0;
  const specialHandlingPaise = specialHandling ? sharedRule.specialHandlingPaise : 0;

  const billableWaiting = Math.max(0, waitingMinutes - (sharedRule.waitingFreeMinutes || 0));
  const waitingPaise = billableWaiting * (sharedRule.waitingPerMinutePaise || 0);

  const overtimeBlocks = overtimeMinutes > 0
    ? Math.ceil(overtimeMinutes / (sharedRule.overtimeBlockMinutes || 15))
    : 0;
  const overtimePaise = overtimeBlocks * (sharedRule.overtimeBlockPaise || 0);

  /*
   * Multi-night stays are discounted. Every boarding operator researched does
   * this — a week is 10–15% off and a month 20–30% — and a platform that does
   * not match it simply loses long stays to the operator's own phone line.
   */
  let stayDiscountPct = 0;
  if (nights >= (sharedRule.monthlyThresholdNights || 30)) {
    stayDiscountPct = sharedRule.monthlyDiscountPct || 0;
  } else if (nights >= (sharedRule.weeklyThresholdNights || 7)) {
    stayDiscountPct = sharedRule.weeklyDiscountPct || 0;
  }
  const preDiscount = servicesPaise + addonsTotalPaise;
  const stayDiscountPaise = Math.round(preDiscount * (stayDiscountPct / 100));

  // Package discounts, where the booking is drawing on a bought package.
  let packageDiscountPaise = 0;
  if (packageCode) {
    const pkg = await PetServicePackage.findOne({ code: packageCode, isActive: true }).lean();
    if (pkg?.discountPct) {
      packageDiscountPaise = Math.round(preDiscount * (pkg.discountPct / 100));
    }
  }

  const demandMultiplier = (isHoliday ? (sharedRule.holidayMultiplier || 1)
    : isPeak ? (sharedRule.peakMultiplier || 1) : 1);

  const serviceMoney = Math.round(
    (servicesPaise + addonsTotalPaise - stayDiscountPaise - packageDiscountPaise) * demandMultiplier,
  );

  const subtotalPaise = Math.max(
    0,
    serviceMoney + travelPaise + pickupPaise + returnPaise
    + waitingPaise + overtimePaise + specialHandlingPaise
    - (couponPaise || 0),
  );

  const platformFeePaise = sharedRule.platformFeePaise || 0;
  const taxable = subtotalPaise + platformFeePaise;
  const taxPaise = Math.round(taxable * ((sharedRule.taxPct || 0) / 100));
  const totalPaise = taxable + taxPaise;

  /*
   * Commission comes out of the service money only. Not the tax (the
   * government's), not the platform fee (already ours), and not the travel
   * cost — the provider spent that on fuel to get there.
   */
  const commissionPaise = Math.round(serviceMoney * ((sharedRule.commissionPct || 0) / 100));
  const providerAmountPaise = Math.max(
    0,
    serviceMoney + travelPaise + pickupPaise + returnPaise + waitingPaise
    + overtimePaise + specialHandlingPaise - commissionPaise,
  );

  return {
    lines,
    servicesPaise,
    addonsPaise: addonsTotalPaise,
    travelPaise,
    pickupPaise,
    returnPaise,
    waitingPaise,
    overtimePaise,
    specialHandlingPaise,
    stayDiscountPaise: stayDiscountPaise + packageDiscountPaise,
    couponPaise: couponPaise || 0,
    discountPaise: 0,
    subtotalPaise,
    platformFeePaise,
    taxPaise,
    totalPaise,
    commissionPaise,
    providerAmountPaise,
    currency: 'INR',
    distanceKm,
    nights: nights || null,
    pricingRuleId: sharedRule._id,
    appliedMultipliers: { ...(appliedMultipliers || {}), demand: demandMultiplier, stayDiscountPct },
    snapshotAt: new Date(),
  };
}

/**
 * Is a provider's own price acceptable? (§29 guardrails)
 *
 * A marketplace where one groomer charges ₹400 and the next ₹4,000 for the
 * same job is one customers stop trusting. The band is configuration, so an
 * operator decides how wide "acceptable" is.
 */
async function checkProviderPrice({ categoryCode, variantCode, species, cityCode, pricePaise }) {
  const rule = await resolveRule({ categoryCode, variantCode, species, cityCode });
  const min = rule.minPaise || 0;
  const max = rule.maxPaise || 0;

  if (min && pricePaise < min) {
    return { allowed: false, reason: 'below_floor', minPaise: min, maxPaise: max };
  }
  if (max && pricePaise > max) {
    return { allowed: false, reason: 'above_ceiling', minPaise: min, maxPaise: max };
  }
  return { allowed: true, minPaise: min, maxPaise: max };
}

module.exports = {
  quote,
  priceOnePet,
  resolveRule,
  invalidateRuleCache,
  checkProviderPrice,
  nightsBetween,
};
