import { useState } from 'react';
import { useAdminInsightsMoneyQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, TrendChart, StackedDays, Findings, Panel, RankBars, rupees, count } from './charts';

const SOURCES = [
  { key: 'commissionPaise', label: 'Commission', note: 'Our cut of each finished job', color: '#1F4FD8' },
  { key: 'platformFeePaise', label: 'Platform fee', note: 'Paid by customers per booking', color: '#10B981' },
  { key: 'surgePaise', label: 'Surge', note: 'Our share of surge, rain and night fees', color: '#F59E0B' },
  { key: 'cancellationPaise', label: 'Cancellation fees', note: 'Our share of collected fees', color: '#E11D48' },
  { key: 'penaltyPaise', label: 'Partner penalties', note: 'No-shows and handed-back jobs', color: '#64748B' },
  { key: 'errandPassPaise', label: 'Errand passes', note: 'Runner passes, less refunds', color: '#8B5CF6' },
  { key: 'subscriptionPaise', label: 'Subscriptions', note: 'Plans customers bought', color: '#0EA5E9' },
];
const exact = (v) => rupees(v, { exact: true });
const longDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export default function MoneyView({ days }) {
  const span = days === 1 ? 30 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsMoneyQuery(span, { skipPollingIfUnfocused: true, pollingInterval: 300000 });
  const [picked, setPicked] = useState(null);
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">Money did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const c = data.current;
  const d = data.delta;
  const day = data.daily.find((x) => x.date === picked) || data.daily[data.daily.length - 1];
  const dayTotal = day ? SOURCES.reduce((s, x) => s + (day[x.key] || 0), 0) : 0;
  const sources = SOURCES.map((x) => ({ ...x, paise: c[x.key] || 0 }));

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">Today is shown in the day breakdown; the charts cover the last 30 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="We earned" value={rupees(c.takePaise)} delta={d.takePaise} accent="#10B981" spark={data.daily.map((x) => x.takePaise)} hint={`${count(c.jobs)} completed jobs`} />
        <Kpi label="Booked value" value={rupees(c.gmvPaise)} delta={d.gmvPaise} spark={data.daily.map((x) => x.gmvPaise)} hint="What customers paid" />
        <Kpi label="Take rate" value={c.takeRate == null ? '-' : `${c.takeRate}%`} hint="What we keep of booked value" />
        <Kpi label="Surge" value={rupees(c.surgePaise)} delta={d.surgePaise} accent="#F59E0B" spark={data.daily.map((x) => x.surgePaise)} hint="Our share of surge fees" />
        <Kpi label="Average order" value={rupees(c.aovPaise)} delta={d.aovPaise} hint={`Providers earned ${rupees(c.providerPaise)}`} />
      </div>

      <Panel title="What we earn per day, by source" note="Tap a day for its full breakdown">
        <StackedDays days={data.daily} parts={SOURCES} format={exact} selected={day?.date} onSelect={setPicked} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={day ? `${longDay(day.date)}, full breakdown` : 'Day breakdown'} note={day ? `${count(day.jobs)} finished jobs, ${exact(day.gmvPaise)} booked` : null}>
          {day && dayTotal ? (
            <table className="w-full text-[13px]">
              <tbody>
                {SOURCES.map((x) => (
                  <tr key={x.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span></td>
                    <td className="py-2 text-right tabular-nums text-slate-400">{Math.round(((day[x.key] || 0) / dayTotal) * 100)}%</td>
                    <td className={`py-2 pl-4 text-right font-semibold tabular-nums ${day[x.key] ? 'text-slate-900' : 'text-slate-300'}`}>{exact(day[x.key])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td className="pt-3 font-semibold text-slate-900">We earned</td><td /><td className="pt-3 pl-4 text-right text-[15px] font-semibold tabular-nums text-slate-900">{exact(dayTotal)}</td></tr>
              </tfoot>
            </table>
          ) : <p className="py-6 text-center text-sm text-slate-400">Nothing earned on this day</p>}
        </Panel>

        <Panel title="Where it comes from" note={`Last ${span} days`}>
          {c.takePaise ? (
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {sources.filter((x) => x.paise > 0).map((x) => <span key={x.key} className="h-full" style={{ width: `${(x.paise / c.takePaise) * 100}%`, background: x.color }} title={x.label} />)}
              </div>
              <dl className="mt-4 space-y-2.5 text-[13px]">
                {sources.map((x) => (
                  <div key={x.key} className="flex items-start justify-between gap-3">
                    <dt className="min-w-0">
                      <span className="flex items-center gap-2 text-slate-700"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />{x.label}</span>
                      <span className="block pl-[18px] text-[11.5px] text-slate-400">{x.key === 'cancellationPaise' ? `We keep ${data.cancelKeepPct}%; the rest goes to the provider shield fund` : x.note}</span>
                    </dt>
                    <dd className="shrink-0 text-right">
                      <span className="font-semibold tabular-nums text-slate-900">{exact(x.paise)}</span>
                      <span className="block text-[11px] tabular-nums text-slate-400">{Math.round((x.paise / c.takePaise) * 100)}%</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[11.5px] text-slate-400">Rates are set in Economics. Tips and boosts go fully to providers and are not counted.</p>
            </div>
          ) : <p className="py-6 text-center text-sm text-slate-400">Nothing earned in this period yet</p>}
        </Panel>
      </div>

      <Panel title="Against the previous period" note={`Last ${span} days against the ${span} before`}>
        <TrendChart days={data.daily} bar="takePaise" barLabel="We earned" prev="prevTakePaise" barFormat={exact}
          line="gmvPaise" lineLabel="Booked value" lineFormat={exact} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="By service" note="Commission and platform fee">
          <RankBars rows={data.byService} value="takePaise" format={(v) => rupees(v)} color="#10B981"
            sub={(s) => `${count(s.jobs)} jobs, ${rupees(s.gmvPaise)} booked, keeps ${s.takeRate ?? '-'}%`} empty="No completed jobs yet" />
        </Panel>
        <Panel title="By area" note="Commission and platform fee">
          <RankBars rows={data.byArea} value="takePaise" format={(v) => rupees(v)} color="#10B981"
            sub={(a) => `${count(a.jobs)} jobs, ${rupees(a.gmvPaise)} booked`} empty="No completed jobs with an area yet" />
        </Panel>
      </div>

      <Panel title="How customers paid" note="Completed jobs">
        <RankBars rows={data.byMethod} value="jobs" sub={(m) => `${rupees(m.gmvPaise)} booked, ${rupees(m.takePaise)} earned`} empty="No completed jobs yet" />
      </Panel>
    </div>
  );
}
