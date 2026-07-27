/**
 * Pricing Service
 * ----------------------------------------------------------------------------
 * price = (base + distance*perKm + time*perMin + platformFee) * surge
 *
 * Config sources (precedence):
 *   1. Redis cache `config:pricing:active` (5s in-process cache too)
 *   2. PricingConfig collection (the active one)
 *   3. Env-based defaults
 *
 * Premium effects (only applied when computing for a specific user):
 *   - waivePlatformFee → platformFee = 0
 *   - surgeCap         → cap surge multiplier at the user's tier
 *
 * All money is computed in PAISE internally (integer math). Returned both
 * in paise and rupees for the frontend's convenience.
 * ----------------------------------------------------------------------------
 */

const config = require('../../config');
const { redis } = require('../../config/redis');
const { getDistanceAndEta } = require('../worker/maps.service');
const subscriptionService = require('../subscription/subscription.service');
const PricingConfig = require('./pricing-config.model');
const logger = require('../../utils/logger');
const verticalConfigService = require('../service/vertical-config.service');

// ── Vertical routing — maps service codes to pricing engines ─────────────────

// DISABLED: Generic home/construction services (architecture preserved)
// const HOME_SERVICES = new Set(['plumbing','electrical','helper','carpenter','ac_repair','cleaning','painting']);
// const CONSTRUCTION_SERVICES = new Set(['mason']);

const MOBILE_SERVICES = new Set([
  'screen_replacement', 'battery_replacement', 'charging_issue',
  'speaker_mic_issue', 'microphone_issue', 'software_issue',
  'water_damage', 'camera_issue', 'data_recovery', 'device_not_turning_on',
]);

const LAPTOP_SERVICES = new Set([
  'laptop_slow', 'laptop_ssd_upgrade', 'laptop_ram_upgrade',
  'laptop_keyboard_issue', 'laptop_motherboard_issue', 'laptop_charging_issue',
  'laptop_screen_issue', 'laptop_virus_removal', 'laptop_data_recovery',
]);

const SMART_DEVICE_SERVICES = new Set([
  'smart_tv_install', 'smart_tv_repair', 'router_setup', 'router_troubleshoot',
  'cctv_install', 'cctv_repair', 'smart_lock_install', 'home_automation_setup',
]);

const VEHICLE_SERVICES = new Set([
  'puncture', 'bike_chain_issue', 'bike_brake_issue', 'bike_battery_issue',
  'bike_wash', 'bike_breakdown', 'bike_service',
  'car_wash', 'car_detailing', 'battery_jump_start', 'car_puncture',
  'car_breakdown', 'fuel_delivery', 'car_service',
  'commercial_emergency', 'commercial_scheduled_maintenance', 'fleet_support',
  'auto_repair', 'van_repair',
]);

// Towing is priced separately — base hookup fee + per-km on the TOW leg
// (pickup → destination), which is longer and costlier than a service visit.
const TOWING_SERVICES = new Set(['car_towing', 'bike_towing']);

// Tank & water cleaning — flat per-service visit pricing (crew + equipment).
const TANK_CLEANING_SERVICES = new Set([
  'water_tank_cleaning', 'overhead_tank_cleaning', 'underground_sump_cleaning',
  'sintex_tank_cleaning',
]);

const FAMILY_SERVICES = new Set([
  'medicine_pickup', 'hospital_companion', 'grocery_assistance',
  'bill_payment_assist', 'document_submission', 'home_visit_check',
  'elder_doctor_visit', 'elder_companion', 'elder_home_visit', 'elder_transport',
]);

const EVENT_SERVICES = new Set([
  'event_decorator', 'event_setup_crew', 'event_cleaning_crew',
  'event_helper', 'event_sound_crew', 'event_lighting_crew',
  'event_security_crew', 'event_birthday_setup', 'event_wedding_setup',
  'event_photography_assist', 'event_catering_assist',
]);

const PET_SERVICES = new Set([
  'pet_grooming', 'pet_walking', 'pet_transport',
  'pet_sitting', 'pet_vet_assist', 'pet_training_assist',
]);

const CACHE_KEY = 'config:pricing:active';
const CACHE_TTL_REDIS = 60;
const CACHE_TTL_LOCAL_MS = 5000;

let _localCache = { data: null, at: 0 };

async function getActiveConfig() {
  const now = Date.now();
  if (_localCache.data && now - _localCache.at < CACHE_TTL_LOCAL_MS) return _localCache.data;

  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      _localCache = { data: parsed, at: now };
      return parsed;
    } catch { /* ignore */ }
  }

  const fromDb = await PricingConfig.findOne({ isActive: true }).lean();
  const view = fromDb ? toView(fromDb) : envFallback();

  await redis.setex(CACHE_KEY, CACHE_TTL_REDIS, JSON.stringify(view));
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

      // ── Electronics Rescue — Mobile ─────────────────────────────────────
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
      // ── Vehicle Care ────────────────────────────────────────────────────
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
      // ── Family & Elder Assist ────────────────────────────────────────────
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
      // ── Event Crew ───────────────────────────────────────────────────────
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
      // ── Pet Assistance ───────────────────────────────────────────────────
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

function geoBucket(lat, lng) {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

async function computeSurgeBreakdown(lat, lng, cfg) {
  const anyAutoPricingOn = cfg.nightSurchargeEnabled || cfg.rainSurchargeEnabled ||
                           cfg.weekendSurchargeEnabled || cfg.peakHourSurchargeEnabled;
  if (!cfg.surgeEnabled && !anyAutoPricingOn) {
    return { multiplier: 1.0, factors: [], demand: 0, supply: 0 };
  }

  let demand = 0, supply = 0;
  let surge = 1.0;

  // Demand/supply ratio — only when global surge toggle is on
  if (cfg.surgeEnabled) {
    const bucket = geoBucket(lat, lng);
    [demand, supply] = await Promise.all([
      redis.get(`demand:${bucket}`).then((v) => Number(v) || 0),
      redis.scard(`supply:${bucket}`).then((v) => Number(v) || 0),
    ]);

    if (supply > 0) {
      const ratio = demand / supply;
      if (ratio < 1) surge = 1.0;
      else if (ratio < 2) surge = 1.2;
      else if (ratio < 3) surge = 1.5;
      else if (ratio < 5) surge = 1.8;
      else surge = 2.5;
    }
    // supply === 0 → surge stays 1.0 (no workers = not a surge situation)
  }

  const factors = [];
  // IST = UTC + 5h30m
  const nowMs  = Date.now();
  const istMs  = nowMs + 330 * 60000;
  const istDate = new Date(istMs);
  const istHour = istDate.getUTCHours();
  const istDow  = istDate.getUTCDay(); // 0=Sun, 6=Sat

  if (cfg.nightSurchargeEnabled) {
    const start = cfg.nightStartHour ?? 22;
    const end   = cfg.nightEndHour   ?? 6;
    const m     = cfg.nightSurchargeMultiplier ?? 1.3;
    const isNight = start > end
      ? istHour >= start || istHour < end  // crosses midnight e.g. 22–6
      : istHour >= start && istHour < end;
    if (isNight && m > 1) {
      surge *= m;
      factors.push({ type: 'night', multiplier: m, label: 'Night Surcharge' });
    }
  }

  if (cfg.rainSurchargeEnabled && cfg.rainActiveUntil) {
    const m = cfg.rainSurchargeMultiplier ?? 1.2;
    if (new Date(cfg.rainActiveUntil) > new Date(nowMs) && m > 1) {
      surge *= m;
      factors.push({ type: 'rain', multiplier: m, label: 'Rain Surcharge' });
    }
  }

  if (cfg.weekendSurchargeEnabled) {
    const m = cfg.weekendSurchargeMultiplier ?? 1.1;
    if ((istDow === 0 || istDow === 6) && m > 1) {
      surge *= m;
      factors.push({ type: 'weekend', multiplier: m, label: 'Weekend Surcharge' });
    }
  }

  if (cfg.peakHourSurchargeEnabled && Array.isArray(cfg.peakHourRanges)) {
    for (const range of cfg.peakHourRanges) {
      const { startHour, endHour, multiplier: m, label } = range;
      if (istHour >= startHour && istHour < endHour && m > 1) {
        surge *= m;
        factors.push({ type: 'peak', multiplier: m, label: label || 'Peak Hour Surcharge' });
        break;
      }
    }
  }

  const raw = Math.min(surge, cfg.surgeMaxCap ?? 2.5);
  return { multiplier: Math.round(raw * 100) / 100, factors, demand, supply };
}

async function computeSurge(lat, lng, cfg) {
  const { multiplier } = await computeSurgeBreakdown(lat, lng, cfg);
  return multiplier;
}

async function recordDemand(lat, lng, service) {
  const key = `demand:${geoBucket(lat, lng)}`;
  await redis.multi().incr(key).expire(key, 300).exec();

  // Persist demand event to Mongo for heatmap analytics (#54).
  // Redis buckets expire in 5 min; Mongo is the durable store for historical patterns.
  try {
    const DemandEvent = require('../analytics/demand-event.model');
    await DemandEvent.create({
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      service: service || null,
      bucket: geoBucket(lat, lng),
    });
  } catch (_) { /* non-fatal — heatmap degrades gracefully without this row */ }

  // After recording demand, compute current surge and alert nearby workers if high
  try {
    const cfg = await getActiveConfig();
    const multiplier = await computeSurge(lat, lng, cfg);
    if (multiplier >= 1.3) {
      await redis.publish('surge:alert', JSON.stringify({ lat, lng, multiplier, service: service || null }));
      logger.info({ lat, lng, multiplier, service }, '[SURGE] Alert published');
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[SURGE] Failed to publish surge alert');
  }
}

async function recordSupply(workerId, lat, lng) {
  const key = `supply:${geoBucket(lat, lng)}`;
  await redis.multi().sadd(key, String(workerId)).expire(key, 120).exec();
}

/**
 * ZeroWait L3 — Predictive positioning.
 *
 * Live demand vs supply for this ~1km cell. When demand outstrips supply, jobs
 * here pay an extra bonus. That does two things at once:
 *   1. workers already in the cell are paid more to take the job, and
 *   2. idle workers elsewhere can SEE the hot cell (worker app) and move to it.
 * It's the supply-side flywheel that keeps the Ready Pool dense exactly where
 * orders actually land — instead of hoping supply happens to be nearby.
 *
 * Returns extra bonus in paise (0 when the cell is adequately supplied).
 */
async function zoneGapBonusPaise(lat, lng, cfg) {
  try {
    if (!cfg || cfg.positioningEnabled === false) return 0;
    const bucket = geoBucket(lat, lng);
    const [demand, supply] = await Promise.all([
      redis.get(`demand:${bucket}`).then((v) => Number(v) || 0).catch(() => 0),
      redis.scard(`supply:${bucket}`).then((v) => Number(v) || 0).catch(() => 0),
    ]);
    const gap = demand - supply;
    if (gap < (cfg.positioningMinGap ?? 2)) return 0;
    return cfg.positioningBonusPaise ?? 3000;
  } catch { return 0; }
}

/** Live demand/supply/gap for a cell — powers the worker "hot zones" map. */
async function zoneGap(lat, lng) {
  const bucket = geoBucket(lat, lng);
  const [demand, supply] = await Promise.all([
    redis.get(`demand:${bucket}`).then((v) => Number(v) || 0).catch(() => 0),
    redis.scard(`supply:${bucket}`).then((v) => Number(v) || 0).catch(() => 0),
  ]);
  return { bucket, demand, supply, gap: demand - supply };
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
  const ServiceVariant = require('../service/service-variant.model');
  const phoneCatalog   = require('../service/phone-catalog');
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
      const { escapeRegex, slug } = require('../../utils/text');
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
    // ── Generic path ────────────────────────────────────────────────
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

  // ── Catalog floor/ceiling + global surge — order: FLOOR → SURGE → CEILING ──
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
    const ServiceCatalog = require('../service/service-catalog.model');
    const catalogEntry = await ServiceCatalog.findOne(
      { code: service },
      'priceRangeMinPaise priceRangeMaxPaise'
    ).lean();

    if (catalogEntry) {
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

function paiseToRupees(p) {
  return Math.round(p / 100);
}

// Back-compat: order.service still calls quote()
const quote = calculatePrice;

// --- Earnings (commission split) ---

/**
 * Calculate the platform/worker earnings split for a completed order.
 * Honors a per-worker commission delta from the WORKER_PRO subscription.
 */
async function calculateEarnings({ totalPaise, workerId, snapshotCommissionRate }) {
  const cfg = await getActiveConfig();
  // Use the rate locked at order creation (snapshotCommissionRate) if present.
  // This ensures admin rate changes never retroactively alter in-flight payouts.
  let commissionRate = snapshotCommissionRate ?? cfg.commissionRate;

  if (workerId) {
    // Pro worker discount still applies on top of snapshot rate.
    const effects = await subscriptionService.getEffects({ kind: 'worker', id: workerId });
    if (typeof effects.commissionDelta === 'number') {
      commissionRate = Math.max(0, commissionRate + effects.commissionDelta);
    }
  }
  // Hard cap always enforced regardless of snapshot.
  commissionRate = Math.min(commissionRate, PRICING_HARD_LIMITS.commissionRate.max);

  const platformPaise = Math.round(totalPaise * commissionRate);
  const workerPaise = totalPaise - platformPaise;
  return {
    totalPaise,
    platformPaise,
    workerPaise,
    commissionRate,
  };
}

// --- Admin: update active config ---

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
  calculatePrice,
  quote, // alias
  calculateEarnings,
  computeSurge,
  computeSurgeBreakdown,
  recordDemand,
  recordSupply,
  zoneGapBonusPaise,
  zoneGap,
  getActiveConfig,
  updateActiveConfig,
  bustCache,
  // Vertical-specific pricing engines
  calculateMobilePrice,
  calculateLaptopPrice,
  calculateSmartDevicePrice,
  calculateVehiclePrice,
  calculateTowingPrice,
  calculateTankCleaningPrice,
  calculateFamilyAssistPrice,
  calculateEventPrice,
  calculatePetPrice,
  calculateConstructionPrice, // disabled at service level — kept for re-activation
  // Vertical sets (used by geo.service, worker.service, etc.)
  MOBILE_SERVICES,
  LAPTOP_SERVICES,
  SMART_DEVICE_SERVICES,
  VEHICLE_SERVICES,
  TOWING_SERVICES,
  TANK_CLEANING_SERVICES,
  FAMILY_SERVICES,
  EVENT_SERVICES,
  PET_SERVICES,
  // CONSTRUCTION_SERVICES kept as comment — no longer active
  // CONSTRUCTION_SERVICES,
};
