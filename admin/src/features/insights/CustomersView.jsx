import { Star } from 'lucide-react';
import { useAdminInsightsCustomersQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Kpi, TrendChart, Findings, Panel, RankBars, count } from './charts';

/**
 * Customers: do people come back, and are they happy? New against returning
 * customers, monthly cohorts, sign-ups who went on to book, ratings and the
 * latest low ones to follow up.
 */
const pct = (v) => (v == null ? '—' : `${v}%`);

/** A cell in the cohort grid, darker for a higher share coming back. */
function CohortCell({ value }) {
  if (value == null) return <td className="px-1 py-2 text-center text-[12px] text-slate-300">–</td>;
  const a = Math.min(1, value / 60);
  return (
    <td className="px-1 py-1.5 text-center">
      <span className="inline-flex min-w-[52px] justify-center rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums"
        style={{ background: `rgba(31,79,216,${0.08 + a * 0.75})`, color: a > 0.45 ? '#fff' : '#1E3A8A' }}>{value}%</span>
    </td>
  );
}

export default function CustomersView({ days }) {
  const span = days === 1 ? 30 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsCustomersQuery(span, { pollingInterval: 300000 });
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">Customers did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }
  const t = data.totals;

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">Customers are shown for the last 30 days.</p>}
      <Findings items={data.findings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Customers who booked" value={count(t.customers)} spark={data.daily.map((d) => d.customers)} hint={`${count(t.newCustomers)} new, ${count(t.returning)} returning`} />
        <Kpi label="Came back" value={pct(t.repeatRate)} accent="#10B981" spark={data.daily.map((d) => d.returning)} hint="Had booked before this period" />
        <Kpi label="Sign-ups who booked" value={pct(t.activationRate)} hint={`${count(t.activated)} of ${count(t.signups)} new accounts`} />
        <Kpi label="Average rating" value={t.averageRating ?? '—'} hint={`${count(t.reviews)} reviews`} accent="#F59E0B" />
      </div>

      <Panel title="Customers per day" note={`New and returning, last ${span} days`}>
        <TrendChart days={data.daily} bar="newCustomers" barLabel="New customers" line="returning" lineLabel="Returning" sameScale />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Do they come back?" note="Of each month's new customers, the share who booked again" className="lg:col-span-3">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-1 pb-2">First booked</th><th className="px-1 pb-2 text-right">Customers</th>
                  <th className="px-1 pb-2 text-center">Month 1</th><th className="px-1 pb-2 text-center">Month 2</th><th className="px-1 pb-2 text-center">Month 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cohorts.map((c) => (
                  <tr key={c.month}>
                    <td className="px-1 py-1.5 font-medium text-slate-800">{c.month}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-slate-700">{count(c.customers)}</td>
                    {[0, 1, 2].map((k) => <CohortCell key={k} value={c.customers ? c.after[k] ?? null : null} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Ratings" note={`Last ${span} days`} className="lg:col-span-2">
          <RankBars rows={data.ratings.map((r) => ({ ...r, value: r.average }))} value="value" color="#F59E0B"
            format={(v) => `${v} ★`} sub={(r) => `${count(r.reviews)} review${r.reviews === 1 ? '' : 's'}`} empty="No reviews in this period yet" />
        </Panel>
      </div>

      {data.atRisk?.people > 0 && (
        <Panel title="Customers slipping away" note="Had a job done, then nothing for 30 to 120 days">
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-[34px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">{count(data.atRisk.people)}</p>
              <p className="mt-2 text-[12.5px] text-slate-500">past customers to win back. A reminder for the service they last used works best.</p>
            </div>
            <div className="sm:col-span-2">
              <RankBars rows={data.atRisk.byService} value="people" color="#F59E0B" sub={() => 'their last service'} empty="" />
            </div>
          </div>
        </Panel>
      )}

      {data.lowRatings.length > 0 && (
        <Panel title="Low ratings to follow up" note={<a href="?tab=helpdesk&sub=reviews" className="font-semibold text-[#1F4FD8] hover:underline">Open reviews</a>}>
          <ul className="divide-y divide-slate-100">
            {data.lowRatings.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <span className="flex shrink-0 items-center gap-0.5 pt-0.5">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className={n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />)}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="text-slate-800">{r.text || <i className="text-slate-400">No words, stars only</i>}</span>
                  <span className="mt-0.5 block text-[11.5px] text-slate-400">{r.by}, {r.service}, {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
