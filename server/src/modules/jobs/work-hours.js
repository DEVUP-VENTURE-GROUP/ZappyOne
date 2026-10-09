/**
 * A worker's week: the hours they take work, and the days they are off.
 *
 *   set by     the worker (Rakshak → My hours). Not set = no rule: they are
 *              matched exactly as before (online now = available now).
 *   now        a booking for now still needs them online (worker/presence) —
 *              hours do not change that.
 *   later      a booking for later (LATER_MIN or more ahead) goes to workers
 *              whose hours cover that time, even if they are offline now —
 *              they hear about it by push — and never to someone whose hours
 *              leave it out or who is off that day. Busy right now does not
 *              matter for later.
 *
 * Times are India time; a day is "YYYY-MM-DD" in India.
 */
const LATER_MIN = 60;
const DAYS = [0, 1, 2, 3, 4, 5, 6];

const ist = (d) => new Date(new Date(d).getTime() + 330 * 60000);
const dayKey = (d) => ist(d).toISOString().slice(0, 10);
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Is this booking "for later" (so offline workers whose hours cover it may take it)? */
const isLater = (at) => !!at && new Date(at).getTime() - Date.now() >= LATER_MIN * 60000;

/**
 * Does this week cover the moment? true / false, or null when the worker has
 * set no hours (no rule — decide as before).
 */
function covers(hours, at) {
  if (!hours?.setAt || !at) return null;
  if ((hours.daysOff || []).includes(dayKey(at))) return false;
  const d = ist(at);
  const day = (hours.week || []).find((w) => w.day === d.getUTCDay());
  if (!day?.on) return false;
  const t = d.getUTCHours() * 60 + d.getUTCMinutes();
  const from = minutesOf(day.from); const to = minutesOf(day.to);
  return to > from ? t >= from && t < to : t >= from || t < to; // past midnight, e.g. 20:00–02:00
}

/** For a booking time: may this worker be offered it? Online-now status only matters for "now". */
function availableFor(worker, at, { live }) {
  if (!isLater(at)) return live;
  const c = covers(worker?.workHours, at);
  if (c === false) return false;
  // Inside their hours: offline is fine, unless they asked for later work only while online.
  if (c === true) return worker.workHours.acceptLater === false ? live : true;
  return live; // no hours set: as before
}

/** A clean week from what the worker sent. */
function clean({ week = [], daysOff = [], acceptLater = true }) {
  const ok = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
  return {
    setAt: new Date(),
    acceptLater: acceptLater !== false,
    week: DAYS.map((day) => {
      const w = week.find((x) => Number(x.day) === day) || {};
      return { day, on: !!w.on, from: ok(w.from) ? w.from : '09:00', to: ok(w.to) ? w.to : '18:00' };
    }),
    daysOff: [...new Set(daysOff.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= dayKey(new Date())))].sort().slice(0, 60),
  };
}

module.exports = { covers, availableFor, isLater, clean, dayKey, LATER_MIN };
