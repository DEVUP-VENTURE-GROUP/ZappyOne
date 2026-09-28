/**
 * Zone / Geofence Service
 * ----------------------------------------------------------------------------
 * Zones are GeoJSON polygons that override pricing/surge/availability for a
 * geographic area. The full list is cached in Redis (`zones:all`, 300s TTL)
 * because order pricing reads it on every booking quote — a hot path.
 *
 * Point-in-zone lookups use MongoDB $geoIntersects against the 2dsphere index
 * (precise, server-side) rather than the cache, since the cache is for the
 * full-list read and pricing-multiplier resolution.
 * ----------------------------------------------------------------------------
 */

const Zone = require('./zone.model');
const Order = require('../order/order.model');
const Worker = require('../worker/worker.model');
const { redis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { toLatLng } = require('../../utils/distance');

const CACHE_KEY = 'zones:all';
const CACHE_TTL = 300;

async function bustCache() {
  try {
    await redis.del(CACHE_KEY);
  } catch (err) {
    logger.warn({ err: err.message }, '[ZONE] cache bust failed');
  }
}

async function createZone(data) {
  const zone = await Zone.create(data);
  await bustCache();
  return zone.toObject();
}

async function updateZone(id, patch) {
  const zone = await Zone.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
  if (!zone) throw Object.assign(new Error('Zone not found'), { status: 404 });
  await bustCache();
  return zone.toObject();
}

async function deleteZone(id) {
  const zone = await Zone.findByIdAndDelete(id);
  if (!zone) throw Object.assign(new Error('Zone not found'), { status: 404 });
  await bustCache();
  return { ok: true };
}

async function getAllZones() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss / redis down — fall through to DB */ }

  const zones = await Zone.find().sort({ createdAt: -1 }).lean();
  try {
    await redis.set(CACHE_KEY, JSON.stringify(zones), 'EX', CACHE_TTL);
  } catch { /* best-effort cache fill */ }
  return zones;
}

/**
 * Find which zone (if any) a coordinate falls inside. Uses $geoIntersects.
 * Returns the first matching active/coming_soon zone, or null.
 */
async function getZoneForPoint(lng, lat) {
  if (lng == null || lat == null) return null;
  const zone = await Zone.findOne({
    polygon: {
      $geoIntersects: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
      },
    },
  }).lean();
  return zone || null;
}

/** The active zone containing this point, or null. */
async function getActiveZoneForPoint(lng, lat) {
  if (lng == null || lat == null) return null;
  return Zone.findOne({
    status: 'active',
    polygon: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] } } },
  }).lean();
}

/**
 * Whether bookings are limited to drawn zones. Until an admin draws at least one
 * active zone, coverage is decided by provider service areas alone.
 */
async function zonesEnforced() {
  return (await getAllZones()).some((z) => z.status === 'active');
}

/**
 * Refuse a booking location outside every active zone. Accepts GeoJSON, a
 * [lng, lat] pair or { lat, lng }; a missing location is left to the caller.
 */
async function assertBookableLocation(location) {
  const p = toLatLng(location?.coordinates ?? location);
  if (!p) return;
  const { lng, lat } = p;
  if (!(await zonesEnforced())) return;
  if (await getActiveZoneForPoint(lng, lat)) return;
  throw Object.assign(new Error("ZappyOne doesn't serve this location yet"), { status: 400, code: 'OUTSIDE_SERVICE_AREA' });
}

/**
 * Apply a zone's pricingMultiplier to a base price (in paise).
 * Returns { adjustedPaise, zoneId, zoneName, multiplier }.
 * If no zone contains the point, the price is unchanged.
 */
async function applyZonePricing(basePricePaise, lng, lat) {
  const base = Math.round(Number(basePricePaise) || 0);
  const zone = await getZoneForPoint(lng, lat);
  if (!zone || !zone.pricingMultiplier || zone.pricingMultiplier === 1) {
    return { adjustedPaise: base, zoneId: zone?._id || null, zoneName: zone?.name || null, multiplier: zone?.pricingMultiplier || 1 };
  }
  const adjustedPaise = Math.round(base * zone.pricingMultiplier);
  return { adjustedPaise, zoneId: zone._id, zoneName: zone.name, multiplier: zone.pricingMultiplier };
}

/**
 * Stats for one zone: online worker count + recent (7d) order count inside it.
 */
async function getZoneStats(id) {
  const zone = await Zone.findById(id).lean();
  if (!zone) throw Object.assign(new Error('Zone not found'), { status: 404 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const geoQuery = {
    $geoWithin: { $geometry: { type: 'Polygon', coordinates: zone.polygon.coordinates } },
  };

  const [workerCount, recentOrders] = await Promise.all([
    Worker.countDocuments({ isOnline: true, currentLocation: geoQuery }),
    Order.countDocuments({ createdAt: { $gte: since }, pickupLocation: geoQuery }),
  ]);

  return {
    zoneId: id,
    name: zone.name,
    city: zone.city,
    workerCount,
    recentOrders,
    windowDays: 7,
  };
}

module.exports = {
  createZone,
  updateZone,
  deleteZone,
  getAllZones,
  getZoneForPoint,
  getActiveZoneForPoint,
  zonesEnforced,
  assertBookableLocation,
  applyZonePricing,
  getZoneStats,
};
