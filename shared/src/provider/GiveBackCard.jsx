import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, Loader2, ShieldCheck, UserX, Undo2 } from 'lucide-react';
import { useJobGiveBackQuery, useGiveBackJobMutation, useReportCustomerAbsentMutation, useConfirmJobSafeMutation, useAskJobMoreTimeMutation } from '../services/api';
import { minsUntil } from './jobFlows';

// "Are you OK?" after a long time at the customer (server: jobs/safety-check); unanswered, ops is alerted.
function SafetyCheck({ jobId, safety, onDone }) {
  const [confirm, { isLoading }] = useConfirmJobSafeMutation();
  if (!safety?.asked) return null;
  async function safe() {
    try { toast.success((await confirm(jobId).unwrap()).message); onDone(); }
    catch (err) { toast.error(err?.data?.error || 'Could not send. Try again.'); }
  }
  return (
    <div role="alert" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-900">Are you OK?</p>
      <p className="mt-0.5 text-[12px] text-amber-900/80">{safety.escalated ? 'ZappyOne is calling you. Tap below if you are fine.' : 'You have been at the customer for a while. Tap below, or use SOS if you need help.'}</p>
      <button type="button" onClick={safe} disabled={isLoading} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-zappy-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} I'm safe
      </button>
    </div>
  );
}

const clock = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// "This needs longer": pick how long and why; the customer is told the new finish time (server: jobs/more-time).
function MoreTime({ jobId, more, onDone }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [ask, { isLoading }] = useAskJobMoreTimeMutation();
  if (!more?.canAsk && !more?.until) return null;
  async function send() {
    if (!minutes || !reason) return toast.error('Pick how long and why');
    try {
      toast.success((await ask({ id: jobId, minutes, reason, note: note.trim() }).unwrap()).message);
      setOpen(false); setMinutes(0); setReason(''); setNote(''); onDone();
    } catch (err) { toast.error(err?.data?.error || 'Could not tell the customer'); }
  }
  const chip = (on) => `rounded-full border px-3 py-1.5 text-[12px] font-semibold ${on ? 'border-zappy-600 bg-zappy-600 text-white' : 'border-slate-200 text-slate-600'}`;
  return (
    <div className="space-y-2">
      {more.until && <p className="text-[12px] font-semibold text-slate-600">Customer told you finish by about {clock(more.until)}.</p>}
      {more.canAsk && !open && (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600">
          <Clock size={15} /> Needs longer? Tell the customer
        </button>
      )}
      {more.canAsk && open && (
        <div className="space-y-2.5 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1.5">{more.minutes.map((m) => <button key={m} type="button" onClick={() => setMinutes(m)} className={chip(minutes === m)}>{m < 60 ? `${m} min` : `${m / 60} hr`}</button>)}</div>
          <div className="flex flex-wrap gap-1.5">{more.reasons.map((r) => <button key={r.code} type="button" onClick={() => setReason(r.code)} className={chip(reason === r.code)}>{r.label}</button>)}</div>
          {reason === 'other' && <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why it needs longer" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-100" />}
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={isLoading} className="flex-1 rounded-xl bg-zappy-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">{isLoading ? 'Sending…' : 'Tell the customer'}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-white px-4 text-sm font-semibold ring-1 ring-slate-200">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GiveBackCard({ jobId, status }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const { data, isFetching, refetch } = useJobGiveBackQuery({ id: jobId, reason: reason || 'other', status }, { skip: !jobId, pollingInterval: 60000 });
  const [giveBack, { isLoading: giving }] = useGiveBackJobMutation();
  const [reportAbsent, { isLoading: reporting }] = useReportCustomerAbsentMutation();

  const absent = data?.customerAbsent;
  // The door wait counts down on screen; nothing to poll.
  useEffect(() => {
    if (!absent || absent.open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [absent]);

  const safetyCard = <SafetyCheck jobId={jobId} safety={data?.safety} onDone={refetch} />;
  const more = data?.moreTime;
  const moreCard = <MoreTime jobId={jobId} more={more} onDone={refetch} />;
  if (!data || (!data.canGiveBack && !absent)) {
    return data?.safety?.asked || more?.canAsk || more?.until ? <div className="card space-y-3">{safetyCard}{moreCard}</div> : null;
  }
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
      {safetyCard}
      {moreCard}
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
