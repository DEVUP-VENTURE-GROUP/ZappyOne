import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Zap } from 'lucide-react';
import { useBoostJobMutation } from '@shared/services/api';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
/** Offered once the search has run this long without anyone accepting. */
const AFTER_SEC = 60;

/**
 * While we are still finding someone: the customer may add a little for a
 * faster match. Optional and quiet; all of it goes to whoever takes the job,
 * and it is paid with the booking (nothing if they cancel before anyone
 * accepts). The amounts are set in Admin → Economics → Boost & tips.
 */
export default function JobBoostCard({ jobId, boost, since, noun, onBoosted }) {
  const [boostJob, { isLoading }] = useBoostJobMutation();
  const [picked, setPicked] = useState(null);
  const [now, setNow] = useState(Date.now());
  const opensAt = (since ? new Date(since).getTime() : 0) + AFTER_SEC * 1000;

  useEffect(() => {
    if (now >= opensAt) return undefined;
    const t = setTimeout(() => setNow(Date.now()), Math.max(1000, opensAt - now));
    return () => clearTimeout(t);
  }, [now, opensAt]);

  if (!boost?.available || (!boost.currentPaise && now < opensAt)) return null;

  async function confirm() {
    try {
      const r = await boostJob({ id: jobId, amountPaise: picked * 100 }).unwrap();
      toast.success(r.message);
      setPicked(null);
      onBoosted?.();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not add that. Try again.');
    }
  }

  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-slate-100">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Zap size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-navy">
            {boost.currentPaise ? `You added ${rupees(boost.currentPaise)}` : `Taking a little longer to find a ${noun}`}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
            Add a little extra and we will tell everyone nearby again. All of it goes to whoever takes the job, and you pay it with the booking.
          </p>
        </div>
      </div>
      {boost.options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {boost.options.map((r) => (
            <button key={r} type="button" onClick={() => setPicked(r)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${picked === r ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-slate-200 text-slate-700'}`}>
              +₹{r}
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[12.5px] text-slate-600">Add <b>₹{picked}</b> to this booking?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked(null)} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-500">No</button>
            <button type="button" onClick={confirm} disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-zappy-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
              {isLoading && <Loader2 size={13} className="animate-spin" />} Add it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
