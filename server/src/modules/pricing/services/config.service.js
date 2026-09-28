const config = require('../../../config');
const { redis } = require('../../../config/redis');
const PricingConfig = require('../pricing-config.model');
const logger = require('../../../core/logger');

/** The active pricing config: cached read, env fallback, admin updates with hard limits. */

const CACHE_KEY = 'config:pricing:active';
const CACHE_TTL_REDIS = 60;
const CACHE_TTL_LOCAL_MS = 5000;

let _localCache = { data: null, at: 0 };

async function getActiveConfig() {
  const now = Date.now();
  if (_localCache.data && now - _localCache.at < CACHE_TTL_LOCAL_MS) return _localCache.data;

  // Redis is a cache, not a dependency — a Redis hiccup must NEVER take down pricing
  // (that would blank the fare on the whole booking flow). Read is best-effort;
  // on any error we fall through to the DB / env defaults.
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      _localCache = { data: parsed, at: now };
      return parsed;
    }
  } catch { /* Redis unavailable or bad JSON — fall through to DB/env */ }

  let view;
  try {
    const fromDb = await PricingConfig.findOne({ isActive: true }).lean();
    view = fromDb ? toView(fromDb) : envFallback();
  } catch {
    view = envFallback(); // DB blip — still return usable fares rather than throwing
  }

  try { await redis.setex(CACHE_KEY, CACHE_TTL_REDIS, JSON.stringify(view)); } catch { /* cache write is best-effort */ }
  _localCache = { data: view, at: now };
  return view;
}

function toView(doc) {
  return {
    baseFeePaise: doc.baseFeePaise,
    perKmFeePaise: doc.perKmFeePaise,
    perMinFeePaise: doc.perMinFeePaise,
    platformFeePaise: doc.platformFeePaise,
    minFarePaise: doc.minFarePaise,
    surgeEnabled: doc.surgeEnabled,
    surgeMaxCap: doc.surgeMaxCap,
    commissionRate:       doc.commissionRate       ?? 0.30,
    couponCommissionRate: doc.couponCommissionRate ?? 0.15,
    dispatchEnabled: doc.dispatchEnabled ?? true,   // missing → dispatch always appeared paused
    serviceOverrides: doc.serviceOverrides || [],
    // Dispatch & worker behaviour
    forceAssignBonusPaise:        doc.forceAssignBonusPaise        ?? 1500,
    // Acceptance-first dispatch
    forceAssignEnabled:           doc.forceAssignEnabled           ?? false,
    // Geo-readiness gate (null = defer to env/NODE_ENV)
    geoReadinessEnabled:          doc.geoReadinessEnabled          ?? null,
    geoReadinessKm:               doc.geoReadinessKm               ?? 25,
    urgencyBonusEnabled:          doc.urgencyBonusEnabled          ?? true,
    urgencyBonusStartStep:        doc.urgencyBonusStartStep        ?? 4,
    urgencyBonusStepPaise:        doc.urgencyBonusStepPaise        ?? 500,
    urgencyBonusMaxPaise:         doc.urgencyBonusMaxPaise         ?? 3000,
    bestFirstEnabled:             doc.bestFirstEnabled             ?? true,
    bestFirstWindowMs:            doc.bestFirstWindowMs            ?? 8000,
    bestFirstTopN:                doc.bestFirstTopN                ?? 1,
    // ZeroWait Instant Match
    tierBonusMultiplierExpress:   doc.tierBonusMultiplierExpress   ?? 2.0,
    tierBonusMultiplierPriority:  doc.tierBonusMultiplierPriority  ?? 1.5,
    expressBonusFromStep0:        doc.expressBonusFromStep0        ?? true,
    readyPoolEnabled:             doc.readyPoolEnabled             ?? true,
    readyMaxMinutes:              doc.readyMaxMinutes              ?? 20,
    readyDefaultRadiusKm:         doc.readyDefaultRadiusKm         ?? 5,
    readyBonusPaise:              doc.readyBonusPaise              ?? 2000,
    readyMinRating:               doc.readyMinRating               ?? 4.0,
    readyMinAcceptRate:           doc.readyMinAcceptRate           ?? 0.6,
    readyMinCompletedJobs:        doc.readyMinCompletedJobs        ?? 5,
    readyCancelBanHours:          doc.readyCancelBanHours          ?? 24,
    readyTiersOnly:               doc.readyTiersOnly               ?? [],
    warmDispatchEnabled:          doc.warmDispatchEnabled          ?? true,
    warmTtlSec:                   doc.warmTtlSec                   ?? 90,
    positioningEnabled:           doc.positioningEnabled           ?? true,
    positioningBonusPaise:        doc.positioningBonusPaise        ?? 3000,
    positioningMinGap:            doc.positioningMinGap            ?? 2,
    workerAutoOfflineRejectRate:  doc.workerAutoOfflineRejectRate  ?? 0.70,
    workerRejectWarnRate:         doc.workerRejectWarnRate         ?? 0.50,
    rejectRatePenaltyWeight:      doc.rejectRatePenaltyWeight      ?? 3.0,
    cancelRatePenaltyWeight:      doc.cancelRatePenaltyWeight      ?? 5.0,
    minWorkerRating:              doc.minWorkerRating              ?? 3.0,
    // Stale order
    staleNudgeMinutes:            doc.staleNudgeMinutes            ?? 5,
    staleRedispatchMinutes:       doc.staleRedispatchMinutes       ?? 10,
    staleOtwAlertMinutes:         doc.staleOtwAlertMinutes         ?? 20,
    // Tip
    tipMaxPaise:                  doc.tipMaxPaise                  ?? 50000,
    tipOptions:                   doc.tipOptions                   ?? [20, 50, 100],
    // Offer boost
    boostEnabled:         doc.boostEnabled         ?? true,
    boostMaxPaise:        doc.boostMaxPaise        ?? 20000,
    boostOptions:         doc.boostOptions         ?? [10, 20, 30, 50, 100],
    boostDispatchWeight:  doc.boostDispatchWeight  ?? 1.5,
    // Referral
    referralReferrerBonusPaise:   doc.referralReferrerBonusPaise   ?? 15000,
    referralRefereeBonusPaise:    doc.referralRefereeBonusPaise    ?? 5000,
    // Earned wage
    earnedWageAdvanceEnabled:     doc.earnedWageAdvanceEnabled     ?? true,
    earnedWageAdvanceRate:        doc.earnedWageAdvanceRate        ?? 0.80,
    // Emergency fund
    emergencyFundContributionRate: doc.emergencyFundContributionRate ?? 0.005,
    // Late arrival penalty
    lateArrivalPenaltyPaisePerMin: doc.lateArrivalPenaltyPaisePerMin ?? 200,
    lateArrivalGraceMinutes:       doc.lateArrivalGraceMinutes       ?? 5,
    // Service tiers
    tierMultiplierPriority:  doc.tierMultiplierPriority  ?? 1.2,
    tierMultiplierExpress:   doc.tierMultiplierExpress   ?? 1.4,
    tierExpressMaxSearchMs:  doc.tierExpressMaxSearchMs  ?? 60000,
    tierPriorityMaxSearchMs: doc.tierPriorityMaxSearchMs ?? 120000,
    surgeTolerancePct:        doc.surgeTolerancePct        ?? 0.10,
    // Auto-pricing
    nightSurchargeEnabled:    doc.nightSurchargeEnabled    ?? false,
    nightSurchargeMultiplier: doc.nightSurchargeMultiplier ?? 1.3,
    nightStartHour:           doc.nightStartHour           ?? 22,
    nightEndHour:             doc.nightEndHour             ?? 6,
    rainSurchargeEnabled:     doc.rainSurchargeEnabled     ?? false,
    rainSurchargeMultiplier:  doc.rainSurchargeMultiplier  ?? 1.2,
    rainActiveUntil:          doc.rainActiveUntil          ?? null,
    weekendSurchargeEnabled:    doc.weekendSurchargeEnabled    ?? false,
    weekendSurchargeMultiplier: doc.weekendSurchargeMultiplier ?? 1.1,
    peakHourSurchargeEnabled: doc.peakHourSurchargeEnabled ?? false,
    peakHourRanges:           doc.peakHourRanges           ?? [],
  };
}

function envFallback() {
  return {
    baseFeePaise: config.pricing.baseFee * 100,
    perKmFeePaise: config.pricing.perKmFee * 100,
    perMinFeePaise: config.pricing.perMinFee * 100,
    platformFeePaise: config.pricing.platformFee * 100,
    minFarePaise: config.pricing.minFare * 100,
    surgeEnabled: true,
    surgeMaxCap: 2.5,
    commissionRate:       0.30,
    couponCommissionRate: 0.15,
    serviceOverrides: [
      // DISABLED (home/construction kept for reference, will be re-enabled via admin if needed)
      // { service: 'helper', multiplier: 0.9, minFarePaise: 10000 },
      // { service: 'plumbing', multiplier: 1.2, minFarePaise: 20000 },
      // { service: 'mason', multiplier: 1.3, minFarePaise: 50000 },

      // Electronics Rescue — Mobile
      { service: 'screen_replacement',    multiplier: 1.0, minFarePaise: 150000 },
      { service: 'battery_replacement',   multiplier: 1.0, minFarePaise: 80000  },
      { service: 'charging_issue',        multiplier: 1.0, minFarePaise: 30000  },
      { service: 'speaker_mic_issue',     multiplier: 1.0, minFarePaise: 50000  },
      { service: 'microphone_issue',      multiplier: 1.0, minFarePaise: 50000  },
      { service: 'software_issue',        multiplier: 1.0, minFarePaise: 30000  },
      { service: 'water_damage',          multiplier: 1.0, minFarePaise: 50000  },
      { service: 'camera_issue',          multiplier: 1.0, minFarePaise: 60000  },
      { service: 'data_recovery',         multiplier: 1.2, minFarePaise: 100000 },
      { service: 'device_not_turning_on', multiplier: 1.0, minFarePaise: 50000  },
      // Laptop
      { service: 'laptop_slow',              multiplier: 1.0, minFarePaise: 35000  },
      { service: 'laptop_ssd_upgrade',       multiplier: 1.1, minFarePaise: 60000  },
      { service: 'laptop_ram_upgrade',       multiplier: 1.0, minFarePaise: 40000  },
      { service: 'laptop_keyboard_issue',    multiplier: 1.0, minFarePaise: 50000  },
      { service: 'laptop_motherboard_issue', multiplier: 1.3, minFarePaise: 150000 },
      { service: 'laptop_charging_issue',    multiplier: 1.0, minFarePaise: 40000  },
      { service: 'laptop_screen_issue',      multiplier: 1.2, minFarePaise: 100000 },
      { service: 'laptop_virus_removal',     multiplier: 1.0, minFarePaise: 40000  },
      { service: 'laptop_data_recovery',     multiplier: 1.2, minFarePaise: 100000 },
      // Smart Devices
      { service: 'smart_tv_install',      multiplier: 1.1, minFarePaise: 80000  },
      { service: 'smart_tv_repair',       multiplier: 1.1, minFarePaise: 100000 },
      { service: 'router_setup',          multiplier: 1.0, minFarePaise: 50000  },
      { service: 'router_troubleshoot',   multiplier: 1.0, minFarePaise: 45000  },
      { service: 'cctv_install',          multiplier: 1.2, minFarePaise: 120000 },
      { service: 'cctv_repair',           multiplier: 1.0, minFarePaise: 80000  },
      { service: 'smart_lock_install',    multiplier: 1.1, minFarePaise: 100000 },
      { service: 'home_automation_setup', multiplier: 1.3, minFarePaise: 200000 },
      // Vehicle Care
      { service: 'puncture',              multiplier: 0.8, minFarePaise: 10000  },
      { service: 'bike_chain_issue',      multiplier: 0.9, minFarePaise: 15000  },
      { service: 'bike_brake_issue',      multiplier: 0.9, minFarePaise: 15000  },
      { service: 'bike_battery_issue',    multiplier: 1.0, minFarePaise: 30000  },
      { service: 'bike_wash',             multiplier: 0.8, minFarePaise: 20000  },
      { service: 'bike_breakdown',        multiplier: 1.2, minFarePaise: 40000  },
      { service: 'bike_service',          multiplier: 1.0, minFarePaise: 35000  },
      { service: 'car_wash',              multiplier: 0.9, minFarePaise: 30000  },
      { service: 'car_detailing',         multiplier: 1.2, minFarePaise: 100000 },
      { service: 'battery_jump_start',    multiplier: 1.0, minFarePaise: 30000  },
      { service: 'car_puncture',          multiplier: 0.9, minFarePaise: 15000  },
      { service: 'car_breakdown',         multiplier: 1.3, minFarePaise: 50000  },
      { service: 'fuel_delivery',         multiplier: 0.7, minFarePaise: 10000  },
      { service: 'car_service',           multiplier: 1.1, minFarePaise: 50000  },
      { service: 'commercial_emergency',  multiplier: 1.5, minFarePaise: 80000  },
      { service: 'commercial_scheduled_maintenance', multiplier: 1.0, minFarePaise: 60000 },
      { service: 'fleet_support',         multiplier: 1.2, minFarePaise: 100000 },
      { service: 'auto_repair',           multiplier: 1.0, minFarePaise: 40000  },
      { service: 'van_repair',            multiplier: 1.1, minFarePaise: 50000  },
      // Family & Elder Assist
      { service: 'medicine_pickup',       multiplier: 0.6, minFarePaise: 5000   },
      { service: 'hospital_companion',    multiplier: 1.2, minFarePaise: 50000  },
      { service: 'grocery_assistance',    multiplier: 0.5, minFarePaise: 3000   },
      { service: 'bill_payment_assist',   multiplier: 0.5, minFarePaise: 2000   },
      { service: 'document_submission',   multiplier: 0.8, minFarePaise: 10000  },
      { service: 'home_visit_check',      multiplier: 1.0, minFarePaise: 30000  },
      { service: 'elder_doctor_visit',    multiplier: 1.2, minFarePaise: 60000  },
      { service: 'elder_companion',       multiplier: 1.1, minFarePaise: 40000  },
      { service: 'elder_home_visit',      multiplier: 1.0, minFarePaise: 35000  },
      { service: 'elder_transport',       multiplier: 1.0, minFarePaise: 45000  },
      // Event Crew
      { service: 'event_decorator',         multiplier: 1.2, minFarePaise: 100000 },
      { service: 'event_setup_crew',        multiplier: 1.1, minFarePaise: 80000  },
      { service: 'event_cleaning_crew',     multiplier: 1.0, minFarePaise: 60000  },
      { service: 'event_helper',            multiplier: 0.9, minFarePaise: 50000  },
      { service: 'event_sound_crew',        multiplier: 1.2, minFarePaise: 100000 },
      { service: 'event_lighting_crew',     multiplier: 1.2, minFarePaise: 100000 },
      { service: 'event_security_crew',     multiplier: 1.1, minFarePaise: 80000  },
      { service: 'event_birthday_setup',    multiplier: 1.1, minFarePaise: 100000 },
      { service: 'event_wedding_setup',     multiplier: 1.5, minFarePaise: 300000 },
      { service: 'event_photography_assist',multiplier: 1.0, minFarePaise: 80000  },
      { service: 'event_catering_assist',   multiplier: 1.0, minFarePaise: 80000  },
      // Pet Assistance
      { service: 'pet_grooming',      multiplier: 1.0, minFarePaise: 40000  },
      { service: 'pet_walking',       multiplier: 0.8, minFarePaise: 15000  },
      { service: 'pet_transport',     multiplier: 1.0, minFarePaise: 30000  },
      { service: 'pet_sitting',       multiplier: 1.0, minFarePaise: 25000  },
      { service: 'pet_vet_assist',    multiplier: 1.2, minFarePaise: 50000  },
      { service: 'pet_training_assist',multiplier: 1.1,minFarePaise: 60000  },
    ],
    // Late arrival penalty
    lateArrivalPenaltyPaisePerMin: 200,
    lateArrivalGraceMinutes:       5,
    // Offer boost
    boostEnabled:        true,
    boostMaxPaise:       20000,
    boostOptions:        [10, 20, 30, 50, 100],
    boostDispatchWeight: 1.5,
    // Service tiers
    tierMultiplierPriority:  1.2,
    tierMultiplierExpress:   1.4,
    tierExpressMaxSearchMs:  60000,
    tierPriorityMaxSearchMs: 120000,
  };
}

async function bustCache() {
  await redis.del(CACHE_KEY);
  _localCache = { data: null, at: 0 };
}

// --- Surge ---

// Hard safety caps applied at the service layer regardless of caller.
// These prevent any admin (or bug) from setting dangerous business values.
const PRICING_HARD_LIMITS = {
  commissionRate:   { min: 0,    max: 0.45  }, // never above 45%
  surgeMaxCap:      { min: 1.0,  max: 3.0   }, // never above 3× surge
  platformFeePaise: { min: 0,    max: 10000 }, // ₹100 max flat platform fee
  minFarePaise:     { min: 0,    max: 100000 }, // ₹1000 max minimum fare
};

function clampConfig(patch) {
  const safe = { ...patch };
  for (const [key, { min, max }] of Object.entries(PRICING_HARD_LIMITS)) {
    if (safe[key] !== undefined) {
      safe[key] = Math.min(max, Math.max(min, Number(safe[key])));
    }
  }
  return safe;
}

async function updateActiveConfig(patch, adminId) {
  const safePatch = clampConfig(patch);
  if (JSON.stringify(safePatch) !== JSON.stringify(patch)) {
    logger.warn({ adminId, original: patch, clamped: safePatch }, '[PRICING] Config update clamped by hard limits');
  }

  const current = await PricingConfig.findOne({ isActive: true });
  const newVersion = (current?.version || 0) + 1;

  if (current) {
    current.isActive = false;
    await current.save();
  }

  const merged = {
    ...(current ? toView(current) : envFallback()),
    ...safePatch,
  };

  const next = await PricingConfig.create({
    ...merged,
    version: newVersion,
    isActive: true,
    createdBy: adminId,
  });

  await bustCache();
  logger.info({ version: newVersion, adminId, commissionRate: merged.commissionRate }, 'Pricing config updated');
  return next;
}

module.exports = {
  getActiveConfig,
  toView,
  envFallback,
  bustCache,
  PRICING_HARD_LIMITS,
  clampConfig,
  updateActiveConfig,
};
