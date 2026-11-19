import { useState } from 'react';
import { Coffee, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMyBusyQuery, useSetBusyMutation } from '../../services/api';
import { BUSY_MINUTES, busyUntilChoices, busyClock } from '../../provider/busyTimes';

// "Busy for 1 h / 2 h / until": stay online with your jobs, but no new offers until then (server jobs/busy).
export default function BusyCard({ className = '' }) {
  const { data, isLoading } = useMyBusyQuery();
  const [setBusy, { isLoading: saving }] = useSetBusyMutation();
  const [picking, setPicking] = useState(false);
  const until = data?.busyUntil ? new Date(data.busyUntil) : null;
  const busy = until && until.getTime() > Date.now();

  async function choose(body) {
    try {
      const res = await setBusy(body).unwrap();
      setPicking(false);
      toast.success(res.message);
    } catch (err) { toast.error(err?.data?.error || 'That did not go through. Try again.'); }
  }

  if (isLoading) return null;
  const chip = 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50';
  return (
    <section className={`rounded-2xl border p-4 ${busy ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${busy ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}><Coffee size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-navy">{busy ? `Busy until ${busyClock(until)}` : 'Need a break?'}</p>
          <p className="text-[12.5px] text-slate-500">{busy ? 'No new jobs ring in. Your current jobs stay with you.' : 'Stay online, keep your jobs, and pause new ones for a while.'}</p>
        </div>
        {saving && <Loader2 size={16} className="mt-1 animate-spin text-slate-400" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {busy ? (
          <button type="button" className="btn-primary px-4 py-2 text-[13px]" disabled={saving} onClick={() => choose({ off: true })}>Take new jobs again</button>
        ) : (
          <>
            {BUSY_MINUTES.map((m) => <button key={m} type="button" className={chip} disabled={saving} onClick={() => choose({ minutes: m })}>{m / 60} hour{m > 60 ? 's' : ''}</button>)}
            <button type="button" className={chip} disabled={saving} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>Until…</button>
          </>
        )}
      </div>
      {picking && !busy && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Busy until">
          {busyUntilChoices().map((t) => <button key={t.getTime()} type="button" className={chip} disabled={saving} onClick={() => choose({ until: t.toISOString() })}>{busyClock(t)}</button>)}
        </div>
      )}
    </section>
  );
}
