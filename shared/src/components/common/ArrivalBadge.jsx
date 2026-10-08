import { Zap, Clock } from 'lucide-react';

/**
 * How soon someone can be at the door — the one way every screen says it.
 * The 10-minute mark shows only when the estimate is inside it (jobs/arrival
 * PROMISE_MIN); otherwise the honest number. Nothing when we do not know.
 */
export default function ArrivalBadge({ minutes, withinPromise, busy = false, compact = false, className = '' }) {
  if (minutes == null) return null;
  const label = minutes >= 90 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  if (withinPromise && !busy) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white ${className}`}>
        <Zap size={11} className="fill-white" /> {compact ? `~${label}` : `Arrives in ~${label}`}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ${className}`}>
      <Clock size={11} /> {compact ? `~${label}` : `Can reach you in ~${label}`}
    </span>
  );
}
