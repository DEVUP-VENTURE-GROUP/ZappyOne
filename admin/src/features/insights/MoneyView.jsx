import { useAdminInsightsMoneyQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, TrendChart, Findings, Panel, RankBars, rupees, count } from './charts';

/**
 * Money: what makes us money? What customers paid against what we keep
 * (commission and platform fee, shown apart), what providers earned, then
 * per service, per area and by payment method. Completed jobs only.
 */
export default function MoneyView({ days }) {
  const span = days === 1 ? 30 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsMoneyQuery(span, { pollingInterval: 300000 });
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
  const split = c.takePaise ? Math.round((c.commissionPaise / c.takePaise) * 100) : 0;

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">Money is shown for the last 30 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="We earned" value={rupees(c.takePaise)} delta={d.takePaise} accent="#10B981" spark={data.daily.map((x) => x.takePaise)} hint={`${count(c.jobs)} completed jobs`} />
        <Kpi label="Booked value" value={rupees(c.gmvPaise)} delta={d.gmvPaise} spark={data.daily.map((x) => x.gmvPaise)} hint="What customers paid" />
        <Kpi label="Take rate" value={c.takeRate == null ? '-' : `${c.takeRate}%`} hint="What we keep of booked value" />
        <Kpi label="Providers earned" value={rupees(c.providerPaise)} hint="After our commission" />
        <Kpi label="Average order" value={rupees(c.aovPaise)} delta={d.aovPaise} />
      </div>

      <Panel title="What we earn per day" note={`Last ${span} days against the ${span} before`}>
        <TrendChart days={data.daily} bar="takePaise" barLabel="We earned" prev="prevTakePaise" barFormat={(v) => rupees(v, { exact: true })}
          line="gmvPaise" lineLabel="Booked value" lineFormat={(v) => rupees(v, { exact: true })} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Where it comes from" note="Commission and platform fee">
          {c.takePaise ? (
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                <span className="h-full bg-[#1F4FD8]" style={{ width: `${split}%` }} />
                <span className="h-full bg-emerald-500" style={{ width: `${100 - split}%` }} />
              </div>
              <dl className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between"><dt className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm bg-[#1F4FD8]" />Commission from providers</dt><dd className="font-semibold tabular-nums text-slate-900">{rupees(c.commissionPaise, { exact: true })}</dd></div>
                <div className="flex justify-between"><dt className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Platform fee from customers</dt><dd className="font-semibold tabular-nums text-slate-900">{rupees(c.platformFeePaise, { exact: true })}</dd></div>
              </dl>
              <p className="mt-4 text-[11.5px] text-slate-400">Rates are set in Economics.</p>
            </div>
          ) : <p className="py-6 text-center text-sm text-slate-400">No completed jobs in this period yet</p>}
        </Panel>
        <Panel title="By service" note="What we earned">
          <RankBars rows={data.byService} value="takePaise" format={(v) => rupees(v)} color="#10B981"
            sub={(s) => `${count(s.jobs)} jobs, ${rupees(s.gmvPaise)} booked, keeps ${s.takeRate ?? '-'}%`} empty="No completed jobs yet" />
        </Panel>
        <Panel title="By area" note="What we earned">
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
