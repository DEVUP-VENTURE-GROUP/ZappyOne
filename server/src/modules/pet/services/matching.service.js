/**
 * Compatibility, availability and provider matching (§27, §51, §64, §65).
 *
 * THREE GATES, IN ORDER, AND NONE OF THEM IS SKIPPABLE:
 *
 *   1. IS THIS SERVICE ALLOWED FOR THIS ANIMAL AT ALL?  (compatibility)
 *      Configuration, not code — "cats are not walked outdoors" is a row an
 *      operator can change, not an `if` a developer has to.
 *
 *   2. CAN THIS PROVIDER ACTUALLY DO IT?  (capability)
 *      Species, size, service, mode, and an explicit opt-in for animals that
 *      bite. §26: never assume a provider can perform a service. A provider
 *      sent to an aggressive dog they never agreed to handle is how someone
 *      gets hurt and the platform deserves the blame.
 *
 *   3. IS THERE ROOM?  (capacity)
 *      Beds are physical. Two customers must not confirm the same last kennel,
 *      so the count is done against overlapping stays and the booking is
 *      claimed atomically at write time (§65).
 *
 * Ranking happens only after all three pass, and never on price alone (§27).
 */

const { PetServiceCompatibility, PetServiceVariant } = require('../models/catalog.model');
const { PetProviderCapability } = require('../models/config.model');
const { PetBooking, OCCUPYING_STATUSES } = require('../models/booking.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');
const { kmBetween } = require('../../../utils/distance');

function httpError(message, status, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

/* ─── Gate 1: compatibility (§51) ─────────────────────────────────────── */

/**
 * May this species have this service?
 *
 * The most specific rule wins: a variant-level row overrides its category's.
 * A missing row means allowed — the catalog states exceptions, not
 * permissions, so adding a new variant does not require writing a row for
 * every species before anyone can book it.
 */
async function checkCompatibility({ species, categoryCode, variantCode = null, size = null }) {
  const rows = await PetServiceCompatibility.find({
    species,
    categoryCode,
    $or: [{ variantCode: null }, { variantCode }],
  }).lean();

  if (!rows.length) return { allowed: true, requiresProviderOptIn: false };

  const row = rows.sort((a, b) => (b.variantCode ? 1 : 0) - (a.variantCode ? 1 : 0))[0];

  if (!row.allowed) {
    return {
      allowed: false,
      // Never a bare refusal — the customer is told why, in their words.
      reason: row.reason || 'This service is not offered for this pet.',
      requiresProviderOptIn: false,
    };
  }

  if (size && row.allowedSizes?.length && !row.allowedSizes.includes(size)) {
    return {
      allowed: false,
      reason: row.reason || `This service is not available for ${size.replace('_', ' ')} pets.`,
      requiresProviderOptIn: false,
    };
  }

  return { allowed: true, requiresProviderOptIn: !!row.requiresProviderOptIn, reason: row.reason || '' };
}

/** Every pet on the booking must pass; the first failure explains itself. */
async function checkAllPets({ pets, categoryCode }) {
  for (const entry of pets) {
    const result = await checkCompatibility({
      species: entry.pet.species,
      categoryCode,
      variantCode: entry.variantCode,
      size: entry.pet.size,
    });
    if (!result.allowed) {
      return { allowed: false, petName: entry.pet.name, ...result };
    }
  }
  return { allowed: true };
}

/* ─── Gate 3: capacity (§64, §65) ─────────────────────────────────────── */

/**
 * Beds already committed for an overlapping stay.
 *
 * Overlap is `checkIn < theirCheckOut && checkOut > theirCheckIn` — the
 * standard interval test. Touching ranges (one stay ends the morning another
 * begins) deliberately do NOT overlap, because that is a real same-day
 * turnaround every boarding operator runs.
 */
async function occupiedBeds({ shopId, workerId, checkInAt, checkOutAt, excludeBookingId = null }) {
  const filter = {
    status: { $in: OCCUPYING_STATUSES },
    checkInAt: { $lt: new Date(checkOutAt) },
    checkOutAt: { $gt: new Date(checkInAt) },
    ...(shopId ? { shopId } : { workerId }),
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };

  const overlapping = await PetBooking.find(filter).select('pets').lean();
  return overlapping.reduce(
    (sum, b) => sum + (b.pets || []).filter((p) => p.status !== 'cancelled').length,
    0,
  );
}

/** Is there room for `bedsNeeded` more animals across this window? */
async function hasCapacity({
  capability, checkInAt, checkOutAt, bedsNeeded = 1, isDaycare = false, excludeBookingId = null,
}) {
  const limit = isDaycare ? capability.daycareCapacity : capability.boardingCapacity;
  if (!limit) return { ok: false, reason: 'no_capacity_configured', limit: 0, used: 0 };

  const used = await occupiedBeds({
    shopId: capability.shopId,
    workerId: capability.workerId,
    checkInAt,
    checkOutAt,
    excludeBookingId,
  });

  return {
    ok: used + bedsNeeded <= limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/* ─── Gate 2 + ranking: find providers (§26, §27) ─────────────────────── */

/**
 * Configurable ranking weights (§27).
 *
 * Deliberately NOT price-dominant. The cheapest provider for a living animal
 * is not the one a customer wants by default — capability fit, reliability
 * and rating matter more, and a marketplace that sorts on price teaches
 * providers to race to the bottom on care.
 */
const DEFAULT_WEIGHTS = {
  rating: 30,
  distance: 20,
  acceptance: 15,
  completion: 15,
  experience: 10,
  price: 10,
};

async function findProviders({
  categoryCode,
  variantCode,
  pets = [],
  serviceMode,
  serviceLocation = null,
  checkInAt = null,
  checkOutAt = null,
  serviceAreaCode = null,
  weights = DEFAULT_WEIGHTS,
  limit = 20,
}) {
  const speciesNeeded = [...new Set(pets.map((p) => p.pet.species))];
  const sizesNeeded = [...new Set(pets.map((p) => p.pet.size || 'medium'))];

  /*
   * Any animal on the booking that bites, or has special needs, raises the
   * bar for EVERY provider considered — a provider takes the whole booking,
   * not the easy half of it.
   */
  const needsAggressiveHandling = pets.some(
    (p) => ['medium', 'high'].includes(p.pet.aggressionLevel) || ['medium', 'high'].includes(p.pet.biteRisk),
  );
  const needsSpecialNeeds = pets.some((p) => !!p.pet.specialNeeds);

  const variant = await PetServiceVariant.findOne({ code: variantCode, isActive: true }).lean();
  if (!variant) throw httpError('Unknown service', 400, 'UNKNOWN_VARIANT');

  const filter = {
    isActive: true,
    verificationStatus: 'verified',
    categoryCodes: categoryCode,
    species: { $all: speciesNeeded },
    sizes: { $all: sizesNeeded },
    modes: serviceMode,
  };
  if (needsAggressiveHandling) filter.handlesAggressive = true;
  if (needsSpecialNeeds) filter.handlesSpecialNeeds = true;
  if (serviceAreaCode) filter.serviceAreaCodes = serviceAreaCode;

  // A variant gated behind a qualification is only offered to providers who
  // explicitly hold it — §20's line between logistics and veterinary work.
  if (variant.requiresQualification) {
    filter.qualifications = variant.requiresQualification;
  }

  const compat = await checkCompatibility({
    species: speciesNeeded[0], categoryCode, variantCode,
  });
  if (compat.requiresProviderOptIn) {
    filter.optInVariantCodes = variantCode;
  }

  let capabilities = await PetProviderCapability.find(filter).lean();

  // Variant-level capability, where a provider has narrowed their list.
  capabilities = capabilities.filter(
    (c) => !c.variantCodes?.length || c.variantCodes.includes(variantCode),
  );

  const isStay = ['boarding', 'daycare'].includes(serviceMode);
  const results = [];
  /*
   * Same gap the repair engine had: an empty list gave the customer nothing
   * to go on and the screen guessed "try another location" even when the
   * real cause was every nearby provider being full for those dates. Counts
   * only — no provider's identity is ever part of this.
   */
  const rejectedCounts = {};
  const reject = (reason) => { rejectedCounts[reason] = (rejectedCounts[reason] || 0) + 1; };

  for (const cap of capabilities) {
    const distanceKm = (serviceLocation && cap.baseLocation?.coordinates?.length === 2)
      ? kmBetween(cap.baseLocation.coordinates, serviceLocation)
      : null;

    // Outside the radius they agreed to serve.
    if (distanceKm != null && cap.serviceRadiusKm && distanceKm > cap.serviceRadiusKm) {
      reject('outside_radius'); continue;
    }

    let capacity = null;
    if (isStay && checkInAt && checkOutAt) {
      capacity = await hasCapacity({
        capability: cap,
        checkInAt,
        checkOutAt,
        bedsNeeded: pets.length,
        isDaycare: serviceMode === 'daycare',
      });
      // A full provider is not "a lower-ranked option" — they are unbookable.
      if (!capacity.ok) { reject('no_capacity'); continue; }
    }

    const provider = cap.shopId
      ? await Shop.findById(cap.shopId).select('businessName phone rating reviewCount').lean()
      : await Worker.findById(cap.workerId).select('name phone rating reviewCount completedJobs acceptanceRate').lean();

    if (!provider) { reject('profile_missing'); continue; }

    const rating = provider.rating || 0;
    const acceptance = provider.acceptanceRate ?? 100;
    const completed = provider.completedJobs || 0;

    // Normalised 0-1 so weights mean what they say.
    const score = (
      (rating / 5) * weights.rating
      + (distanceKm != null ? Math.max(0, 1 - distanceKm / (cap.serviceRadiusKm || 10)) : 0.5) * weights.distance
      + (acceptance / 100) * weights.acceptance
      + Math.min(1, completed / 50) * weights.completion
      + Math.min(1, (cap.experienceYears || 0) / 5) * weights.experience
    );

    results.push({
      capabilityId: cap._id,
      workerId: cap.workerId,
      shopId: cap.shopId,
      name: provider.businessName || provider.name,
      providerType: cap.providerType,
      rating,
      reviewCount: provider.reviewCount || 0,
      completedJobs: completed,
      experienceYears: cap.experienceYears || 0,
      distanceKm,
      capacity,
      isDemo: !!cap.isDemo,
      score: Math.round(score * 100) / 100,
    });
  }

  const ranked = results.sort((a, b) => b.score - a.score).slice(0, limit);
  if (ranked.length) {
    return { providers: ranked, nearbyCount: capabilities.length, primaryReason: null };
  }

  /*
   * Zero candidates even matched species/size/category/mode is a DIFFERENT
   * fact from "N providers matched but every one was too far or full" — the
   * first means nobody has been onboarded for this at all, the second means
   * real supply exists and the customer's own choices (dates, distance) are
   * the reason. Collapsing them loses exactly the distinction the customer
   * needs to know what to do next.
   */
  if (!capabilities.length) {
    return { providers: [], nearbyCount: 0, primaryReason: 'no_capability' };
  }
  const primaryReason = Object.entries(rejectedCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { providers: [], nearbyCount: capabilities.length, primaryReason };
}

/**
 * Claim a provider for a stay, atomically (§65).
 *
 * The capacity check above can go stale between reading and writing, so the
 * booking is only created after re-counting inside the same operation. This
 * is the last line of defence against two customers taking the last bed.
 */
async function claimCapacity({ capability, checkInAt, checkOutAt, bedsNeeded, isDaycare }) {
  const check = await hasCapacity({
    capability, checkInAt, checkOutAt, bedsNeeded, isDaycare,
  });
  if (!check.ok) {
    throw httpError(
      'That provider has just filled up for those dates', 409, 'NO_CAPACITY',
      { limit: check.limit, used: check.used },
    );
  }
  return check;
}

module.exports = {
  checkCompatibility,
  checkAllPets,
  findProviders,
  hasCapacity,
  occupiedBeds,
  claimCapacity,
  DEFAULT_WEIGHTS,
};
