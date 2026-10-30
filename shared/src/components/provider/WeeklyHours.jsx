import toast from 'react-hot-toast';
import { DAYS, MINUTE_STEPS, to12Hour, to24Hour, dayLength, incompleteDay, dayOf, withDay, weekdaysLike, meantPm } from './weeklyHoursRules';

export { DAYS, incompleteDay };

function TimeField({ value, onChange, label }) {
  const parts = to12Hour(value);
  const cls = 'rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-[13px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-zappy-500 disabled:opacity-40';
  // Picking an hour on an empty field should not leave it half-set.
  const patch = (next) => onChange(to24Hour({ ...parts, ...next, minute: next.minute ?? parts.minute ?? '00' }));

  return (
    <span className="flex items-center gap-1" role="group" aria-label={label}>
      <select value={parts.hour} onChange={(e) => patch({ hour: e.target.value })} className={cls} aria-label={`${label}, hour`}>
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-xs font-bold text-slate-300">:</span>
      <select value={parts.minute || '00'} disabled={!parts.hour} onChange={(e) => patch({ minute: e.target.value })} className={cls} aria-label={`${label}, minutes`}>
        {MINUTE_STEPS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select value={parts.meridiem} disabled={!parts.hour} onChange={(e) => patch({ meridiem: e.target.value })} className={cls} aria-label={`${label}, AM or PM`}>
        {/* Twelve is where AM/PM truly confuses: a real owner set "8 AM to 12 PM" meaning midnight. */}
        <option value="AM">{parts.hour === '12' ? 'AM (midnight)' : 'AM'}</option>
        <option value="PM">{parts.hour === '12' ? 'PM (noon)' : 'PM'}</option>
      </select>
    </span>
  );
}

/**
 * A shop's opening hours for the week — the one editor for setup and profile.
 *
 *   hours     [{ day: 0-6 (Sun first), opensAt: 'HH:MM', closesAt: 'HH:MM', isClosed }]
 *   onChange  receives the whole new list
 *
 * Times are three plain selects (hour, minute, AM/PM), not <input type="time">:
 * that control's 12/24-hour display follows the browser's locale, so a phone set
 * to 24-hour shows no AM/PM at all, and on a narrow screen it clips the time to
 * a single digit. The value stored is unchanged — "HH:MM", 24-hour — which is
 * what the server validates and compares against.
 */
export default function WeeklyHours({ hours, onChange }) {
  const setDay = (day, patch) => onChange(withDay(hours, day, patch));

  /** Most shops keep one weekday schedule — set it once, not six times. */
  function applyWeekdays() {
    const week = weekdaysLike(hours);
    if (!week) return toast.error('Set one day first, then apply it to the rest');
    onChange(week);
    return toast.success('Applied Monday to Saturday');
  }

  return (
    <div>
      <button type="button" onClick={applyWeekdays} className="text-xs font-bold text-zappy-600">
        Apply one day to Mon–Sat
      </button>
      <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3.5">
        {DAYS.map((label, day) => {
          const row = dayOf(hours, day);
          const len = row.isClosed ? null : dayLength(row.opensAt, row.closesAt);
          const pm = row.isClosed ? null : meantPm(row.opensAt, row.closesAt);
          return (
            /* Day and Open/Closed lead; the times sit beside them on a wide screen and beneath on a phone. */
            <div key={day} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-bold text-slate-600">{label}</span>
                <button
                  type="button"
                  onClick={() => setDay(day, { isClosed: !row.isClosed })}
                  aria-pressed={!row.isClosed}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    row.isClosed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}
                >
                  {row.isClosed ? 'Closed' : 'Open'}
                </button>
                {row.isClosed && <span className="text-[11.5px] text-slate-400">Not open this day</span>}
              </div>
              {!row.isClosed && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <TimeField label={`${label} opens at`} value={row.opensAt} onChange={(v) => setDay(day, { opensAt: v })} />
                  <span className="px-0.5 text-xs text-slate-400">to</span>
                  <TimeField label={`${label} closes at`} value={row.closesAt} onChange={(v) => setDay(day, { closesAt: v })} />
                  {len && (
                    <span className={`w-full text-[11px] font-semibold sm:w-auto ${len.short ? 'text-amber-600' : 'text-slate-400'}`}>
                      {len.overnight ? 'overnight, ' : ''}{len.label}{len.short ? ' - is that right?' : ''}
                    </span>
                  )}
                  {pm && (
                    <button type="button" onClick={() => setDay(day, { closesAt: pm })} className="w-full rounded-lg bg-amber-50 px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 sm:w-auto">
                      Closes next morning at {to12Hour(row.closesAt).hour} AM. Did you mean <span className="underline">{to12Hour(pm).hour}:{to12Hour(pm).minute} PM</span>?
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
