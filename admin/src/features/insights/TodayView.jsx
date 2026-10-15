import { useAdminInsightsOverviewQuery, useAdminInsightsLiveQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, TrendChart, RankBars, Findings, Panel, LiveNow, rupees, count, minutes, Delta } from './charts';

/**
 * Today: is the business healthy? Bookings, money and service quality for the
 * chosen period beside the one before it, then where it comes from: each
 * service and each area. Read from repair, pet, helping and event bookings.
 */
const ROUND = (n) => (n == null ? '—' : `${n}%`);

export default function TodayView({ days }) {
  const { data, isLoading, isError, refetch } = useAdminInsightsOverviewQuery(days, { pollingInterval: 120000 });
  const { data: live } = useAdminInsightsLiveQuery(undefined, { pollingInterval: 15000 });
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">These numbers did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const c = data.current;
  const p = data.previous;
  const d = data.delta;
  const series = data.daily;
  const cancelChange = c.cancelRate != null && p.cancelRate != null ? Math.round((c.cancelRate - p.cancelRate) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <LiveNow data={live} />
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Bookings" value={count(c.bookings)} delta={d.bookings} spark={series.map((x) => x.bookings)} hint={`${count(c.active)} in progress now`} />
        <Kpi label="Completed" value={count(c.completed)} delta={d.completed} spark={series.map((x) => x.completed)} />
        <Kpi label="Booked value" value={rupees(c.gmvPaise)} delta={d.gmvPaise} spark={series.map((x) => x.gmvPaise)} hint="Completed jobs, what customers paid" />
        <Kpi label="We earned" value={rupees(c.takePaise)} delta={d.takePaise} spark={series.map((x) => x.takePaise)} accent="#10B981" hint="Commission + platform fee" />
        <Kpi label="Average order" value={rupees(c.aovPaise)} delta={d.aovPaise} hint={`${count(c.customers)} customers`} />
      </div>

      <Panel title="Bookings per day" note={days === 1 ? 'Today, by India time' : `Last ${days} days against the ${days} before`}>
        <TrendChart days={series} bar="bookings" barLabel="Bookings" prev="prevBookings" line="takePaise" lineLabel="We earned" lineFormat={(v) => rupees(v, { exact: true })} />
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard label="Cancelled" value={ROUND(c.cancelRate)} change={cancelChange} invert note={`${count(c.cancelled)} of ${count(c.bookings)} bookings`} />
        <HealthCard label="Time to get a provider" value={minutes(c.medianAssignMin)} note="Half of bookings get one faster" />
        <HealthCard label="Customers who came back" value={ROUND(c.repeatRate)} note={`${count(c.repeatCustomers)} of ${count(c.customers)} had booked before`} />
        <HealthCard label="Earned per booking" value={rupees(c.completed ? c.takePaise / c.completed : 0)} note="On completed jobs" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="By service" note="Sorted by bookings" className="lg:col-span-3">
          {data.byService.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-1 pb-2">Service</th><th className="px-1 pb-2 text-right">Bookings</th><th className="px-1 pb-2 text-right">Done</th>
                    <th className="px-1 pb-2 text-right">Cancelled</th><th className="px-1 pb-2 text-right">To provider</th><th className="px-1 pb-2 text-right">We earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byService.map((s) => (
                    <tr key={s.key}>
                      <td className="px-1 py-2.5 font-medium text-slate-800">{s.label}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums"><span className="font-semibold text-slate-900">{count(s.bookings)}</span>
                        {s.prevBookings ? <span className="ml-1.5"><Delta value={Math.round(((s.bookings - s.prevBookings) / s.prevBookings) * 100)} /></span> : null}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{count(s.completed)}</td>
                      <td className={`px-1 py-2.5 text-right tabular-nums ${s.cancelRate >= 25 ? 'font-semibold text-rose-600' : 'text-slate-700'}`}>{ROUND(s.cancelRate)}</td>
                      <td className={`px-1 py-2.5 text-right tabular-nums ${s.medianAssignMin > 15 ? 'font-semibold text-amber-600' : 'text-slate-700'}`}>{minutes(s.medianAssignMin)}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{rupees(s.takePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-center text-sm text-slate-400">No bookings in this period yet</p>}
        </Panel>

        <Panel title="By area" note="Top 10" className="lg:col-span-2">
          <RankBars rows={data.byArea.map((a) => ({ ...a, label: a.area }))} value="bookings"
            sub={(a) => `${count(a.completed)} done, ${rupees(a.takePaise)} earned${a.cancelRate >= 25 ? `, ${a.cancelRate}% cancelled` : ''}`}
            empty="No bookings with an area yet" />
        </Panel>
      </div>
    </div>
  );
}

function HealthCard({ label, value, note, change, invert }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        {change != null && <Delta value={change} invert={invert} suffix=" pts" />}
      </div>
      <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[11.5px] text-slate-400">{note}</p>}
    </div>
  );
}
