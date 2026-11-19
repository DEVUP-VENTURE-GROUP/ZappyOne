// "Busy for 1 h / 2 h / until": a pro stays online and keeps the jobs they hold, but gets no new offers until then.
const mongoose = require('mongoose');

const MAX_HOURS = 12;
const CHOICES = [60, 120];
const NEAR_KM = 8;
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const Worker = () => require('../worker/worker.model');
const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

async function set({ workerId, minutes, until, off = false, now = Date.now() }) {
  if (off) {
    await Worker().updateOne({ _id: workerId }, { $set: { busyUntil: null } });
    return { busyUntil: null, message: 'You are taking new jobs again.' };
  }
  let at;
  if (minutes != null) {
    if (!CHOICES.includes(minutes)) throw err(400, 'BAD_MINUTES', 'Pick 1 hour or 2 hours, or choose a time.');
    at = now + minutes * 60000;
  } else {
    at = new Date(until).getTime();
    if (!Number.isFinite(at) || at <= now + 5 * 60000) throw err(400, 'BAD_TIME', 'Choose a time at least 5 minutes from now.');
    if (at > now + MAX_HOURS * 3600000) throw err(400, 'TOO_LONG', `You can be busy for up to ${MAX_HOURS} hours. For longer, go offline.`);
  }
  const busyUntil = new Date(at);
  await Worker().updateOne({ _id: workerId }, { $set: { busyUntil } });
  return { busyUntil, message: `No new jobs until ${clock(busyUntil)}. Your current jobs stay with you.` };
}

// Ids (as strings) among these that are busy right now: the matching gate leaves them out.
async function busyAmong(ids, now = Date.now()) {
  if (!ids?.length) return new Set();
  const rows = await Worker().find({ _id: { $in: ids }, busyUntil: { $gt: new Date(now) } }).select('_id').lean();
  return new Set(rows.map((r) => String(r._id)));
}

// When every nearby pro for a service is busy: the soonest one says they are free again, in minutes.
async function freeInMin({ workerIds, lat, lng, now = Date.now() }) {
  if (!workerIds?.length) return null;
  const rows = await Worker().find({
    _id: { $in: workerIds.map((i) => new mongoose.Types.ObjectId(String(i))) },
    isOnline: true, isBlocked: { $ne: true }, busyUntil: { $gt: new Date(now) },
    currentLocation: { $geoWithin: { $centerSphere: [[lng, lat], NEAR_KM / 6378.1] } },
  }).select('busyUntil').sort({ busyUntil: 1 }).limit(1).lean();
  if (!rows.length) return null;
  return Math.max(5, Math.ceil((new Date(rows[0].busyUntil).getTime() - now) / 300000) * 5);
}

const viewOf = (w, now = Date.now()) => (w?.busyUntil && new Date(w.busyUntil).getTime() > now ? new Date(w.busyUntil) : null);

module.exports = { set, busyAmong, freeInMin, viewOf, CHOICES, MAX_HOURS };
