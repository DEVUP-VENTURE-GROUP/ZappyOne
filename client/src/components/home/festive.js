/**
 * Festive campaign window.
 * ----------------------------------------------------------------------------
 * The festive block had NO date logic. It rendered unconditionally, so a Ganesh
 * Chaturthi takeover owned the entire hero every day of the year — six days
 * after the festival it was still the first thing a visitor saw, pushing the
 * live catalog below the fold.
 *
 * The campaign is declared here, once, and both festive components consult it.
 * Outside the window they render nothing and Home falls through to its normal
 * composition. Nothing about the live catalog is coupled to this.
 *
 * ── MAINTAINING THIS ───────────────────────────────────────────────────────
 * Indian festival dates move every year — they follow the lunar calendar, so
 * Ganesh Chaturthi is not a fixed Gregorian date. `day` below is the date the
 * header already printed on screen ("14th September"); the window opens a few
 * days before for booking lead time and closes shortly after. Both must be
 * updated each year, which is the point of having one place to update.
 */

export const FESTIVE_CAMPAIGN = {
  key: 'ganesh_chaturthi',
  /** The festival day itself, as the header displays it. */
  day: '2026-09-14',
  /** Inclusive start — early enough for people to book ahead. */
  start: '2026-09-07',
  /** Inclusive end. */
  end: '2026-09-16',
};

/**
 * Whether the campaign should be on screen.
 *
 * Compared on calendar dates, not timestamps, so the banner appears for the
 * whole of the start day and stays for the whole of the end day regardless of
 * the visitor's clock time. `now` is injectable for tests.
 */
export function isFestiveActive(now = new Date()) {
  const today = toISODate(now);
  return today >= FESTIVE_CAMPAIGN.start && today <= FESTIVE_CAMPAIGN.end;
}

/** Local calendar date as YYYY-MM-DD — NOT toISOString(), which is UTC and
 *  would flip the banner on or off several hours early in IST. */
function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
