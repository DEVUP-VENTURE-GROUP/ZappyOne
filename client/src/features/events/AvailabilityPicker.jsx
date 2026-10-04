import { useMemo } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { useEventThemeAvailabilityQuery } from '@shared/services/api';

/**
 * Pick a day and a time from what this partner can actually do: days they
 * blocked are off, slots already booked are off, and nothing earlier than the
 * notice the platform needs. The booking re-checks all of it on the server.
 */
const SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM'];
const DAYS_SHOWN = 45;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 24h start time of a slot, for the notice check. */
function slotDate(dateStr, slot) {
  const [time, ap] = slot.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m || 0, 0, 0);
  return d;
}

export default function AvailabilityPicker({ themeId, date, slot, onDate, onSlot }) {
  const { data, isLoading } = useEventThemeAvailabilityQuery(themeId, { skip: !themeId });
  const noticeMs = (data?.minAdvanceBookingHours ?? 24) * 3_600_000;
  const blocked = useMemo(() => new Set(data?.blockedDates || []), [data]);
  const taken = useMemo(() => {
    const m = new Map();
    for (const t of data?.taken || []) m.set(t.date, new Set([...(m.get(t.date) || []), t.slot]));
    return m;
  }, [data]);

  const days = useMemo(() => {
    const out = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = 0; i < DAYS_SHOWN; i += 1) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = ymd(d);
      const anySlot = SLOTS.some((s) => slotDate(key, s).getTime() - Date.now() >= noticeMs && !(taken.get(key)?.has(s)));
      out.push({ d, key, off: blocked.has(key) || !anySlot, why: blocked.has(key) ? 'Unavailable' : !anySlot ? 'Full' : '' });
    }
    return out;
  }, [blocked, taken, noticeMs]);

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-white p-4">
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-900"><CalendarDays size={18} className="text-zappy-600" /> Pick a date</p>
        {isLoading ? <p className="mt-3 text-[14px] text-ink-500">Checking availability…</p> : (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="listbox" aria-label="Dates">
            {days.map(({ d, key, off, why }) => {
              const on = key === date;
              return (
                <button key={key} type="button" role="option" aria-selected={on} disabled={off}
                  onClick={() => { onDate(key); if (slot && (taken.get(key)?.has(slot) || slotDate(key, slot).getTime() - Date.now() < noticeMs)) onSlot(''); }}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-btn border py-2 ${on ? 'border-zappy-600 bg-zappy-600 text-white' : off ? 'border-line bg-sunken text-ink-300' : 'border-line bg-white text-ink-900 hover:border-line-strong'}`}>
                  <span className="text-[11px] font-semibold uppercase">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                  <span className="text-[19px] font-bold leading-tight">{d.getDate()}</span>
                  <span className="text-[10px]">{why || d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-white p-4">
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink-900"><Clock size={18} className="text-zappy-600" /> Pick a time</p>
        {!date ? <p className="mt-3 text-[14px] text-ink-500">Choose a date first.</p> : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SLOTS.map((s) => {
              const off = taken.get(date)?.has(s) || slotDate(date, s).getTime() - Date.now() < noticeMs;
              const on = s === slot;
              return (
                <button key={s} type="button" disabled={off} onClick={() => onSlot(s)} aria-pressed={on}
                  className={`min-h-[44px] rounded-btn border text-[13px] font-semibold ${on ? 'border-zappy-600 bg-zappy-600 text-white' : off ? 'border-line bg-sunken text-ink-300 line-through' : 'border-line bg-white text-ink-900 hover:border-line-strong'}`}>
                  {s}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[12px] text-ink-500">Booked at least {Math.round(noticeMs / 3_600_000)} hours ahead, so the team can prepare.</p>
      </section>
    </div>
  );
}
