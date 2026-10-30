const { getDistanceAndEta } = require('../../worker/maps.service');
const subscriptionService = require('../../subscription/subscription.service');
const { MOBILE_SERVICES, LAPTOP_SERVICES, SMART_DEVICE_SERVICES, VEHICLE_SERVICES, TOWING_SERVICES, TANK_CLEANING_SERVICES, FAMILY_SERVICES, EVENT_SERVICES, PET_SERVICES } = require('./verticals');
const { getActiveConfig } = require('./config.service');
const { computeSurge } = require('./surge.service');
const { calculateMobilePrice, calculateVehiclePrice, calculateTowingPrice, calculateTankCleaningPrice, calculateLaptopPrice, calculateSmartDevicePrice, calculateFamilyAssistPrice, calculateEventPrice, calculatePetPrice, paiseToRupees } = require('./engines.service');



/**
 * Compute a price quote.
 *
 * @param {object} p
 * @param {{lat:number,lng:number}} p.origin
 * @param {{lat:number,lng:number}} p.dest
 * @param {string} p.service
 * @param {ObjectId} [p.userId] — when provided, premium effects are applied
 * @param {string} [p.priority] — 'emergency' applies vertical surcharges
 * @param {string} [p.deviceBrand] — mobile services
 * @param {string} [p.deviceModel] — mobile services
 * @param {string} [p.pricingModel] — construction: standard|hourly|project
 * @param {number} [p.estimatedHours] — construction hourly jobs
 * @returns {object} priced quote (rupees + paise) suitable for client display
 */
async function calculatePrice({ origin, dest, service, userId, priority = 'normal', deviceBrand, deviceModel, deviceSeries, partsTier, pricingModel, estimatedHours, vehicleType }) {
  let result;

  // Route to vertical-specific pricing engines
  if (TOWING_SERVICES.has(service)) {
    result = await calculateTowingPrice({ origin, dest, priority, vehicleType });
  } else if (TANK_CLEANING_SERVICES.has(service)) {
    result = await calculateTankCleaningPrice({ service, priority });
  } else if (MOBILE_SERVICES.has(service)) {
    result = await calculateMobilePrice({ service, priority, deviceBrand, deviceModel, deviceSeries, partsTier });
  } else if (LAPTOP_SERVICES.has(service)) {
    result = await calculateLaptopPrice({ service, priority });
  } else if (SMART_DEVICE_SERVICES.has(service)) {
    result = await calculateSmartDevicePrice({ service, priority });
  } else if (VEHICLE_SERVICES.has(service)) {
    result = await calculateVehiclePrice({ origin, dest, priority });
  } else if (FAMILY_SERVICES.has(service)) {
    result = await calculateFamilyAssistPrice({ service, priority });
  } else if (EVENT_SERVICES.has(service)) {
    result = await calculateEventPrice({ service, priority, estimatedHours });
  } else if (PET_SERVICES.has(service)) {
    result = await calculatePetPrice({ service, priority });
  // DISABLED: Construction routing preserved for re-activation
  // } else if (CONSTRUCTION_SERVICES.has(service)) {
  //   result = await calculateConstructionPrice({ service, priority, pricingModel, estimatedHours });
  } else {
    // Generic path
    const cfg = await getActiveConfig();
    const { distanceKm, etaMinutes } = await getDistanceAndEta(origin, dest);

    let premiumEffects = {};
    if (userId) {
      premiumEffects = await subscriptionService.getEffects({ kind: 'user', id: userId });
    }

    const overrideRow = cfg.serviceOverrides.find((o) => o.service === service);
    const serviceMult = overrideRow?.multiplier ?? 1.0;

    const baseFeePaise      = Math.round(cfg.baseFeePaise * serviceMult);
    const distanceFeePaise  = Math.round(distanceKm * cfg.perKmFeePaise);
    const timeFeePaise      = Math.round(etaMinutes * cfg.perMinFeePaise);
    let platformFeePaise    = cfg.platformFeePaise;
    if (premiumEffects.waivePlatformFee) platformFeePaise = 0;

    let surge = await computeSurge(origin.lat, origin.lng, cfg);
    if (typeof premiumEffects.surgeCap === 'number') surge = Math.min(surge, premiumEffects.surgeCap);

    const subtotalPaise  = baseFeePaise + distanceFeePaise + timeFeePaise + platformFeePaise;
    const rawTotalPaise  = Math.round(subtotalPaise * surge);
    const minFarePaise   = overrideRow?.minFarePaise ?? cfg.minFarePaise;
    const totalPaise     = Math.max(minFarePaise, rawTotalPaise);

    result = {
      baseFee: paiseToRupees(baseFeePaise),
      distanceKm: Number(distanceKm.toFixed(2)),
      distanceFee: paiseToRupees(distanceFeePaise),
      etaMinutes,
      timeFee: paiseToRupees(timeFeePaise),
      platformFee: paiseToRupees(platformFeePaise),
      surgeMultiplier: surge,
      subtotal: paiseToRupees(subtotalPaise),
      total: paiseToRupees(totalPaise),
      currency: 'INR',
      paise: {
        baseFee: baseFeePaise,
        distanceFee: distanceFeePaise,
        timeFee: timeFeePaise,
        platformFee: platformFeePaise,
        subtotal: subtotalPaise,
        total: totalPaise,
      },
      isUserPremium: !!userId && Object.keys(premiumEffects).length > 0,
    };
  }

  // Catalog floor/ceiling + global surge — order: FLOOR → SURGE → CEILING
  // Applying surge AFTER the floor means ₹150 floor × 1.3× night = ₹195,
  // not ₹50 base × 1.3 = ₹65 → floored back to ₹150 (surge invisible).
  // Generic path already has surgeMultiplier set so _pendingSurge is 1.0 (no-op).
  let _pendingSurge = 1.0;
  if (result.surgeMultiplier == null) {
    try {
      const surgeCfg = await getActiveConfig();
      _pendingSurge = await computeSurge(origin.lat, origin.lng, surgeCfg);
    } catch (_) { /* non-fatal */ }
  }

  try {
    const ServiceCatalog = require('../../service/service-catalog.model');
    const catalogEntry = await ServiceCatalog.findOne(
      { code: service },
      'servicePricePaise priceRangeMinPaise priceRangeMaxPaise'
    ).lean();

    if (catalogEntry && catalogEntry.servicePricePaise > 0) {
      // ADDITIVE MODEL
      // Total = fixed service price (the actual job) + travel + platform, then
      // surge, then ceiling. The service price is the worker's core earning; travel
      // and platform are ADDED on top (never swallowed), so distance genuinely
      // affects the bill and the breakdown is transparent to the customer.
      const surge = Math.max(result.surgeMultiplier || 1, _pendingSurge || 1);
      const travelPaise = result.paise?.distanceFee ?? 0;
      let platformPaise = result.paise?.platformFee;
      if (platformPaise == null) {
        try { platformPaise = (await getActiveConfig()).platformFeePaise ?? 0; } catch { platformPaise = 0; }
      }
      const preSurgePaise = catalogEntry.servicePricePaise + travelPaise + platformPaise;
      let finalPaise = Math.round(preSurgePaise * surge);
      // Safety ceiling (only if a sensible max above the service price is configured)
      if (
        catalogEntry.priceRangeMaxPaise &&
        catalogEntry.priceRangeMaxPaise > catalogEntry.servicePricePaise &&
        finalPaise > catalogEntry.priceRangeMaxPaise
      ) {
        finalPaise = catalogEntry.priceRangeMaxPaise;
        result.ceilingApplied = true;
      }
      result.pricingModel   = 'additive';
      result.servicePrice   = paiseToRupees(catalogEntry.servicePricePaise);
      result.travelFee      = paiseToRupees(travelPaise);
      result.platformFee    = paiseToRupees(platformPaise);
      result.surgeMultiplier = surge;
      result.total          = paiseToRupees(finalPaise);
      result.paise = { ...(result.paise || {}), servicePrice: catalogEntry.servicePricePaise, total: finalPaise };
    } else if (catalogEntry) {
      // Step 1 — Floor on raw pre-surge price
      if (catalogEntry.priceRangeMinPaise) {
        const rawPaise = result.paise?.total ?? Math.round((result.total || 0) * 100);
        if (rawPaise < catalogEntry.priceRangeMinPaise) {
          if (result.paise) result.paise.total = catalogEntry.priceRangeMinPaise;
          result.total = paiseToRupees(catalogEntry.priceRangeMinPaise);
        }
      }

      // Step 2 — Surge on the floored price (no-op for generic path which already has surgeMultiplier)
      if (_pendingSurge > 1.0) {
        const flooredPaise = result.paise?.total ?? Math.round((result.total || 0) * 100);
        const surgedPaise  = Math.round(flooredPaise * _pendingSurge);
        if (result.paise) result.paise.total = surgedPaise;
        result.total = paiseToRupees(surgedPaise);
        result.surgeMultiplier = _pendingSurge;
      }

      // Step 3 — Ceiling (hard cap even after surge)
      const finalPaise = result.paise?.total ?? Math.round((result.total || 0) * 100);
      if (
        catalogEntry.priceRangeMaxPaise &&
        catalogEntry.priceRangeMaxPaise > (catalogEntry.priceRangeMinPaise || 0) &&
        finalPaise > catalogEntry.priceRangeMaxPaise
      ) {
        if (result.paise) result.paise.total = catalogEntry.priceRangeMaxPaise;
        result.total = paiseToRupees(catalogEntry.priceRangeMaxPaise);
        result.ceilingApplied = true;
      }
    } else {
      // No catalog entry — apply surge directly to raw price
      if (_pendingSurge > 1.0) {
        const rawPaise    = result.paise?.total ?? Math.round((result.total || 0) * 100);
        const surgedPaise = Math.round(rawPaise * _pendingSurge);
        if (result.paise) result.paise.total = surgedPaise;
        result.total = paiseToRupees(surgedPaise);
        result.surgeMultiplier = _pendingSurge;
      }
    }
  } catch (_) { /* non-fatal — pricing still works if catalog lookup fails */ }

  return result;
}

// Back-compat: order.service still calls quote()
const quote = calculatePrice;

module.exports = {
  calculatePrice,
  quote,
};
