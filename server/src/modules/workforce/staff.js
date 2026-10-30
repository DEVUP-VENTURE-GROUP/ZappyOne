/**
 * Who is ZappyOne's own staff, and who of them is on duty now. Staff are
 * Rakshak workers with employment.type 'staff' (worker.model): same app,
 * same jobs; salaried, so job money settles to ZappyOne (payment/settlement)
 * and dispatch gives them jobs first while on shift (jobs/fast-assign).
 */
const Worker = require('../worker/worker.model');
const Shift = require('./shift.model');

const cache = new Map(); // workerId -> { staff, at }
const TTL_MS = 60 * 1000;

async function isStaff(workerId) {
  if (!workerId) return false;
  const key = String(workerId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.staff;
  const w = await Worker.findById(workerId).select('employment.type').lean();
  const staff = w?.employment?.type === 'staff';
  cache.set(key, { staff, at: Date.now() });
  return staff;
}

/** Admin changed someone's employment: forget what we knew. */
const forget = (workerId) => cache.delete(String(workerId));

/** Staff checked in on a shift that is running now: Set of worker id strings. */
async function onDutyIds(now = new Date()) {
  // Version 1 runs on partners only: with the switch off nobody is on duty, so dispatch, the ZappyOne pro option and staff alerts all fall away together.
  if (!(await require('../feature-flags/feature-flag.service').isEnabled('own_staff'))) return new Set();
  const rows = await Shift.find({ status: 'checked_in', startAt: { $lte: new Date(now.getTime() + 60 * 60000) }, endAt: { $gte: now } })
    .select('workerId').lean();
  const ids = new Set(rows.map((r) => String(r.workerId)));
  // Shifts optional (Fleet settings, shiftRequired off): staff who are online count as on duty.
  const { shiftRequired } = await require('../pricing/services/config.service').workforceSettings();
  if (!shiftRequired) {
    const online = await Worker.find({ 'employment.type': 'staff', isOnline: true, isBlocked: { $ne: true } }).select('_id').lean();
    online.forEach((w) => ids.add(String(w._id)));
  }
  return ids;
}

// On-duty staff who can reach a place: their hub serves it (workforce/coverage), or with no hub, they stand within fallbackKm.
async function onDutyNear({ lat, lng }, { fallbackKm = 5, now = new Date() } = {}) {
  const ids = [...await onDutyIds(now)];
  if (!ids.length) return [];
  const { haversineKm } = require('../../core/geo/distance');
  const coverage = require('./coverage');
  const workers = await Worker.find({ _id: { $in: ids }, isBlocked: { $ne: true } }).select('currentLocation employment.hubId').lean();
  const hubIds = workers.map((w) => w.employment?.hubId).filter(Boolean);
  const hubs = hubIds.length ? await require('./hub.model').find({ _id: { $in: hubIds } }).select(coverage.HUB_FIELDS).lean() : [];
  const hubOf = new Map(hubs.map((h) => [String(h._id), h]));
  const at = { lat, lng };
  return workers.map((w) => {
    const c = w.currentLocation?.coordinates;
    const km = c?.length === 2 ? haversineKm(lat, lng, c[1], c[0]) : null;
    const hub = hubOf.get(String(w.employment?.hubId));
    const reaches = hub ? coverage.covers(hub, at) : km != null && km <= fallbackKm;
    return reaches ? { workerId: String(w._id), km } : null;
  }).filter(Boolean);
}

module.exports = { isStaff, forget, onDutyIds, onDutyNear };
