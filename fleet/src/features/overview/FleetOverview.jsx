import { useState } from 'react';
import { useAdminFleetOverviewQuery } from '@shared/services/api';
import { PageLoader, EmptyState } from '@admin/ui/kit';
import { Kpi, Panel, RankBars, TrendChart, rupees, count } from '@admin/features/insights/charts';
import FleetAttention from './FleetAttention';

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']];

/**
 * Fleet overview (server workforce/analytics): the own fleet run like
 * quick-commerce dark stores. Money first (revenue, profit, cost per job),
 * then people (staff, on duty, attendance, utilisation), then the store
 * (stock value, low stock), with the month day by day and hub by hub.
 */
export default function FleetOverview() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useAdminFleetOverviewQuery(days);
  if (isError) return <EmptyState message="Could not load the fleet overview. Refresh to try again." />;
  if (isLoading || !data) return <PageLoader />;
  const k = data.kpis;
  const series = data.days.map((d) => ({ ...d, date: d.day, costPaise: d.salaryPaise + d.expensesPaise }));
  const spark = (key) => series.map((d) => d[key]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">{k.hubs} hubs, {k.staff} staff, <b className="text-emerald-600">{k.onDutyNow} on duty now</b></p>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {RANGES.map(([d, label]) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      <FleetAttention />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue" value={rupees(k.revenuePaise)} delta={k.revenueDelta} spark={spark('revenuePaise')} hint="Staff jobs, all of it ZappyOne's" />
        <Kpi label="Profit" value={rupees(k.profitPaise)} delta={k.profitDelta} spark={spark('profitPaise')} accent="#059669" hint="Revenue − salaries − expenses" />
        <Kpi label="Jobs done" value={count(k.jobs)} delta={k.jobsDelta} spark={spark('jobs')} hint={k.avgJobPaise ? `${rupees(k.avgJobPaise)} a job on average` : 'No jobs yet'} />
        <Kpi label="Cost per job" value={k.costPerJobPaise != null ? rupees(k.costPerJobPaise) : '–'} invert hint="Salaries and expenses per job" accent="#D97706" />
        <Kpi label="Attendance" value={k.attendancePct != null ? `${k.attendancePct}%` : '–'} hint="Shifts worked of shifts booked" accent="#7C3AED" />
        <Kpi label="Jobs per shift" value={k.jobsPerShift ?? '–'} hint="How busy staff are on duty" />
        <Kpi label="Cash with staff" value={rupees(k.cashWithStaffPaise)} hint="Collected, not yet deposited" accent="#D97706" />
        <Kpi label="Stock value" value={rupees(k.stockValuePaise)} hint={k.lowStock ? `${k.lowStock} item${k.lowStock === 1 ? '' : 's'} low` : 'Nothing low'} accent="#0891B2" />
      </div>

      <Panel title="Revenue and cost, day by day" note="Bars: revenue. Line: salaries + expenses.">
        <TrendChart days={series} bar="revenuePaise" barLabel="Revenue" line="costPaise" lineLabel="Cost" barFormat={rupees} lineFormat={rupees} sameScale />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Revenue by hub" note={`Last ${days} days`}>
          <RankBars rows={data.hubs} value="revenuePaise" format={rupees}
            sub={(h) => `${h.jobs} jobs, ${h.staff} staff, profit ${rupees(h.profitPaise)}${h.costPerJobPaise != null ? `, ${rupees(h.costPerJobPaise)} a job` : ''}`} empty="No hubs yet" />
        </Panel>
        <Panel title="Jobs done, day by day">
          <TrendChart days={series} bar="jobs" barLabel="Jobs" height={200} />
        </Panel>
        <Panel title="Attendance by hub" note="Shifts worked of shifts booked">
          <RankBars rows={data.hubs.filter((h) => h.attendancePct != null)} value="attendancePct" format={(v) => `${v}%`} color="#7C3AED"
            sub={(h) => `${h.worked} worked, ${h.missed} missed`} empty="No shifts yet" />
        </Panel>
        <Panel title="Where the money goes" note="Expenses by kind, stock purchases included">
          <RankBars rows={data.expenseByCategory} value="paise" format={rupees} color="#D97706" empty="No expenses recorded" />
        </Panel>
      </div>
    </div>
  );
}
