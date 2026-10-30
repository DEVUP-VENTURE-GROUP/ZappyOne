/**
 * The rules of a shop's weekly hours, platform-free (the websites' WeeklyHours
 * and the apps both read this). Stored as { day: 0-6 (Sun first), opensAt:
 * 'HH:MM', closesAt: 'HH:MM', isClosed }, 24-hour, which is what the server
 * validates; shown as 12-hour with AM/PM.
 */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MINUTE_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function to12Hour(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return { hour: '', minute: '', meridiem: 'AM' };
  const [h, m] = value.split(':').map(Number);
  return { hour: String(h % 12 === 0 ? 12 : h % 12), minute: String(m).padStart(2, '0'), meridiem: h >= 12 ? 'PM' : 'AM' };
}

export function to24Hour({ hour, minute, meridiem }) {
  if (!hour) return '';
  let h = Number(hour) % 12;
  if (meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${minute || '00'}`;
}

/**
 * The day read back in hours. "8:00 AM to 12:00 PM · 4 hours" makes a slipped
 * AM/PM obvious, where two dropdowns reading "12" and "PM" look fine.
 */
export function dayLength(opensAt, closesAt) {
  const mins = (t) => (/^\d{2}:\d{2}$/.test(t || '') ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
  const from = mins(opensAt);
  const to = mins(closesAt);
  if (from == null || to == null) return null;
  // A closing time at or before opening runs past midnight.
  const span = to > from ? to - from : (24 * 60 - from) + to;
  const h = Math.floor(span / 60);
  const m = span % 60;
  return {
    label: [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min',
    overnight: to <= from,
    // Legal but unusual — and what an AM/PM slip looks like.
    short: span > 0 && span < 180,
  };
}

// A morning closing time that makes the day run overnight, where the same hour in the afternoon would not: almost always AM picked for PM. Returns the PM time to offer, or null.
export function meantPm(opensAt, closesAt) {
  const len = dayLength(opensAt, closesAt);
  if (!len?.overnight) return null;
  const close = Number(closesAt.slice(0, 2));
  if (close < 1 || close > 11) return null;
  const pm = `${String(close + 12).padStart(2, '0')}${closesAt.slice(2)}`;
  return pm > opensAt ? pm : null;
}

// "Opens 10:00 AM", "Opens tomorrow 9:30 AM", "Opens Mon 10:00 AM" from the server's opensNext ({ day, opensAt, daysAhead }).
export function opensLabel(next) {
  if (!next?.opensAt) return null;
  const t = to12Hour(next.opensAt);
  const when = next.daysAhead === 0 ? '' : next.daysAhead === 1 ? 'tomorrow ' : `${DAYS[next.day]} `;
  return `Opens ${when}${t.hour}:${t.minute} ${t.meridiem}`;
}

/** The first open day with no times, if any — check before saving. */
export function incompleteDay(hours) {
  const bad = hours.find((h) => !h.isClosed && (!h.opensAt || !h.closesAt));
  return bad ? DAYS[bad.day] : null;
}


/** Most shops keep Mon-Sat 10 to 9 and close Sunday: where a new shop starts. */
export const DEFAULT_SHOP_HOURS = [
  ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: '10:00', closesAt: '21:00', isClosed: false })),
  { day: 0, opensAt: '', closesAt: '', isClosed: true },
];

/** One day's settings, or that day closed when it was never set. */
export const dayOf = (hours, day) => hours.find((h) => h.day === day) || { day, opensAt: '', closesAt: '', isClosed: true };

/** The week with one day changed (added if it was missing). */
export function withDay(hours, day, patch) {
  const next = [...hours];
  const at = next.findIndex((h) => h.day === day);
  const base = at >= 0 ? next[at] : { day, opensAt: '', closesAt: '', isClosed: false };
  if (at >= 0) next[at] = { ...base, ...patch }; else next.push({ ...base, ...patch });
  return next;
}

/** The first open day with times copied to Mon-Sat, Sunday kept; null when no day is set yet. */
export function weekdaysLike(hours) {
  const template = hours.find((h) => !h.isClosed && h.opensAt && h.closesAt);
  if (!template) return null;
  return [
    ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, opensAt: template.opensAt, closesAt: template.closesAt, isClosed: false })),
    ...hours.filter((h) => h.day === 0),
  ];
}
