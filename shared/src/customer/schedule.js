/**
 * Your schedule, worked out once for the website and the apps: what is
 * happening now, what is booked ahead (in time order, grouped by day), how long
 * until it starts, and a calendar entry for it.
 *
 *   buildSchedule({ active, eventBookings, now })  → { live, ahead, next, days }
 *   active          useMyJobs().active
 *   eventBookings   GET /events/bookings → bookings
 */
const DAY_MS = 86400000;

export const KIND_LABEL = { repair: 'Repair', pet: 'Pet care', helping: 'Helping', order: 'Service', event: 'Event' };

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function dayLabel(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export const timeLabel = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function untilLabel(ms) {
  if (ms <= 0) return 'Starting now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${mm}m`;
  return `in ${mm} min`;
}

/** Only repairs, pet care, helping and older service orders can be moved from here; events cannot. */
export const canMove = (item) => item.kind !== 'event';
export const movesThroughJobs = (item) => ['repair', 'pet', 'helping'].includes(item.kind);

export function buildSchedule({ active = [], eventBookings = [], now = Date.now() }) {
  const items = active.map((j) => {
    const at = j.raw?.scheduledAt || j.raw?.checkInAt || null;
    return {
      key: `${j.kind}-${j.id}`, id: j.id, kind: j.kind, title: j.title, stage: j.stage, reference: j.reference,
      iconCode: j.iconCode, href: j.href, address: j.address, when: at,
      // Booked for later: a time well past when it was booked ("now" bookings carry their own moment).
      later: !!at && new Date(at).getTime() > now - 3600000
        && new Date(at).getTime() - new Date(j.raw?.createdAt || 0).getTime() > 15 * 60000,
    };
  });
  const events = eventBookings
    .filter((b) => b.eventDate && !['cancelled', 'completed'].includes(b.status) && new Date(b.eventDate).getTime() > now - DAY_MS)
    .map((b) => ({
      key: `event-${b._id}`, id: b._id, kind: 'event', title: b.themeId?.title || 'Event décor', iconCode: 'event',
      when: b.eventDate, slot: b.eventTimeSlot, href: `/events/bookings/${b._id}`, later: true, address: b.venue?.address || '',
    }));
  const live = items.filter((i) => !i.later);
  const ahead = [...items.filter((i) => i.later), ...events].sort((a, b) => new Date(a.when) - new Date(b.when));
  const days = [];
  for (const item of ahead.slice(1)) {
    const label = dayLabel(item.when);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(item); else days.push({ label, items: [item] });
  }
  return { live, ahead, next: ahead[0] || null, days };
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const describe = (item) => `${KIND_LABEL[item.kind] || 'Booking'}${item.reference ? ` ${item.reference}` : ''}. Track it in the ZappyOne app.`;

/** An .ics file for the phone's calendar: the booking at its time, one hour long, with a 30-minute reminder. */
export function icsFor(item) {
  const start = new Date(item.when);
  const end = new Date(start.getTime() + 60 * 60000);
  const esc = (s) => String(s || '').replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, ' ');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZappyOne//Booking//EN', 'BEGIN:VEVENT',
    `UID:${item.key}@zappyone.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`ZappyOne · ${item.title}`)}`, `DESCRIPTION:${esc(describe(item))}`,
    ...(item.address ? [`LOCATION:${esc(item.address)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Your ZappyOne booking is in 30 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

/** The same booking as a Google Calendar link (phones: opens the calendar app). */
export function calendarLink(item) {
  const start = new Date(item.when);
  const end = new Date(start.getTime() + 60 * 60000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: `ZappyOne · ${item.title}`, dates: `${stamp(start)}/${stamp(end)}`, details: describe(item), ...(item.address && { location: item.address }) });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
