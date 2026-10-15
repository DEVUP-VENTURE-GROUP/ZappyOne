import { Star } from 'lucide-react';
import { useAdminInsightsSupplyQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, Findings, Panel, rupees, count, minutes } from './charts';

/**
 * Supply: do we have enough providers, in the right places, and do they
 * take the work? Each service's providers against its bookings, then the
 * providers doing the work: completed jobs, earnings, rating, declines.
 */
export default function SupplyView({ days }) {
  const span = days === 1 ? 7 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsSupplyQuery(span, { pollingInterval: 120000 });
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">Supply did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const t = data.totals;

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">Supply is shown for the last 7 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Approved providers" value={count(t.providers)} hint="Shops and workers, per service" />
        <Kpi label="Workers online now" value={count(t.online)} accent="#10B981" />
        <Kpi label="Providers who worked" value={count(t.activeProviders)} hint={`Took at least one job, last ${span} days`} />
        <Kpi label="Jobs stuck now" value={count(t.stuckNow)} hint={t.stuckNow ? 'Bookings → Needs intervention' : 'All inside their time limit'} />
      </div>

      <Panel title="Providers per service" note="Bookings per provider: where to recruit">
        {data.services.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-1 pb-2">Service</th><th className="px-1 pb-2 text-right">Providers</th><th className="px-1 pb-2 text-right">Online</th>
                  <th className="px-1 pb-2 text-right">Bookings</th><th className="px-1 pb-2 text-right">Per provider</th><th className="px-1 pb-2 text-right">To provider</th><th className="px-1 pb-2 text-right">Stuck now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.services.map((s) => (
                  <tr key={s.lineCode}>
                    <td className="px-1 py-2.5 font-medium text-slate-800">{s.label}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.providers ? 'text-slate-900' : 'font-semibold text-rose-600'}`}>
                      {s.providers ? <>{s.providers}<span className="ml-1 text-[11px] text-slate-400">{s.shops ? `${s.shops} shop${s.shops > 1 ? 's' : ''}` : ''}{s.shops && s.workers ? ', ' : ''}{s.workers ? `${s.workers} worker${s.workers > 1 ? 's' : ''}` : ''}</span></> : 'None'}
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{count(s.online)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-slate-900">{count(s.bookings)}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.perProvider >= 8 ? 'font-semibold text-amber-600' : 'text-slate-700'}`}>{s.perProvider ?? '—'}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.medianAssignMin > 15 ? 'font-semibold text-amber-600' : 'text-slate-700'}`}>{minutes(s.medianAssignMin)}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.stuck ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{count(s.stuck)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">No approved providers yet</p>}
      </Panel>

      <Panel title="Who is doing the work" note={`Top providers, last ${span} days`}>
        {data.providers.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-1 pb-2">Provider</th><th className="px-1 pb-2 text-right">Completed</th><th className="px-1 pb-2 text-right">They earned</th>
                  <th className="px-1 pb-2 text-right">Rating</th><th className="px-1 pb-2 text-right">Passed on</th><th className="px-1 pb-2 text-right">Dropped</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.providers.map((p) => (
                  <tr key={p.id}>
                    <td className="px-1 py-2.5">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-slate-500">{p.kind}</span>
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-slate-900">{count(p.completed)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums text-emerald-700">{rupees(p.earnedPaise)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">
                      {p.rating ? <span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400" />{Number(p.rating).toFixed(1)}<span className="text-[11px] text-slate-400">({p.reviews})</span></span> : '—'}
                    </td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${p.declines >= 5 ? 'font-semibold text-amber-600' : 'text-slate-700'}`}>{count(p.declines)}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${p.dropped ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{count(p.dropped)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">No provider has taken a job in this period yet</p>}
      </Panel>
    </div>
  );
}
