import { Loader2 } from 'lucide-react';
import { useJobArrivalQuery } from '../../services/api';
import ArrivalBadge from './ArrivalBadge';

/**
 * Before booking: how soon the nearest verified provider for this service can
 * reach this spot (jobs/arrival). Said plainly when nobody is free right now —
 * the booking still goes out and the customer is told when someone is near.
 */
export default function NearestArrival({ line, loc, noun = 'provider', className = '' }) {
  const skip = !line || typeof loc?.lat !== 'number';
  const { data, isFetching } = useJobArrivalQuery({ line, lat: loc?.lat, lng: loc?.lng }, { skip });
  if (skip) return null;
  if (isFetching && !data) {
    return <p className={`flex items-center gap-1.5 text-[12px] text-slate-500 ${className}`}><Loader2 size={12} className="animate-spin" /> Checking who is near…</p>;
  }
  const a = data?.arrival;
  if (!a) {
    return (
      <p className={`rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 ${className}`}>
        No {noun} is free near here right now. Book anyway: we keep looking and tell you the moment someone is near.
      </p>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50/60 px-3 py-2 ${className}`}>
      <ArrivalBadge minutes={a.minutes} withinPromise={a.withinPromise} busy={a.busy} />
      <span className="text-[12px] text-slate-600">
        {a.busy ? `The nearest ${noun} is finishing a job.` : `Nearest ${noun} ~${a.km} km away`}{a.nearby > 1 ? ` · ${a.nearby} nearby` : ''}
      </span>
    </div>
  );
}
