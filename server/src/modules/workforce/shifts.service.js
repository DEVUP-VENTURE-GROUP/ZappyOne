/**
 * Shifts for ZappyOne's own staff, end to end in the Rakshak app:
 *
 *   book      a staff member picks their hub's shifts for the coming days
 *             (or admin puts them on one); up to the number the hub needs
 *   check in  a selfie at the hub's meeting point, inside its radius, from a
 *             little before the shift; they are on duty: live, and first in
 *             line for jobs nearby (jobs/fast-assign)
 *   check out at the end; the sweep closes shifts left open and marks the
 *             ones never started as missed
 *
 * Times are India time; a shift ending before it starts runs past midnight.
 */
const Hub = require('./hub.model');
const Shift = require('./shift.model');
const Worker = require('../worker/worker.model');
const { haversineKm } = require('../../core/geo/distance');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const settings = () => require('../pricing/services/config.service').workforceSettings();

const DAY_MS = 86400000;
/** India's date for a moment, YYYY-MM-DD. */
const istDay = (d = new Date()) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const atIst = (day, hhmm) => new Date(`${day}T${hhmm}:00+05:30`);
const addDays = (day, n) => istDay(new Date(atIst(day, '12:00').getTime() + n * DAY_MS));

/** When a hub's shift runs on a day. */
function timesOf(day, s) {
  const startAt = atIst(day, s.start);
  let endAt = atIst(day, s.end);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + DAY_MS);
  return { startAt, endAt };
}

async function staffOf(workerId) {
  const w = await Worker.findById(workerId).select('name employment').lean();
  if (w?.employment?.type !== 'staff') throw err(403, 'NOT_STAFF', 'Shifts are for ZappyOne staff.');
  if (!w.employment.hubId) throw err(409, 'NO_HUB', 'You are not at a hub yet. Ask your manager.');
  const hub = await Hub.findById(w.employment.hubId).lean();
  if (!hub?.isActive) throw err(409, 'NO_HUB', 'Your hub is not open. Ask your manager.');
  return { worker: w, hub };
}

/** A staff member's view: their hub, today's shift, and the coming days' shifts with room. */
async function myShifts(workerId, days = 7) {
  const { hub } = await staffOf(workerId);
  const today = istDay();
  const dayList = Array.from({ length: days }, (_, i) => addDays(today, i));
  const [mine, counts] = await Promise.all([
    Shift.find({ workerId, day: { $in: dayList } }).lean(),
    Shift.aggregate([
      { $match: { hubId: hub._id, day: { $in: dayList }, status: { $in: ['booked', 'checked_in', 'done'] } } },
      { $group: { _id: { day: '$day', code: '$code' }, n: { $sum: 1 } } },
    ]),
  ]);
  const taken = new Map(counts.map((c) => [`${c._id.day}:${c._id.code}`, c.n]));
  const now = Date.now();
  const schedule = dayList.map((day) => ({
    day,
    shifts: hub.shifts.map((s) => {
      const { startAt, endAt } = timesOf(day, s);
      const own = mine.find((m) => m.day === day && m.code === s.code && m.status !== 'cancelled') || null;
      const booked = taken.get(`${day}:${s.code}`) || 0;
      return {
        code: s.code, label: s.label, start: s.start, end: s.end, startAt, endAt, need: s.need, booked,
        mine: own ? { id: String(own._id), status: own.status } : null,
        canBook: !own && endAt.getTime() > now && booked < s.need,
      };
    }),
  }));
  const current = mine
    .filter((m) => ['booked', 'checked_in'].includes(m.status) && new Date(m.endAt).getTime() > now)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0] || null;
  return {
    hub: { id: String(hub._id), name: hub.name, address: hub.meetingPoint.address, coordinates: hub.meetingPoint.location.coordinates, radiusM: hub.radiusM },
    current, schedule,
  };
}

/** Put someone on a shift (themselves, or admin). */
async function book({ workerId, day, code, by = 'worker' }) {
  const { hub } = await staffOf(workerId);
  const s = hub.shifts.find((x) => x.code === code);
  if (!s) throw err(404, 'NO_SHIFT', 'That shift is not at your hub.');
  const { startAt, endAt } = timesOf(day, s);
  if (endAt.getTime() <= Date.now()) throw err(409, 'PAST', 'That shift is over.');
  if (startAt.getTime() > Date.now() + 14 * DAY_MS) throw err(409, 'TOO_FAR', 'Book up to two weeks ahead.');
  if (by === 'worker') {
    const booked = await Shift.countDocuments({ hubId: hub._id, day, code, status: { $in: ['booked', 'checked_in', 'done'] } });
    if (booked >= s.need) throw err(409, 'FULL', 'That shift is full. Pick another.');
  }
  try {
    const row = await Shift.findOneAndUpdate(
      { workerId, day, code },
      { $set: { hubId: hub._id, label: s.label, startAt, endAt, status: 'booked', bookedBy: by, checkInAt: null, checkOutAt: null } },
      { upsert: true, new: true },
    );
    return row.toObject();
  } catch (e) {
    if (e.code === 11000) throw err(409, 'TAKEN', 'You are already on that shift.');
    throw e;
  }
}

/** Off a shift, up to two hours before it starts (admin any time before it starts). */
async function cancel({ workerId, shiftId, by = 'worker' }) {
  const s = await Shift.findOne({ _id: shiftId, workerId, status: 'booked' });
  if (!s) throw err(404, 'NOT_FOUND', 'Shift not found.');
  const lead = by === 'worker' ? 2 * 3600000 : 0;
  if (s.startAt.getTime() - Date.now() < lead) throw err(409, 'TOO_LATE', 'It starts soon. Ask your manager to take you off.');
  s.status = 'cancelled';
  await s.save();
  return s.toObject();
}

/** Start the shift: at the hub's meeting point, with a selfie. */
async function checkIn({ workerId, lat, lng, selfieKey }) {
  const { hub } = await staffOf(workerId);
  if (!selfieKey) throw err(400, 'SELFIE', 'Take a selfie to check in.');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw err(400, 'LOCATION', 'Turn on location to check in.');
  const cfg = await settings();
  const now = Date.now();
  const s = await Shift.findOne({
    workerId, status: 'booked',
    startAt: { $lte: new Date(now + cfg.checkInEarlyMin * 60000) }, endAt: { $gt: new Date(now) },
  }).sort({ startAt: 1 });
  if (!s) throw err(409, 'NO_SHIFT_NOW', `No shift to start now. You can check in ${cfg.checkInEarlyMin} minutes before your shift.`);
  const [hLng, hLat] = hub.meetingPoint.location.coordinates;
  const metres = Math.round(haversineKm(lat, lng, hLat, hLng) * 1000);
  // At least 500 m: GPS on a phone indoors drifts a few hundred metres (workforce check-in).
  const allowedM = Math.max(hub.radiusM || 0, 500);
  if (metres > allowedM) throw err(409, 'TOO_FAR', `You are ${metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`} from ${hub.name}. Check in at the meeting point.`);
  const late = Math.max(0, Math.round((now - s.startAt.getTime()) / 60000));
  s.status = 'checked_in';
  s.checkInAt = new Date(now);
  s.checkInSelfie = String(selfieKey).slice(0, 300);
  s.checkInDistanceM = metres;
  s.lateMin = late > cfg.lateGraceMin ? late : 0;
  await s.save();
  // On duty: live for jobs at once, from the hub.
  await Worker.updateOne({ _id: workerId }, { $set: { isOnline: true, currentLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } } });
  await require('../worker/presence').markLive(workerId).catch(() => {});
  return s.toObject();
}

async function checkOut({ workerId }) {
  const s = await Shift.findOne({ workerId, status: 'checked_in' }).sort({ startAt: -1 });
  if (!s) throw err(409, 'NOT_ON_DUTY', 'You are not on a shift.');
  s.status = 'done';
  s.checkOutAt = new Date();
  await s.save();
  await Worker.updateOne({ _id: workerId }, { $set: { isOnline: false } });
  return s.toObject();
}

/**
 * Every few minutes: shifts never started are missed once they are over;
 * shifts left open close an hour after they end, and the person goes offline.
 */
async function sweep(now = new Date()) {
  const missed = await Shift.updateMany({ status: 'booked', endAt: { $lt: now } }, { $set: { status: 'missed' } });
  const open = await Shift.find({ status: 'checked_in', endAt: { $lt: new Date(now.getTime() - 3600000) } }).select('workerId endAt').lean();
  for (const s of open) {
    await Shift.updateOne({ _id: s._id, status: 'checked_in' }, { $set: { status: 'done', checkOutAt: s.endAt } });
    await Worker.updateOne({ _id: s.workerId }, { $set: { isOnline: false } });
  }
  return { missed: missed.modifiedCount || 0, closed: open.length };
}

/** Admin: a hub's coming days, shift by shift: needed, who is on it and how it went. */
async function roster({ hubId, from = istDay(), days = 7 }) {
  const hub = await Hub.findById(hubId).lean();
  if (!hub) throw err(404, 'NOT_FOUND', 'Hub not found.');
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const rows = await Shift.find({ hubId, day: { $in: dayList }, status: { $ne: 'cancelled' } })
    .populate('workerId', 'name phone').lean();
  return {
    hub: { id: String(hub._id), name: hub.name },
    days: dayList.map((day) => ({
      day,
      shifts: hub.shifts.map((s) => {
        const people = rows.filter((r) => r.day === day && r.code === s.code)
          .map((r) => ({ id: String(r._id), workerId: String(r.workerId?._id || r.workerId), name: r.workerId?.name || 'Staff', phone: r.workerId?.phone || '', status: r.status, lateMin: r.lateMin, checkInAt: r.checkInAt, checkInDistanceM: r.checkInDistanceM, hasSelfie: !!r.checkInSelfie }));
        return { code: s.code, label: s.label, start: s.start, end: s.end, need: s.need, people, short: Math.max(0, s.need - people.length) };
      }),
    })),
  };
}

module.exports = { myShifts, book, cancel, checkIn, checkOut, sweep, roster, istDay, timesOf };
