/**
 * Indian Standard Time, in one place.
 *
 * Every date the platform reasons about is a LOCAL one: a shop's opening hours,
 * a technician's shift, "today's earnings", "this week's bookings". None of them
 * mean anything in UTC, and production runs on a UTC server.
 *
 * The bug this file exists to stop had already shipped twice over:
 *
 *   Shop opening hours were compared against `new Date().getHours()` — the
 *   SERVER's hour. A shop open 09:00–21:00 IST was therefore treated as open
 *   09:00–21:00 UTC, which is 14:30–02:30 IST. It read as closed all morning
 *   and open past midnight, and looked for all the world like the shop had
 *   closed itself on refresh.
 *
 *   The same 330-minute offset was then written again, privately, inside the
 *   intelligence dashboard — so the two could drift, and a third copy was one
 *   feature away.
 *
 * India has a single timezone and has never observed daylight saving, so a
 * fixed offset is correct here in a way it would not be for most countries.
 */

/** Minutes IST runs ahead of UTC, as milliseconds. */
const IST_OFFSET = 330 * 60_000;

/** The same instant, shifted so UTC getters read as IST wall-clock values. */
function toIst(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET);
}

/** Wall-clock parts in India, whatever the server's own timezone is. */
function istParts(d = new Date()) {
  const ist = toIst(d);
  return {
    day: ist.getUTCDay(),            // 0 = Sunday, matching Date#getDay
    hours: ist.getUTCHours(),
    minutes: ist.getUTCMinutes(),
    /** Minutes since midnight — what opening-hour comparisons actually need. */
    minutesOfDay: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

/** Midnight tonight in India, as a real UTC instant for querying Mongo. */
function istDayStart(d = new Date()) {
  const ist = toIst(d);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET);
}

/** Monday 00:00 IST of the current week. */
function istWeekStart(d = new Date()) {
  const start = istDayStart(d);
  const dow = toIst(start).getUTCDay();   // 0 = Sunday
  const back = (dow + 6) % 7;             // days since Monday
  return new Date(start.getTime() - back * 86_400_000);
}

/** The 1st of the current month, 00:00 IST. */
function istMonthStart(d = new Date()) {
  const ist = toIst(d);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET);
}

module.exports = { IST_OFFSET, toIst, istParts, istDayStart, istWeekStart, istMonthStart };
