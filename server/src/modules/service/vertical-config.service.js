/**
 * VerticalConfig Service
 * ---------------------------------------------------------------------------
 * Manages pricing configs for the three deep verticals:
 *   mobile | construction | vehicle
 *
 * Config cache: Redis 60s → MongoDB → code defaults
 * Every update creates a new versioned record (old deactivated).
 * ---------------------------------------------------------------------------
 */

const VerticalConfig = require('./vertical-config.model');
const { redis } = require('../../config/redis');
const logger = require('../../core/logger');

const CACHE_TTL = 60;
const CACHE_KEY = (v) => `config:vertical:${v}`;

const DEFAULTS = {
  mobile: {
    inspectionFeePaise:   15000,
    urgentSurchargePaise: 10000,
    warrantyDays:         30,
    spareParts:           [],
  },
  construction: {
    visitFeePaise:      10000,
    perHourFeePaise:    40000,
    materialMarkupPct:  15,
    urgentSurchargePct: 20,
  },
  vehicle: {
    baseVisitFeePaise:       5000,
    perKmFeePaise:           1500,
    emergencySurchargePaise: 10000,
    nightSurchargePaise:     8000,
    nightStartHour:          22,
    nightEndHour:            6,
  },
};

const _localCache = { mobile: null, construction: null, vehicle: null, at: {} };
const LOCAL_TTL_MS = 5000;

async function getConfig(vertical) {
  const now = Date.now();
  if (_localCache[vertical] && now - (_localCache.at[vertical] || 0) < LOCAL_TTL_MS) {
    return _localCache[vertical];
  }

  const cached = await redis.get(CACHE_KEY(vertical));
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      _localCache[vertical] = parsed;
      _localCache.at[vertical] = now;
      return parsed;
    } catch { /* ignore */ }
  }

  const doc = await VerticalConfig.findOne({ vertical, isActive: true }).lean();
  // Always resolve to an object. Verticals without a seeded doc AND without a
  // DEFAULTS entry (family_assist, event_crew, pet, laptop, smart_device) would
  // otherwise return undefined — every pricing engine reads `cfg.x` and would
  // throw a 500. Callers all self-default via `cfg.x || fallback`, so {} is safe.
  // (Also prevents caching `undefined`, which JSON.stringify turns into the
  // string "undefined" and poisons the cache on the next read.)
  const data = (doc ? doc[vertical] : DEFAULTS[vertical]) || {};

  await redis.setex(CACHE_KEY(vertical), CACHE_TTL, JSON.stringify(data));
  _localCache[vertical] = data;
  _localCache.at[vertical] = now;
  return data;
}

async function bustCache(vertical) {
  await redis.del(CACHE_KEY(vertical));
  _localCache[vertical] = null;
  _localCache.at[vertical] = 0;
}

async function updateConfig(vertical, patch, adminId) {
  const current = await VerticalConfig.findOne({ vertical, isActive: true });
  const newVersion = (current?.version || 0) + 1;

  if (current) {
    current.isActive = false;
    await current.save();
  }

  const merged = {
    ...(current ? current[vertical]?.toObject?.() || current[vertical] || DEFAULTS[vertical] : DEFAULTS[vertical]),
    ...patch,
  };

  const next = await VerticalConfig.create({
    vertical,
    isActive: true,
    version: newVersion,
    createdBy: adminId,
    [vertical]: merged,
  });

  await bustCache(vertical);
  logger.info({ vertical, version: newVersion, adminId }, 'VerticalConfig updated');
  return next;
}

async function getAll() {
  const [mobile, construction, vehicle] = await Promise.all([
    getConfig('mobile'),
    getConfig('construction'),
    getConfig('vehicle'),
  ]);
  return { mobile, construction, vehicle };
}

// --- Mobile spare part helpers ---

async function addSparePart(sparePartData, adminId) {
  const doc = await VerticalConfig.findOne({ vertical: 'mobile', isActive: true });
  if (!doc) {
    return updateConfig('mobile', { spareParts: [sparePartData] }, adminId);
  }
  doc.mobile.spareParts.push(sparePartData);
  await doc.save();
  await bustCache('mobile');
  return doc;
}

async function removeSparePart(sparePartId, adminId) {
  const doc = await VerticalConfig.findOne({ vertical: 'mobile', isActive: true });
  if (!doc) throw Object.assign(new Error('No active mobile config'), { status: 404 });

  doc.mobile.spareParts = doc.mobile.spareParts.filter(
    (sp) => String(sp._id) !== String(sparePartId)
  );
  await doc.save();
  await bustCache('mobile');
  logger.info({ sparePartId, adminId }, 'Spare part removed');
  return doc;
}

async function updateSparePart(sparePartId, patch, adminId) {
  const doc = await VerticalConfig.findOne({ vertical: 'mobile', isActive: true });
  if (!doc) throw Object.assign(new Error('No active mobile config'), { status: 404 });

  const sp = doc.mobile.spareParts.id(sparePartId);
  if (!sp) throw Object.assign(new Error('Spare part not found'), { status: 404 });

  Object.assign(sp, patch);
  await doc.save();
  await bustCache('mobile');
  logger.info({ sparePartId, adminId }, 'Spare part updated');
  return doc;
}

/**
 * Look up spare part cost for a given booking.
 * Falls back to brand-level 'all' model entry if exact model not found.
 */
async function lookupSparePartCost({ brand, service, model }) {
  const cfg = await getConfig('mobile');
  const parts = (cfg.spareParts || []).filter(
    (sp) => sp.isActive && sp.brand === brand && sp.service === service
  );
  const exact = parts.find((sp) => sp.model === model);
  const fallback = parts.find((sp) => sp.model === 'all');
  return (exact || fallback)?.costPaise ?? null;
}

/**
 * Check if current time falls within vehicle night surcharge window.
 */
function isNightTime(cfg) {
  const hour = new Date().getHours();
  const { nightStartHour = 22, nightEndHour = 6 } = cfg;
  if (nightStartHour > nightEndHour) {
    // e.g. 22–6 wraps midnight
    return hour >= nightStartHour || hour < nightEndHour;
  }
  return hour >= nightStartHour && hour < nightEndHour;
}

module.exports = {
  getConfig,
  getAll,
  updateConfig,
  bustCache,
  addSparePart,
  removeSparePart,
  updateSparePart,
  lookupSparePartCost,
  isNightTime,
  DEFAULTS,
};
