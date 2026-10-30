const { ProviderEnrolment, ServiceLine, ServiceDomain } = require('./onboarding.model');
const Shop = require('../shop/shop.model');
const Worker = require('../worker/worker.model');
const { candidateAreas } = require('../repair/services/matching.service');
const { PetProviderCapability } = require('../pet/models/config.model');
const helpingPricing = require('../helping/services/pricing.service');
const zoneService = require('../zone/zone.service');
const Zone = require('../zone/zone.model');
const { regionAt } = require('../zone/region');
const { metresBetween } = require('../../core/geo/distance');
const { redis } = require('../../config/redis');

const EARTH_RADIUS_KM = 6378.1;
const CACHE_TTL_SEC = 60;
const PET_MAX_RADIUS_KM = 50;

/**
 * Lines a customer may book: admin marked them live AND at least one provider
 * is approved for them. Shared by the catalog and the coverage check so the two
 * can never disagree about what "live" means.
 */
/**
 * Every line admin has made live with a customer flow — shown to customers in a
 * launch region even before a provider is approved, each flagged with whether
 * anyone is. Bookability is still decided per location (serviceabilityAt).
 */
async function loadOfferedLines() {
  const [domains, lines, approved] = await Promise.all([
    ServiceDomain.find({ isActive: true, isArchived: false }).sort({ displayOrder: 1, name: 1 }).lean(),
    ServiceLine.find({ status: 'live', isActive: true, isArchived: false, customerPath: { $ne: '' } })
      .sort({ displayOrder: 1, name: 1 }).lean(),
    ProviderEnrolment.distinct('lineCode', { status: 'approved' }),
  ]);
  const approvedSet = new Set(approved);
  return { domains, lines: lines.map((l) => ({ ...l, hasProviders: approvedSet.has(l.code) })) };
}

async function loadLiveLines() {
  const [domains, candidates, approved] = await Promise.all([
    ServiceDomain.find({ isActive: true, isArchived: false }).sort({ displayOrder: 1, name: 1 }).lean(),
    ServiceLine.find({ status: 'live', isActive: true, isArchived: false, customerPath: { $ne: '' } })
      .sort({ displayOrder: 1, name: 1 }).lean(),
    ProviderEnrolment.distinct('lineCode', { status: 'approved' }),
  ]);
  const approvedSet = new Set(approved);
  return { domains, lines: candidates.filter((l) => approvedSet.has(l.code)) };
}

const engineOf = (line) => (line.repairVertical ? 'repair'
  : line.customerPath.startsWith('/pet/') ? 'pet'
    : line.customerPath.startsWith('/helping') ? 'helping'
      : 'repair');

const ownerKey = (row) => (row.shopId ? `s:${row.shopId}` : `w:${row.workerId}`);
// [lng, lat] GeoJSON order on both sides.
const kmFrom = (point, coords) => (metresBetween(point, coords) ?? Infinity) / 1000;
const within = (point, radiusKm) => ({ $geoWithin: { $centerSphere: [point, radiusKm / EARTH_RADIUS_KM] } });

/**
 * Providers whose own coverage reaches this point, per engine — the same rules
 * each engine uses when it actually matches a booking.
 */
async function coveringOwners(lat, lng) {
  const point = [Number(lng), Number(lat)];
  const [areas, caps, helpRadiusKm] = await Promise.all([
    candidateAreas({ lat, lng }),
    PetProviderCapability.find({
      isActive: true, verificationStatus: 'verified', baseLocation: within(point, PET_MAX_RADIUS_KM),
    }).select('shopId workerId categoryCodes baseLocation serviceRadiusKm').lean(),
    helpingPricing.maxMatchRadiusKm(),
  ]);
  const helpers = await Worker.find({ shopId: null, isBlocked: { $ne: true }, currentLocation: within(point, helpRadiusKm) })
    .select('_id').lean();

  const repair = new Set(areas
    .filter((a) => a.center?.coordinates && kmFrom(point, a.center.coordinates) <= (a.radiusKm || 0))
    .map(ownerKey));
  const pet = new Map();
  for (const c of caps) {
    if (kmFrom(point, c.baseLocation.coordinates) > (c.serviceRadiusKm || 0)) continue;
    for (const code of c.categoryCodes || []) {
      if (!pet.has(code)) pet.set(code, new Set());
      pet.get(code).add(ownerKey(c));
    }
  }
  return { repair, pet, helping: new Set(helpers.map((w) => `w:${w._id}`)) };
}

/** Who among these owners is blocked, who can take work right now, and when the soonest shop opens. */
async function availabilityOf(ownerKeys, now = new Date()) {
  const shopIds = [], workerIds = [];
  for (const k of ownerKeys) (k.startsWith('s:') ? shopIds : workerIds).push(k.slice(2));
  const [shops, workers] = await Promise.all([
    shopIds.length ? Shop.find({ _id: { $in: shopIds } }).select('hours isActive isBlocked') : [],
    workerIds.length ? Worker.find({ _id: { $in: workerIds } }).select('isOnline isBlocked').lean() : [],
  ]);
  const open = new Set(), blocked = new Set();
  let nextOpening = null;
  for (const s of shops) {
    if (s.isBlocked) { blocked.add(`s:${s._id}`); continue; }
    // isActive is the owner's "open for bookings" switch; no hours listed counts as open while it is on.
    if (s.isActive !== false && s.isOpenAt(now) !== false) { open.add(`s:${s._id}`); continue; }
    const n = s.nextOpening(now);
    if (n && (!nextOpening || n.daysAhead < nextOpening.daysAhead
      || (n.daysAhead === nextOpening.daysAhead && n.opensAt < nextOpening.opensAt))) nextOpening = n;
  }
  for (const w of workers) {
    if (w.isBlocked) blocked.add(`w:${w._id}`);
    else if (w.isOnline) open.add(`w:${w._id}`);
  }
  return { open, blocked, nextOpening };
}

/**
 * Can ZappyOne serve this point, and with what?
 *   available  — at least one live service has a provider covering it who can take work now
 *   closed_now — covered, but every covering provider is offline or closed; nextOpening when known
 *   not_here   — outside every active zone, or no provider covers it
 */
async function serviceabilityAt({ lat, lng }) {
  const cacheKey = `svc:cov:${Number(lat).toFixed(3)}:${Number(lng).toFixed(3)}`;
  try {
    const hit = await redis.get(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch { /* cache is best-effort */ }

  const region = regionAt(lat, lng);
  const [enforced, zone, activeZones] = await Promise.all([
    zoneService.zonesEnforced(),
    zoneService.getActiveZoneForPoint(lng, lat),
    Zone.find({ status: 'active' }).select('name city').sort({ name: 1 }).lean(),
  ]);
  const areas = activeZones.map((z) => ({ name: z.name, city: z.city }));
  let result;

  if (enforced && !zone && !region) {
    result = { status: 'not_here', zone: null, region: null, areas, lines: [] };
  } else {
    const { lines } = await loadLiveLines();
    const [covering, enrolments] = await Promise.all([
      coveringOwners(lat, lng),
      ProviderEnrolment.find({ status: 'approved', lineCode: { $in: lines.map((l) => l.code) } })
        .select('lineCode shopId workerId').lean(),
    ]);
    const enrolledBy = new Map();
    for (const e of enrolments) {
      if (!enrolledBy.has(e.lineCode)) enrolledBy.set(e.lineCode, []);
      enrolledBy.get(e.lineCode).push(ownerKey(e));
    }

    const coveredOwners = new Map();
    for (const line of lines) {
      const engine = engineOf(line);
      const pool = engine === 'pet' ? covering.pet.get(line.code) : covering[engine];
      const owners = (enrolledBy.get(line.code) || []).filter((k) => pool?.has(k));
      if (owners.length) coveredOwners.set(line.code, owners);
    }

    const { open, blocked, nextOpening } = await availabilityOf(new Set([...coveredOwners.values()].flat()));
    const covered = [...coveredOwners]
      .map(([code, owners]) => [code, owners.filter((k) => !blocked.has(k))])
      .filter(([, owners]) => owners.length)
      .map(([code, owners]) => ({ code, openNow: owners.some((k) => open.has(k)) }));
    // In a launch region nothing is "not here": every service shows, and the
    // ones nobody covers yet read as coming soon (and record demand).
    const status = !covered.length ? (region ? 'coming_soon' : 'not_here')
      : covered.some((l) => l.openNow) ? 'available' : 'closed_now';
    result = {
      status,
      region,
      zone: zone ? { name: zone.name, city: zone.city } : null,
      areas,
      lines: covered,
      ...(status === 'closed_now' && { nextOpening }),
    };
  }

  try { await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SEC); } catch { /* best-effort */ }
  return result;
}

module.exports = { loadLiveLines, loadOfferedLines, serviceabilityAt };
