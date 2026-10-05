import { useAdminInsightsFunnelQuery } from '@shared/services/api';
import { PageLoader } from '../../ui/kit';
import { Findings, Panel, FunnelChart, Kpi, count, rupees } from './charts';

/**
 * Funnel: where do customers drop off? People at each step of the period,
 * the share kept from the step before (red under 30%), and per service:
 * searched, booked, completed.
 */
export default function FunnelView({ days }) {
  const span = days === 1 ? 7 : days;
  const { data, isLoading, isError, refetch } = useAdminInsightsFunnelQuery(span, { pollingInterval: 120000 });
  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">The funnel did not load.</p>
        <button type="button" onClick={refetch} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {days === 1 && <p className="text-[12px] text-slate-400">The funnel is shown for the last 7 days.</p>}
      <Findings items={data.findings} />

      <Panel title="From visit to completed job" note={`People, last ${span} days · each step counted on its own`}>
        <FunnelChart steps={data.steps} />
      </Panel>

      {data.quotes?.sent > 0 && (
        <Panel title="Repair quotes" note="After the technician checks the device, the customer approves the price or not">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Quotes sent" value={count(data.quotes.sent)} />
            <Kpi label="Approved" value={data.quotes.approvalRate == null ? count(data.quotes.approved) : `${data.quotes.approvalRate}%`} accent="#10B981" hint={`${count(data.quotes.approved)} · ${rupees(data.quotes.approvedPaise)}`} />
            <Kpi label="Declined" value={count(data.quotes.declined)} />
            <Kpi label="Left to expire" value={count(data.quotes.expired)} hint={`${count(data.quotes.waiting)} still waiting`} />
            <Kpi label="Value lost" value={rupees(data.quotes.lostPaise)} hint="Declined or expired" />
          </div>
        </Panel>
      )}

      <Panel title="By service" note="People who searched, booked and had the job done">
        {data.services.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-1 pb-2">Service</th><th className="px-1 pb-2 text-right">Searched</th><th className="px-1 pb-2 text-right">Booked</th>
                  <th className="px-1 pb-2 text-right">Completed</th><th className="px-1 pb-2 text-right">Booked → done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.services.map((s) => {
                  const done = s.booked ? Math.round((s.completed / s.booked) * 100) : null;
                  return (
                    <tr key={s.lineCode}>
                      <td className="px-1 py-2.5 font-medium text-slate-800">{s.label}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{count(s.searched)}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-slate-900">{count(s.booked)}</td>
                      <td className="px-1 py-2.5 text-right tabular-nums text-slate-700">{count(s.completed)}</td>
                      <td className={`px-1 py-2.5 text-right tabular-nums font-semibold ${done != null && done < 50 ? 'text-rose-600' : 'text-emerald-700'}`}>{done == null ? '—' : `${done}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">No searches or bookings in this period yet</p>}
      </Panel>
    </div>
  );
}
