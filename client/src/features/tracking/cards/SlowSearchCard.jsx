import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, Loader2 } from 'lucide-react';
import { useRescheduleJobMutation } from '@shared/services/api';
import { laterSlots, searchStage } from '@shared/customer/searchClock';

/**
 * Nobody free by the deadline (server jobs/fast-assign): said plainly, with the
 * three honest choices. Keep searching (we already are), move it to a later
 * time (jobs/reschedule), or cancel free (the page's own cancel sheet).
 * Shows itself when the search clock reaches the deadline.
 */
export default function SlowSearchCard({ jobId, noun, search, reschedule, onCancel, onMoved }) {
  const [hidden, setHidden] = useState(false);
  const [move, { isLoading }] = useRescheduleJobMutation();
  const [moving, setMoving] = useState(null);
  const [due, setDue] = useState(() => !!search?.toldAt || !!searchStage(search)?.overdue);

  useEffect(() => {
    if (due || !search?.startedAt) return undefined;
    const ms = new Date(search.startedAt).getTime() + search.deadlineSec * 1000 - Date.now();
    const t = setTimeout(() => setDue(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [due, search]);

  if (hidden || !due) return null;
  const slots = reschedule?.allowed ? laterSlots(reschedule.leadMinutes) : [];

  async function later(at) {
    setMoving(at);
    try { const r = await move({ id: jobId, scheduledAt: at }).unwrap(); toast.success(r.message); onMoved?.(); }
    catch (err) { toast.error(err?.data?.error || 'Could not move it. Try again.'); }
    setMoving(null);
  }

  return (
    <div className="rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-100">
      <p className="text-[14px] font-bold text-amber-950">No {noun} is free right now</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-amber-900">
        Everyone nearby is busy. We are still asking, and you can choose what happens next.
      </p>
      {slots.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900"><CalendarClock size={13} /> Book it for later instead</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {slots.map((s) => (
              <button key={s.at} type="button" disabled={isLoading} onClick={() => later(s.at)}
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-800 ring-1 ring-amber-200 disabled:opacity-50">
                {moving === s.at && <Loader2 size={12} className="animate-spin" />} {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setHidden(true)}
          className="h-10 flex-1 rounded-xl bg-amber-900 text-[13px] font-semibold text-white">Keep searching</button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="h-10 flex-1 rounded-xl bg-white text-[13px] font-semibold text-amber-950 ring-1 ring-amber-200">Cancel free</button>
        )}
      </div>
    </div>
  );
}
