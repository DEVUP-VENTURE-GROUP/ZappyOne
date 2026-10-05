import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, UserX, Undo2 } from 'lucide-react';
import { useJobGiveBackQuery, useGiveBackJobMutation, useReportCustomerAbsentMutation } from '../services/api';

/** Minutes until a time, rounded up; 0 once it has passed. */
function minsUntil(at, now) {
  return at ? Math.max(0, Math.ceil((new Date(at).getTime() - now) / 60000)) : 0;
}

/**
 * On every accepted job, for every kind (jobs/give-back): hand it back while
 * work has not started, and report the customer absent after the wait at the
 * door. The cost is shown before the provider confirms, worked out by the
 * server for the reason they pick.
 */
export default function GiveBackCard({ jobId, status }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const { data, isFetching } = useJobGiveBackQuery({ id: jobId, reason: reason || 'other', status }, { skip: !jobId });
  const [giveBack, { isLoading: giving }] = useGiveBackJobMutation();
  const [reportAbsent, { isLoading: reporting }] = useReportCustomerAbsentMutation();

  const absent = data?.customerAbsent;
  // The door wait counts down on screen; nothing to poll.
  useEffect(() => {
    if (!absent || absent.open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [absent]);

  if (!data || (!data.canGiveBack && !absent)) return null;
  const quote = data.quote;
  const waitLeft = minsUntil(absent?.opensAt, now);

  async function confirm() {
    if (!reason) return toast.error('Pick a reason first');
    if (reason === 'other' && note.trim().length < 5) return toast.error('Say in a few words why you cannot do it');
    try {
      const out = await giveBack({ id: jobId, reason, note: note.trim() }).unwrap();
      toast.success(out.toShop ? 'Sent back to your shop owner' : 'Handed back. We are finding someone else.');
      nav('/worker/work');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not hand this job back');
    }
  }

  async function customerAbsent() {
    if (!window.confirm('Close this job because the customer is not here? They are charged for the missed visit.')) return;
    try {
      const out = await reportAbsent(jobId).unwrap();
      toast.success(out.message || 'Closed');
      nav('/worker/work');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not close the job');
    }
  }

  return (
    <div className="card space-y-3">
      {absent && (
        <button type="button" onClick={customerAbsent} disabled={(!absent.open && waitLeft > 0) || reporting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
          {reporting ? <Loader2 size={15} className="animate-spin" /> : <UserX size={15} />}
          {absent.open || waitLeft === 0 ? 'Customer not here? Close the job' : `Customer not here? Available in ${waitLeft} min. Call them first.`}
        </button>
      )}

      {data.canGiveBack && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <Undo2 size={15} /> Can&apos;t do this job? Hand it back
        </button>
      )}

      {data.canGiveBack && open && quote && (
        <div className="space-y-2.5">
          <p className="text-sm font-bold text-[#0F172A]">Why can&apos;t you do it?</p>
          <div className="flex flex-wrap gap-2">
            {quote.reasons.map((r) => (
              <button key={r.code} type="button" onClick={() => setReason(r.code)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${reason === r.code ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          {reason === 'other' && (
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
              placeholder="What happened?"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-100" />
          )}
          {reason && (
            <p className={`rounded-xl p-2.5 text-[12px] leading-relaxed ${quote.penaltyPaise > 0 || quote.pauses ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
              {isFetching ? 'Checking…' : quote.message}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setReason(''); setNote(''); }}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Keep the job</button>
            <button type="button" onClick={confirm} disabled={!reason || giving || isFetching}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {giving && <Loader2 size={14} className="animate-spin" />} Hand it back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
