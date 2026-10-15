import { useAdminInsightsDemandQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, TrendChart, RankBars, Findings, Panel, count, Delta } from './charts';

/**
 * Demand: what people want, and what we do not give them. Searchers per day
 * (people, not keystrokes), then each service's demand against the providers
 * we have and the bookings it got, then the searches we could not serve.
 */
const pressureTone = (p) => (p == null ? 'text-rose-600' : p >= 10 ? 'text-amber-600' : 'text-slate-700');

export default function DemandView({ days }) {
  const span = days === 1 ? 7 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsDemandQuery(span, { pollingInterval: 120000 });
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">Demand did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const top = data.services[0];
  const series = data.daily.map((x) => ({ ...x, served: x.people - x.unserved }));

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">Demand is shown for the last 7 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="People searching" value={count(data.searchers)} spark={series.map((x) => x.people)} hint="One person searching twice is one" />
        <Kpi label="We could serve" value={data.servedRate == null ? '—' : `${data.servedRate}%`} spark={series.map((x) => x.served)} accent="#10B981" />
        <Kpi label="Could not serve" value={count(data.unserved)} spark={series.map((x) => x.unserved)} accent="#E11D48" hint="Nothing matched, or no one there" />
        <Kpi label="Most wanted" value={top ? top.label : '—'} hint={top ? `${count(top.searchers)} people` : 'No searches yet'} />
      </div>

      <Panel title="People searching per day" note={`Last ${span} days`}>
        <TrendChart days={series} bar="people" barLabel="People searching" line="unserved" lineLabel="Could not serve" sameScale />
      </Panel>

      <Panel title="Demand against supply" note="Searchers per provider: where to recruit, Booked: searchers who booked">
        {data.services.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-1 pb-2">Service</th><th className="px-1 pb-2 text-right">Searching</th><th className="px-1 pb-2 text-right">Providers</th>
                  <th className="px-1 pb-2 text-right">Per provider</th><th className="px-1 pb-2 text-right">Booked</th><th className="px-1 pb-2 text-right">Not served</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.services.map((s) => (
                  <tr key={s.lineCode}>
                    <td className="px-1 py-2.5 font-medium text-slate-800">{s.label}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums"><span className="font-semibold text-slate-900">{count(s.searchers)}</span>
                      {s.prevSearchers ? <span className="ml-1.5"><Delta value={Math.round(((s.searchers - s.prevSearchers) / s.prevSearchers) * 100)} /></span> : null}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.providers ? 'text-slate-700' : 'font-semibold text-rose-600'}`}>{s.providers || 'None'}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums font-semibold ${pressureTone(s.pressure)}`}>{s.pressure ?? '—'}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.conversion != null && s.conversion < 10 && s.searchers >= 10 ? 'font-semibold text-amber-600' : 'text-slate-700'}`}>{s.conversion == null ? '—' : s.conversion >= 100 ? '100%+' : `${s.conversion}%`}</td>
                    <td className={`px-1 py-2.5 text-right tabular-nums ${s.unserved ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{count(s.unserved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">No searches in this period yet</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Asked for, not served" note="Add the service, or providers in that city">
          <RankBars rows={data.unservedSearches.map((u) => ({ key: `${u.what}-${u.city}`, label: `“${u.what}”${u.city ? `, ${u.city}` : ''}`, people: u.people }))}
            value="people" color="#E11D48" empty="Everyone who searched found something" />
        </Panel>
        <Panel title="Most searched" note="This week, by people">
          <RankBars rows={data.topSearches.map((t) => ({ key: t.query, label: `“${t.query}”`, people: t.people, today: t.today, unserved: t.unserved }))}
            value="people" sub={(t) => `${t.today} today${t.unserved ? `, ${t.unserved} not served` : ''}`} empty="No typed searches yet" />
        </Panel>
      </div>
    </div>
  );
}
