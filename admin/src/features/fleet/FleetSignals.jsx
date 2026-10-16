import { useState } from 'react';
import { AlertOctagon, Eye, Sparkles } from 'lucide-react';
import { useAdminFleetInsightsQuery } from '@shared/services/api';
import { Card, PageLoader, EmptyState } from '../../ui/kit';
import { rupees } from '../insights/charts';
import MonthPicker, { thisMonth } from '@fleet/ui/MonthPicker';
import FleetAiPanel from './FleetAiPanel';

const LEVEL = {
  risk: { label: 'Act now', Icon: AlertOctagon, ring: 'border-red-200 bg-red-50/60', text: 'text-red-800' },
  watch: { label: 'Watch', Icon: Eye, ring: 'border-amber-200 bg-amber-50/60', text: 'text-amber-900' },
  good: { label: 'Going well', Icon: Sparkles, ring: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-800' },
};

// Admin's read of the fleet: the month's headline and what the numbers say to do (server workforce/insights).
export default function FleetSignals() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, isError } = useAdminFleetInsightsQuery(month);
  if (isError) return <EmptyState message="Could not load fleet insights." />;
  if (isLoading || !data) return <PageLoader />;
  const t = data.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <p className="text-[12px] text-slate-500">Hubs, rosters and payroll are run in the Fleet portal. This is the view from above.</p>
      </div>
      {data.ai && <FleetAiPanel month={month} />}
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-slate-100 p-0 sm:grid-cols-4">
        {[
          ['Profit', rupees(t.profitPaise, { exact: true }), t.revenuePaise ? `${Math.round((t.profitPaise / t.revenuePaise) * 100)}% of revenue` : 'No revenue yet'],
          ['Revenue', rupees(t.revenuePaise, { exact: true }), `${t.jobs} jobs`],
          ['Cost per job', t.costPerJobPaise != null ? rupees(t.costPerJobPaise, { exact: true }) : '–', 'Salaries and expenses ÷ jobs'],
          ['Arrival promise', `${data.promise.minutes} min`, `Reachable within about ${data.promise.km.toFixed(1)} km`],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-white px-4 py-3">
            <p className="text-[12px] font-semibold text-slate-500">{label}</p>
            <p className="mt-0.5 text-[20px] font-bold tabular-nums text-slate-900">{value}</p>
            <p className="text-[11.5px] text-slate-500">{sub}</p>
          </div>
        ))}
      </Card>
      {!data.signals.length ? <EmptyState message="Nothing stands out this month." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.signals.map((s) => {
            const L = LEVEL[s.level];
            return (
              <section key={s.title} className={`rounded-xl border p-4 ${L.ring}`}>
                <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${L.text}`}><L.Icon size={13} /> {L.label}</p>
                <p className="mt-1 text-[14px] font-bold text-slate-900">{s.title}</p>
                <p className="mt-0.5 text-[12.5px] text-slate-600">{s.detail}</p>
                <p className="mt-2 text-[12.5px] font-semibold text-slate-800">{s.action}</p>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
