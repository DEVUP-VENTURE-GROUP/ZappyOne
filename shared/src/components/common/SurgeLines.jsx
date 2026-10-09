import { useEffect, useState } from 'react';
import { Flame, CloudRain, Moon, Clock, CalendarDays, Info } from 'lucide-react';
import { useSurgeQuoteQuery } from '../../services/api';
import { formatPaise } from '../../utils/money';

/**
 * What is added to a price right now (jobs/surge): Surge fee, Rain fee,
 * Late-night fee — plain names; tap a line for why. The amounts are held for a
 * few minutes (the lock); the booking pays exactly these.
 *
 * useSurge() fetches the quote for a price screen; <SurgeLines> shows it.
 * Pass the quote's id with the booking (surgeQuoteId) and its base (surgeBasePaise).
 */
const ICON = { surge: Flame, busy: Flame, peak: Clock, weekend: CalendarDays, rain: CloudRain, night: Moon };
const TONE = { surge: 'text-orange-600', busy: 'text-orange-600', peak: 'text-amber-600', weekend: 'text-violet-600', rain: 'text-sky-600', night: 'text-indigo-600' };

export function useSurge({ kind, line, vertical, serviceMode, loc, basePaise, skip = false }) {
  const ok = !skip && !!kind && typeof loc?.lat === 'number' && basePaise != null;
  const { data, refetch, isFetching } = useSurgeQuoteQuery(
    { kind, line, vertical, serviceMode, lat: loc?.lat, lng: loc?.lng, basePaise: Math.round(basePaise || 0) },
    { skip: !ok },
  );
  // The lock runs out: fetch a fresh one rather than book on a stale price.
  useEffect(() => {
    if (!data?.expiresAt) return undefined;
    const ms = new Date(data.expiresAt).getTime() - Date.now() - 15000;
    const t = setTimeout(() => refetch(), Math.max(5000, ms));
    return () => clearTimeout(t);
  }, [data?.expiresAt, refetch]);
  const quote = ok ? data : null;
  return {
    quote,
    totalPaise: quote?.totalPaise || 0,
    /** Fields for the booking request. */
    bookingFields: quote?.quoteId ? { surgeQuoteId: quote.quoteId, surgeBasePaise: Math.round(basePaise || 0) } : {},
    refetch,
    isFetching,
  };
}

export default function SurgeLines({ quote, className = '' }) {
  const [open, setOpen] = useState(null);
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!quote?.expiresAt) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [quote?.expiresAt]);
  if (!quote?.lines?.length) return null;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {quote.lines.map((l) => {
        const Icon = ICON[l.type] || Flame;
        return (
          <div key={l.type}>
            <button type="button" onClick={() => setOpen(open === l.type ? null : l.type)} className="flex w-full items-center justify-between gap-2 text-left">
              <span className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${TONE[l.type] || 'text-orange-600'}`}>
                <Icon size={13} /> {l.label} <Info size={11} className="text-slate-300" />
              </span>
              <span className="text-[12.5px] font-bold tabular-nums text-slate-800">+{formatPaise(l.paise)}</span>
            </button>
            {open === l.type && <p className="pl-5 text-[11.5px] text-slate-500">{l.reason}</p>}
          </div>
        );
      })}
      {left != null && left > 0 && (
        <p className="text-[11px] text-slate-400">Price held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
      )}
    </div>
  );
}

/** A booking request was refused because the price moved: true when handled (quote refreshed). */
export function surgeChanged(err, refetch) {
  if (err?.data?.code !== 'SURGE_CHANGED') return false;
  refetch?.();
  return true;
}
