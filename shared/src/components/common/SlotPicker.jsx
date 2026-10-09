import { useMemo, useState } from 'react';

/**
 * Pick a day and a half-hour, from LEAD_MIN ahead to `days` days out, 8 am–8 pm.
 * Used wherever a customer books for later (repair "Later", reschedule).
 * value / onChange: a Date (or null).
 */
const DAY_MS = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const slotLabel = (d) => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function SlotPicker({ value, onChange, days = 7, leadMinutes = 60, fromHour = 8, toHour = 20 }) {
  const slots = useMemo(() => {
    const earliest = Date.now() + leadMinutes * 60000;
    const out = [];
    for (let d = 0; d < days; d += 1) {
      const day = startOfDay(Date.now() + d * DAY_MS);
      const times = [];
      for (let m = fromHour * 60; m <= toHour * 60; m += 30) {
        const t = new Date(day.getTime() + m * 60000);
        if (t.getTime() >= earliest) times.push(t);
      }
      if (times.length) out.push({ day, times });
    }
    return out;
  }, [days, leadMinutes, fromHour, toHour]);
  const [dayIdx, setDayIdx] = useState(() => {
    if (!value) return 0;
    const i = slots.findIndex((s) => s.day.getTime() === startOfDay(value).getTime());
    return i >= 0 ? i : 0;
  });

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {slots.map((s, i) => (
          <button key={s.day.toISOString()} type="button" onClick={() => setDayIdx(i)}
            className={`flex w-[58px] shrink-0 flex-col items-center rounded-2xl border py-1.5 transition ${dayIdx === i ? 'border-zappy-600 bg-zappy-600 text-white' : 'border-slate-200 text-slate-700'}`}>
            <span className={`text-[11px] font-semibold ${dayIdx === i ? 'text-white/80' : 'text-slate-500'}`}>
              {startOfDay(new Date()).getTime() === s.day.getTime() ? 'Today' : s.day.toLocaleDateString('en-IN', { weekday: 'short' })}
            </span>
            <span className="text-[17px] font-bold leading-tight tabular-nums">{s.day.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(slots[dayIdx]?.times || []).map((t) => {
          const on = value && new Date(value).getTime() === t.getTime();
          return (
            <button key={t.toISOString()} type="button" onClick={() => onChange(t)}
              className={`rounded-xl border py-1.5 text-[12.5px] font-semibold tabular-nums ${on ? 'border-zappy-600 bg-zappy-50 text-zappy-700 ring-2 ring-zappy-200' : 'border-slate-200 text-slate-700'}`}>
              {t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
