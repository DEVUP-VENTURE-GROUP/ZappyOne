const { getDistanceAndEta } = require('../../worker/maps.service');
const verticalConfigService = require('../../service/vertical-config.service');

/** One pricing engine per vertical. */

function paiseToRupees(p) {
  return Math.round(p / 100);
}

// --- Vertical-specific pricing ---

/**
 * Mobile phone services — uses phone catalog for model-accurate pricing.
 * Falls back to brand-level average, then labor range if brand unknown.
 * Supports quality tiers: OEM / Compatible / Budget (default: Compatible).
 */
async function calculateMobilePrice({ service, priority, deviceBrand, deviceModel, deviceSeries, partsTier = 'Compatible' }) {
  const cfg = await verticalConfigService.getConfig('mobile');
  const inspectionFeePaise    = cfg.inspectionFeePaise    || 15000;
  const urgentSurchargePaise  = priority === 'emergency'  ? (cfg.urgentSurchargePaise || 10000) : 0;

  /* Tier-aware pricing from DB ServiceVariant matrix (falling back to static phone catalog) */
  const ServiceVariant = require('../../service/service-variant.model');
  const phoneCatalog   = require('../../service/phone-catalog');
  let sparePartCostPaise = 0;
  let estimatedLaborPaise = 0;
  let warrantyDays       = cfg.warrantyDays || 30;
  let pricingSource      = 'fallback';

  if (deviceBrand && service) {
    const cleanBrand = deviceBrand.toLowerCase();
    const cleanModel = deviceModel ? deviceModel.toLowerCase() : null;

    // 1. Try DB lookup by exact model + service + partsTier.
    //    The old code built `new RegExp(cleanModel.replace(/[^a-z0-9]/g,'.*'))`,
    //    which (a) is a ReDoS vector on user input and (b) mis-matches models —
    //    "iphone-15" also matched "iphone-155-pro" and could return the WRONG
    //    (cheaper/pricier) part. We normalise to a slug, try an exact code match
    //    first, then a hyphen-token-anchored match built from an ESCAPED string.
    let dbVariant = null;
    if (cleanModel) {
      const { escapeRegex, slug } = require('../../../core/text');
      const modelSlug = slug(cleanModel);
      if (modelSlug) {
        dbVariant = await ServiceVariant.findOne({
          serviceCode: service.toLowerCase(),
          brandCode: cleanBrand,
          qualityTier: partsTier,
          isActive: true,
          $or: [
            { modelCode: modelSlug },
            { modelCode: { $regex: `(^|-)${escapeRegex(modelSlug)}(-|$)`, $options: 'i' } },
          ],
        }).lean();
      }
    }

    if (!dbVariant) {
      // 2. Try DB lookup by brandCode + serviceCode + qualityTier (brand average)
      dbVariant = await ServiceVariant.findOne({
        serviceCode: service.toLowerCase(),
        brandCode: cleanBrand,
        qualityTier: partsTier,
        isActive: true,
      }).lean();
    }

    if (dbVariant) {
      sparePartCostPaise  = dbVariant.partPricePaise || 0;
      estimatedLaborPaise = dbVariant.laborPricePaise || 0;
      warrantyDays        = dbVariant.warrantyDays || warrantyDays;
      pricingSource       = `db_variant:${deviceBrand}:${partsTier}`;
    } else {
      // 3. Fallback to static catalog lookup
      const catalogResult = phoneCatalog.lookupPrice({
        brand:      deviceBrand,
        seriesName: deviceSeries || null,
        service,
        tier:       partsTier,
      });
      if (catalogResult) {
        sparePartCostPaise = catalogResult.paise;
        warrantyDays       = catalogResult.warrantyDays;
        pricingSource      = `catalog:${deviceBrand}:${partsTier}`;
      } else {
        const partCost = await verticalConfigService.lookupSparePartCost({
          brand: deviceBrand, service, model: deviceModel || 'all',
        });
        if (partCost !== null) {
          sparePartCostPaise = partCost;
          pricingSource      = 'vertical_config';
        }
      }
    }
  }

  /* Labor cost: 30% of parts cost (or fallback range) */
  const LABOR_FALLBACK = {
    screen_replacement:  { min: 150000, max: 450000 },
    battery_replacement: { min:  80000, max: 200000 },
    charging_issue:      { min:  30000, max: 100000 },
    speaker_mic_issue:   { min:  50000, max: 150000 },
    software_issue:      { min:  30000, max:  80000 },
    water_damage_check:  { min:  20000, max:  50000 },
  };
  if (!estimatedLaborPaise) {
    const labor = LABOR_FALLBACK[service] || { min: 50000, max: 150000 };
    estimatedLaborPaise = sparePartCostPaise > 0
      ? Math.round(sparePartCostPaise * 0.30)
      : Math.round((labor.min + labor.max) / 2);
  }

  const subtotalPaise = inspectionFeePaise + estimatedLaborPaise + sparePartCostPaise;
  const totalPaise    = subtotalPaise + urgentSurchargePaise;

  return {
    vertical: 'mobile',
    inspectionFee:   paiseToRupees(inspectionFeePaise),
    laborFee:        paiseToRupees(estimatedLaborPaise),
    sparePartFee:    paiseToRupees(sparePartCostPaise),
    urgentSurcharge: paiseToRupees(urgentSurchargePaise),
    subtotal:        paiseToRupees(subtotalPaise),
    total:           paiseToRupees(totalPaise),
    currency:        'INR',
    warrantyDays,
    partsTier,
    pricingSource,
    paise: {
      inspectionFee:   inspectionFeePaise,
      laborFee:        estimatedLaborPaise,
      sparePartFee:    sparePartCostPaise,
      urgentSurcharge: urgentSurchargePaise,
      subtotal:        subtotalPaise,
      total:           totalPaise,
    },
  };
}

/**
 * Construction services: visit fee + hourly/project/material.
 */
async function calculateConstructionPrice({ service, priority, pricingModel = 'standard', estimatedHours = 2 }) {
  const cfg = await verticalConfigService.getConfig('construction');
  const visitFeePaise = cfg.visitFeePaise || 10000;
  const perHourFeePaise = cfg.perHourFeePaise || 40000;
  const urgentSurchargePct = priority === 'emergency' ? (cfg.urgentSurchargePct || 20) : 0;

  let laborPaise = 0;
  if (pricingModel === 'hourly') {
    laborPaise = Math.round(estimatedHours * perHourFeePaise);
  } else if (pricingModel === 'project') {
    // Project pricing: TBD after site visit — quote 0 here, admin sets it manually
    laborPaise = 0;
  } else {
    // Standard: visit + flat service rate (via existing pricing service multiplier)
    laborPaise = perHourFeePaise * 1.5; // nominal 1.5hrs for standard jobs
  }

  const subtotalPaise = visitFeePaise + laborPaise;
  const urgentAddPaise = Math.round(subtotalPaise * urgentSurchargePct / 100);
  const totalPaise = subtotalPaise + urgentAddPaise;

  return {
    vertical: 'construction',
    visitFee: paiseToRupees(visitFeePaise),
    laborFee: paiseToRupees(laborPaise),
    urgentSurcharge: paiseToRupees(urgentAddPaise),
    subtotal: paiseToRupees(subtotalPaise),
    total: paiseToRupees(totalPaise),
    currency: 'INR',
    pricingModel,
    estimatedHours: pricingModel === 'hourly' ? estimatedHours : null,
    paise: {
      visitFee: visitFeePaise,
      laborFee: laborPaise,
      urgentSurcharge: urgentAddPaise,
      subtotal: subtotalPaise,
      total: totalPaise,
    },
  };
}

/**
 * Vehicle services: base visit + distance + emergency + night surcharge.
 */
async function calculateVehiclePrice({ origin, dest, priority }) {
  const cfg = await verticalConfigService.getConfig('vehicle');
  const { distanceKm } = await getDistanceAndEta(origin, dest);

  const baseVisitFeePaise      = cfg.baseVisitFeePaise       || 5000;
  const perKmFeePaise          = cfg.perKmFeePaise            || 1500;
  const emergencySurchargePaise = priority === 'emergency'
    ? (cfg.emergencySurchargePaise || 10000)
    : 0;
  const nightSurchargePaise    = verticalConfigService.isNightTime(cfg)
    ? (cfg.nightSurchargePaise || 8000)
    : 0;

  const distanceFeePaise = Math.round(distanceKm * perKmFeePaise);
  const subtotalPaise = baseVisitFeePaise + distanceFeePaise;
  const totalPaise = subtotalPaise + emergencySurchargePaise + nightSurchargePaise;

  return {
    vertical: 'vehicle',
    baseVisitFee: paiseToRupees(baseVisitFeePaise),
    distanceKm: Number(distanceKm.toFixed(2)),
    distanceFee: paiseToRupees(distanceFeePaise),
    emergencySurcharge: paiseToRupees(emergencySurchargePaise),
    nightSurcharge: paiseToRupees(nightSurchargePaise),
    subtotal: paiseToRupees(subtotalPaise),
    total: paiseToRupees(totalPaise),
    currency: 'INR',
    paise: {
      baseVisitFee: baseVisitFeePaise,
      distanceFee: distanceFeePaise,
      emergencySurcharge: emergencySurchargePaise,
      nightSurcharge: nightSurchargePaise,
      subtotal: subtotalPaise,
      total: totalPaise,
    },
  };
}

/**
 * Towing: base hookup/handling fee + per-km on the tow leg (pickup → destination).
 * `dest` here is the customer's chosen drop-off, so distanceKm is the tow distance.
 * Cars cost more than two-wheelers (flatbed vs. lift). Emergency + night surcharges apply.
 */
async function calculateTowingPrice({ origin, dest, priority, vehicleType }) {
  const cfg = await verticalConfigService.getConfig('vehicle').catch(() => ({}));
  const { distanceKm, etaMinutes } = await getDistanceAndEta(origin, dest);

  const isCar = vehicleType === 'car' || vehicleType === 'commercial';
  const baseHookupPaise = isCar ? (cfg.towBaseCarPaise  || 50000) : (cfg.towBaseBikePaise || 20000); // ₹500 / ₹200
  const perKmPaise      = isCar ? (cfg.towPerKmCarPaise || 3500)  : (cfg.towPerKmBikePaise || 1800);  // ₹35 / ₹18 per km
  const emergencyPaise  = priority === 'emergency' ? (cfg.emergencySurchargePaise || 15000) : 0;
  const nightPaise      = verticalConfigService.isNightTime(cfg) ? (cfg.nightSurchargePaise || 10000) : 0;

  const towFeePaise   = Math.round(distanceKm * perKmPaise);
  const subtotalPaise = baseHookupPaise + towFeePaise;
  const totalPaise    = subtotalPaise + emergencyPaise + nightPaise;

  return {
    vertical: 'towing',
    baseHookupFee: paiseToRupees(baseHookupPaise),
    distanceKm: Number(distanceKm.toFixed(2)),
    towFee: paiseToRupees(towFeePaise),
    etaMinutes,
    emergencySurcharge: paiseToRupees(emergencyPaise),
    nightSurcharge: paiseToRupees(nightPaise),
    subtotal: paiseToRupees(subtotalPaise),
    total: paiseToRupees(totalPaise),
    currency: 'INR',
    paise: {
      baseHookupFee: baseHookupPaise,
      towFee: towFeePaise,
      emergencySurcharge: emergencyPaise,
      nightSurcharge: nightPaise,
      subtotal: subtotalPaise,
      total: totalPaise,
    },
  };
}

/**
 * Tank & water cleaning — flat per-service visit fee (crew + pump + disinfection).
 * Priced by tank type; emergency/night surcharges apply. No distance component.
 */
async function calculateTankCleaningPrice({ service, priority }) {
  // No dedicated 'home' vertical config exists — reuse the vehicle config for the
  // shared night/emergency surcharge settings (guaranteed to resolve to an object).
  const cfg = (await verticalConfigService.getConfig('vehicle').catch(() => ({}))) || {};
  const BASE = {
    water_tank_cleaning:      59900,  // ₹599
    overhead_tank_cleaning:   69900,  // ₹699
    underground_sump_cleaning:99900,  // ₹999
    sintex_tank_cleaning:     49900,  // ₹499
  };
  const basePaise         = BASE[service] || 59900;
  const urgentSurchargePct = priority === 'emergency' ? (cfg.urgentSurchargePct || 20) : 0;
  const nightPaise        = verticalConfigService.isNightTime(cfg) ? (cfg.nightSurchargePaise || 8000) : 0;
  const urgentPaise       = Math.round(basePaise * urgentSurchargePct / 100);
  const totalPaise        = basePaise + urgentPaise + nightPaise;

  return {
    vertical: 'tank_cleaning', service,
    baseFee: paiseToRupees(basePaise),
    emergencySurcharge: paiseToRupees(urgentPaise),
    nightSurcharge: paiseToRupees(nightPaise),
    total: paiseToRupees(totalPaise),
    currency: 'INR',
    note: 'Includes draining, scrubbing, sludge removal and disinfection.',
    paise: { baseFee: basePaise, emergencySurcharge: urgentPaise, nightSurcharge: nightPaise, total: totalPaise },
  };
}

// --- New Vertical Pricing Engines (all admin-configurable via vertical configs) ---

async function calculateLaptopPrice({ service, priority }) {
  const cfg = await verticalConfigService.getConfig('laptop').catch(() => ({}));
  const visitFeePaise       = cfg.visitFeePaise       || 15000;  // ₹150
  const diagnosticFeePaise  = cfg.diagnosticFeePaise  || 10000;  // ₹100
  const urgentSurchargePct  = priority === 'emergency' ? (cfg.urgentSurchargePct || 20) : 0;

  const LAPTOP_SERVICE_BASE = {
    laptop_slow:              25000,  // ₹250
    laptop_ssd_upgrade:       50000,  // ₹500 labour (parts extra)
    laptop_ram_upgrade:       30000,  // ₹300 labour
    laptop_keyboard_issue:    40000,  // ₹400
    laptop_motherboard_issue: 150000, // ₹1500 (complex)
    laptop_charging_issue:    30000,
    laptop_screen_issue:      80000,  // ₹800 labour
    laptop_virus_removal:     35000,
    laptop_data_recovery:     100000, // ₹1000
  };

  const basePaise = LAPTOP_SERVICE_BASE[service] || 30000;
  const subtotal  = visitFeePaise + diagnosticFeePaise + basePaise;
  const urgent    = Math.round(subtotal * urgentSurchargePct / 100);
  const total     = subtotal + urgent;

  return {
    vertical: 'laptop', service,
    visitFee:    paiseToRupees(visitFeePaise),
    diagnostic:  paiseToRupees(diagnosticFeePaise),
    labourFee:   paiseToRupees(basePaise),
    urgentSurcharge: paiseToRupees(urgent),
    total: paiseToRupees(total),
    currency: 'INR',
    note: 'Parts cost quoted separately after diagnosis',
    paise: { total },
  };
}

async function calculateSmartDevicePrice({ service, priority }) {
  const cfg = await verticalConfigService.getConfig('smart_device').catch(() => ({}));
  const visitFeePaise = cfg.visitFeePaise || 20000; // ₹200
  const urgentSurchargePct = priority === 'emergency' ? 25 : 0;

  const SMART_BASE = {
    smart_tv_install:       60000,
    smart_tv_repair:        80000,
    router_setup:           30000,
    router_troubleshoot:    25000,
    cctv_install:           100000, // per camera
    cctv_repair:            60000,
    smart_lock_install:     80000,
    home_automation_setup:  150000,
  };

  const basePaise = SMART_BASE[service] || 50000;
  const subtotal  = visitFeePaise + basePaise;
  const urgent    = Math.round(subtotal * urgentSurchargePct / 100);
  const total     = subtotal + urgent;

  return {
    vertical: 'smart_device', service,
    visitFee: paiseToRupees(visitFeePaise),
    labourFee: paiseToRupees(basePaise),
    urgentSurcharge: paiseToRupees(urgent),
    total: paiseToRupees(total),
    currency: 'INR',
    paise: { total },
  };
}

async function calculateFamilyAssistPrice({ service, priority }) {
  const cfg = await verticalConfigService.getConfig('family_assist').catch(() => ({}));
  const baseFeePaise = cfg.baseFeePaise || 10000; // ₹100 base
  const urgentSurchargePaise = priority === 'emergency' ? (cfg.emergencyFeePaise || 20000) : 0;

  const FAMILY_BASE = {
    medicine_pickup:      5000,  // ₹50
    hospital_companion:   50000, // ₹500/visit
    grocery_assistance:   3000,  // ₹30 + basket fee
    bill_payment_assist:  2000,  // ₹20
    document_submission:  10000, // ₹100
    home_visit_check:     30000, // ₹300
    elder_doctor_visit:   60000, // ₹600
    elder_companion:      40000, // ₹400/visit
    elder_home_visit:     35000, // ₹350
    elder_transport:      45000, // ₹450
  };

  const servicePaise = FAMILY_BASE[service] || 20000;
  const total = baseFeePaise + servicePaise + urgentSurchargePaise;

  return {
    vertical: 'family_assist', service,
    baseFee: paiseToRupees(baseFeePaise),
    serviceFee: paiseToRupees(servicePaise),
    urgentSurcharge: paiseToRupees(urgentSurchargePaise),
    total: paiseToRupees(total),
    currency: 'INR',
    paise: { total },
  };
}

async function calculateEventPrice({ service, priority, estimatedHours = 4 }) {
  const cfg = await verticalConfigService.getConfig('event_crew').catch(() => ({}));
  const perHourPaise = cfg.perHourFeePaise || 50000; // ₹500/hr per crew member
  const urgentSurchargePct = priority === 'emergency' ? 30 : 0;

  const CREW_SIZES = {
    event_decorator:         1,
    event_setup_crew:        3,
    event_cleaning_crew:     2,
    event_helper:            1,
    event_sound_crew:        2,
    event_lighting_crew:     2,
    event_security_crew:     2,
    event_birthday_setup:    2,
    event_wedding_setup:     5,
    event_photography_assist:1,
    event_catering_assist:   2,
  };

  const crewSize = CREW_SIZES[service] || 1;
  const basePaise = perHourPaise * crewSize * estimatedHours;
  const urgent = Math.round(basePaise * urgentSurchargePct / 100);
  const total  = basePaise + urgent;

  return {
    vertical: 'event_crew', service,
    crewSize, estimatedHours,
    perHourPerMember: paiseToRupees(perHourPaise),
    urgentSurcharge: paiseToRupees(urgent),
    total: paiseToRupees(total),
    currency: 'INR',
    note: `${crewSize} crew member(s) × ${estimatedHours}h`,
    paise: { total },
  };
}

async function calculatePetPrice({ service, priority }) {
  const cfg = await verticalConfigService.getConfig('pet').catch(() => ({}));
  const visitFeePaise = cfg.visitFeePaise || 5000; // ₹50
  const urgentSurchargePaise = priority === 'emergency' ? (cfg.emergencyFeePaise || 15000) : 0;

  const PET_BASE = {
    pet_grooming:       40000, // ₹400
    pet_walking:        15000, // ₹150/session
    pet_transport:      30000, // ₹300
    pet_sitting:        25000, // ₹250/day
    pet_vet_assist:     50000, // ₹500 (companion to vet)
    pet_training_assist:60000, // ₹600/session
  };

  const basePaise = PET_BASE[service] || 30000;
  const total = visitFeePaise + basePaise + urgentSurchargePaise;

  return {
    vertical: 'pet', service,
    visitFee: paiseToRupees(visitFeePaise),
    serviceFee: paiseToRupees(basePaise),
    urgentSurcharge: paiseToRupees(urgentSurchargePaise),
    total: paiseToRupees(total),
    currency: 'INR',
    paise: { total },
  };
}

// --- Quote ---

module.exports = {
  paiseToRupees,
  calculateMobilePrice,
  calculateConstructionPrice,
  calculateVehiclePrice,
  calculateTowingPrice,
  calculateTankCleaningPrice,
  calculateLaptopPrice,
  calculateSmartDevicePrice,
  calculateFamilyAssistPrice,
  calculateEventPrice,
  calculatePetPrice,
};
