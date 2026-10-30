const { redis } = require('../../../config/redis');
const logger = require('../../../core/logger');
const { getActiveConfig } = require('./config.service');

/** Surge from live demand and supply per area, and the zone-gap bonus. */

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

  // Persist demand event to Mongo for heatmap analytics.
  // Redis buckets expire in 5 min; Mongo is the durable store for historical patterns.
  try {
    const DemandEvent = require('../../analytics/demand-event.model');
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

module.exports = {
  geoBucket,
  computeSurgeBreakdown,
  computeSurge,
  recordDemand,
  recordSupply,
  zoneGapBonusPaise,
  zoneGap,
};
