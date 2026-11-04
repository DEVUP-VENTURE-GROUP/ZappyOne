import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, CircleCheck } from 'lucide-react';
import { useAdminIssuesQuery, useAdminOpsAlertDoneMutation } from '@shared/services/api';
import { Card, EmptyState, fmtDate } from '../../ui/kit';

const label = (s = '') => s.replace(/_/g, ' ');

// Bookings -> Issues: everything raised on a booking (server admin-portal/booking-issues), open first; a row opens its booking.
export default function IssuesList({ onOpenBooking }) {
  const [state, setState] = useState('open');
  const [type, setType] = useState('');
  const [before, setBefore] = useState(null);
  const { data, isFetching, isError } = useAdminIssuesQuery({ state, ...(type && { type }), ...(before && { before }) }, { pollingInterval: 30000 });
  const [markDone, { isLoading: closing }] = useAdminOpsAlertDoneMutation();
  const rows = data?.rows || [];

  async function done(a) {
    try { await markDone({ id: a.id }).unwrap(); toast.success('Marked done'); } catch (err) { toast.error(err?.data?.error || 'Could not mark it done. Try again.'); }
  }
  const pick = (fn) => (v) => { fn(v); setBefore(null); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[['open', `Open${data ? ` (${data.open})` : ''}`], ['done', 'Done'], ['all', 'All']].map(([id, text]) => (
          <button key={id} type="button" onClick={() => pick(setState)(id)} aria-pressed={state === id}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${state === id ? 'bg-zappy-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{text}</button>
        ))}
        <select value={type} onChange={(e) => pick(setType)(e.target.value)} aria-label="Issue type"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
          <option value="">Every type</option>
          {(data?.types || []).map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
      </div>

      <Card className="divide-y divide-slate-100 p-0">
        {isError && <EmptyState message="Could not load issues. Refresh to try again." />}
        {!isError && !rows.length && !isFetching && <EmptyState message={state === 'open' ? 'No open issues. Everything raised has been handled.' : 'Nothing here yet.'} />}
        {rows.map((a) => (
          <div key={a.id} className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50">
            <button type="button" disabled={!a.job} onClick={() => a.job && onOpenBooking(a.job.kind, a.job.id)}
              className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default">
              {a.doneAt ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.urgent ? 'text-red-600' : 'text-amber-500'}`} />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{a.title}</span>
                {a.body && <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-600">{a.body}</span>}
                <span className="mt-1 block text-[11.5px] tabular-nums text-slate-400">
                  {label(a.type)} · {fmtDate(a.at)}{a.job?.reference ? ` · ${a.job.reference}` : ''}{a.doneAt ? ` · done ${fmtDate(a.doneAt)}` : ''}
                </span>
              </span>
            </button>
            {!a.doneAt && (
              <button type="button" onClick={() => done(a)} disabled={closing} aria-label={`Mark done: ${a.title}`}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11.5px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">
                <Check size={12} /> Done
              </button>
            )}
          </div>
        ))}
      </Card>
      {data?.next && (
        <button type="button" onClick={() => setBefore(data.next)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">Older</button>
      )}
      {before && <button type="button" onClick={() => setBefore(null)} className="ml-2 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500">Back to newest</button>}
    </div>
  );
}

// One booking's issues in its drawer: the payment story, reports, and alerts with who closed them.
export function BookingIssues({ issues }) {
  if (!issues || (!issues.payment?.length && !issues.reports?.length && !issues.alerts?.length)) return null;
  const items = [
    ...issues.payment.map((p) => ({ at: p.at, text: p.what, tone: 'text-slate-800' })),
    ...issues.reports.map((r) => ({ at: r.at, text: `${r.label}${r.note ? `: ${r.note}` : ''}${r.resolvedAt ? ` (resolved: ${label(r.resolution || 'closed')})` : ''}`, tone: r.resolvedAt ? 'text-slate-500' : 'text-red-700' })),
    ...issues.alerts.map((a) => ({ at: a.at, text: `${a.title}${a.doneAt ? ` (done ${fmtDate(a.doneAt)})` : ' (open)'}`, tone: a.doneAt ? 'text-slate-500' : 'text-amber-700' })),
  ].sort((x, y) => new Date(x.at) - new Date(y.at));
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Issues</p>
      <ol className="space-y-2 border-l border-amber-200 pl-3">
        {items.map((it, i) => (
          <li key={i}>
            <p className={`text-xs font-semibold ${it.tone}`}>{it.text}</p>
            <p className="text-[11px] tabular-nums text-slate-400">{fmtDate(it.at)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
