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

module.exports = { isStaff, forget, onDutyIds };
